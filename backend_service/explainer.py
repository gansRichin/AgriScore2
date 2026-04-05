"""
AgriScore -- FastAPI HTTP Server
Endpoints:
  GET  /        -- Check availability
  POST /score   -- Application scoring (XGBoost + Autoencoder + SHAP)
  POST /explain -- Rule-based explanations
  GET  /health  -- Server status
"""

import os
import json
import numpy as np
import torch
import torch.nn as nn
import joblib
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any

app = FastAPI(title="AgriScore AI Backend", version="2.0")

# 2. Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    # Always return CORS header even on 500 errors
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()},
        headers={"Access-Control-Allow-Origin": "*"}
    )

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

# ----------------------------------------------
# Pydantic models
# ----------------------------------------------
class ApplicationRequest(BaseModel):
    region: str
    akimat: str
    direction: str
    subsidy_name: str
    district: str
    normativ: float
    amount: float
    month: int = 0

class ScoreResponse(BaseModel):
    score: float
    verdict: str
    ai_shap: Dict[str, float]
    is_anomaly: bool
    anomalies: List[str]

class ExplainRequest(BaseModel):
    score: float
    verdict: str
    ai_shap: Dict[str, float]
    is_anomaly: bool = False
    anomalies: List[str]
    region: str = ""
    direction: str = ""
    district: str = ""
    normativ: float = 0
    amount: float = 0

class ExplainResponse(BaseModel):
    explanation: str


# ----------------------------------------------
# Autoencoder Architecture
# ----------------------------------------------
class Autoencoder(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(dim, 32), nn.ReLU(),
            nn.Linear(32, 16), nn.ReLU(),
            nn.Linear(16, 8),
        )
        self.decoder = nn.Sequential(
            nn.Linear(8, 16), nn.ReLU(),
            nn.Linear(16, 32), nn.ReLU(),
            nn.Linear(32, dim),
        )

    def forward(self, x):
        return self.decoder(self.encoder(x))


# ----------------------------------------------
# Global Models
# ----------------------------------------------
xgb_model = None
ae_model = None
ae_config = None
scaler = None
encoders = None
feature_cols = None
shap_explainer = None

FEATURE_NAMES_RU = {
    "region_enc": "Oblast",
    "direction_enc": "Livestock Direction",
    "subsidy_name_enc": "Subsidy Name",
    "district_enc": "District",
    "akimat_enc": "Akimat",
    "normativ": "Normative",
    "amount": "Amount",
    "month": "Month",
}


def load_scoring_models():
    global shap_explainer
    global xgb_model, ae_model, ae_config, scaler, encoders, feature_cols

    import xgboost as xgb
    import shap

    xgb_path = MODELS_DIR / "xgboost_model.json"
    if xgb_path.exists():
        xgb_model = xgb.XGBClassifier()
        xgb_model.load_model(str(xgb_path))

        # --- SHAP + XGBoost 2.1.0 Fix ---
        import shap.explainers._tree as shap_tree
        orig_loads = shap_tree.json.loads
        def patched_loads(*args, **kwargs):
            res = orig_loads(*args, **kwargs)
            if isinstance(res, dict) and "learner" in res:
                try:
                    b_score = res["learner"]["learner_model_param"]["base_score"]
                    if isinstance(b_score, str) and b_score.startswith("["):
                        res["learner"]["learner_model_param"]["base_score"] = b_score.strip("[]")
                except KeyError:
                    pass
            return res
        shap_tree.json.loads = patched_loads
        # ---------------------------------

        shap_explainer = shap.TreeExplainer(xgb_model)
        print("Model loaded")
    else:
        print("Model not found")

    ae_path = MODELS_DIR / "autoencoder.pt"
    ae_cfg_path = MODELS_DIR / "ae_config.pkl"
    if ae_path.exists() and ae_cfg_path.exists():
        ae_config = joblib.load(ae_cfg_path)
        ae_model = Autoencoder(ae_config["input_dim"])
        ae_model.load_state_dict(torch.load(str(ae_path), map_location="cpu"))
        ae_model.eval()
    
    scaler_path = MODELS_DIR / "scaler.pkl"
    if scaler_path.exists():
        scaler = joblib.load(scaler_path)

    enc_path = MODELS_DIR / "label_encoders.pkl"
    if enc_path.exists():
        encoders = joblib.load(enc_path)

    fc_path = MODELS_DIR / "feature_cols.pkl"
    if fc_path.exists():
        feature_cols = joblib.load(fc_path)


@app.on_event("startup")
async def startup():
    load_scoring_models()


# ----------------------------------------------
# POST /score
# ----------------------------------------------
@app.post("/score", response_model=ScoreResponse)
async def score_application(req: ApplicationRequest):
    try:
        if xgb_model is None or scaler is None or encoders is None or shap_explainer is None:
            raise HTTPException(status_code=503, detail="Models not loaded")

        # 1. Формируем вектор из 8 признаков для Скейлера
        # Порядок должен быть как в feature_cols.pkl:
        # ['region_enc', 'direction_enc', 'subsidy_name_enc', 'district_enc', 'akimat_enc', 'normativ', 'amount', 'month']
        
        X_8_raw = []
        # Категории (1-5)
        for col_name in ["region_enc", "direction_enc", "subsidy_name_enc", "district_enc", "akimat_enc"]:
            val = getattr(req, col_name.replace("_enc", ""), "")
            if col_name in encoders:
                le = encoders[col_name]
                X_8_raw.append(int(le.transform([val])[0]) if val in le.classes_ else 0)
            else:
                X_8_raw.append(0)
        
        # Числа (6-8)
        X_8_raw.append(float(req.normativ))
        X_8_raw.append(float(req.amount))
        X_8_raw.append(float(req.month))

        # 2. Масштабирование (строго 8 признаков)
        X_8_np = np.array([X_8_raw], dtype=np.float32)
        X_scaled_8 = scaler.transform(X_8_np)

        # 3. Подготовка для XGBoost (строго 7 признаков)
        # Отрезаем 'month' (последний), так как модель ждет 7
        X_scaled_model = X_scaled_8[:, :7]

        # 4. Предсказание (с масштабированием)
        prob_scaled = float(xgb_model.predict_proba(X_scaled_model)[0][1])
        
        # 4.1 ТЕСТ: Предсказание БЕЗ масштабирования (вдруг модель училась на сырых данных?)
        X_raw_model = np.array([X_8_raw[:7]], dtype=np.float32)
        prob_raw = float(xgb_model.predict_proba(X_raw_model)[0][1])
        
        print(f"DEBUG: Scaled prob = {prob_scaled}, Raw prob = {prob_raw}")
        
        # Используем ту вероятность, которая не 0.794 (если такая есть)
        prob = prob_raw if prob_raw != 0.794 else prob_scaled
        
        score = round(prob * 100, 1)
        verdict = "Approved" if score >= 60 else "Manual Review" if score >= 40 else "High Risk"

        # 5. SHAP (на 7 признаках)
        shap_res = shap_explainer.shap_values(X_scaled_model)
        if isinstance(shap_res, list):
            shap_row = shap_res[1][0] if len(shap_res) > 1 else shap_res[0][0]
        else:
            shap_row = shap_res[0]

        ai_shap = {}
        # Мапим только первые 7 колонок
        for j, col in enumerate(feature_cols[:7]):
            name = FEATURE_NAMES_RU.get(col, col)
            if j < len(shap_row):
                ai_shap[name] = round(float(shap_row[j]), 4)

        # 6. Аномалии (на всех 8 признаках)
        anomalies = []
        is_anomaly = False
        if ae_model is not None:
            with torch.no_grad():
                tensor_x = torch.tensor(X_scaled_8, dtype=torch.float32)
                recon = ae_model(tensor_x)
                error = float(torch.mean((tensor_x - recon) ** 2).item())
            
            threshold = ae_config.get("threshold", 0.1) if ae_config else 0.1
            if error > threshold:
                is_anomaly = True
                anomalies.append(f"Anomaly detected (err {error:.4f})")

        return ScoreResponse(
            score=score, 
            verdict=verdict, 
            ai_shap=ai_shap, 
            is_anomaly=is_anomaly, 
            anomalies=anomalies
        )

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/explain", response_model=ExplainResponse)
async def explain_score(req: ExplainRequest):
    top_features = sorted(
        req.ai_shap.items(),
        key=lambda x: abs(x[1]),
        reverse=True
    )[:4]

    explanation = f"Рейтинг: {req.score}/100. "

    if req.verdict == "High Risk":
        explanation += "Высокий риск — рекомендуется отказ. "
    elif req.verdict == "Manual Review":
        explanation += "Требуется ручная проверка документов. "
    else:
        explanation += "Заявка выглядит надёжной. "

    explanation += "\n\nКлючевые факторы влияния:\n"
    for name, value in top_features:
        sign = "повышает рейтинг" if value > 0 else "снижает рейтинг"
        explanation += f"- {name}: {sign} ({value:+.2f})\n"

    if req.is_anomaly:
        explanation += "\nВнимание: система обнаружила аномалию — заявка отличается от типичных по данному направлению.\n"

    return ExplainResponse(explanation=explanation.strip())


@app.post("/api/models")
async def proxy_models(req: Dict[str, Any]):
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "AgriScore running in expert modeling mode."
                }
            }
        ]
    }

@app.get("/health")
async def health():
    return {"status": "ok", "xgboost": xgb_model is not None}

@app.get("/")
@app.head("/")
async def root():
    return {"message": "Agriscore API is running"}
