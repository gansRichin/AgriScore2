"""
AgriScore — FastAPI сервер с локальной Mistral-7B
Эндпоинты:
  POST /score   — скоринг заявки (XGBoost + Autoencoder + SHAP)
  POST /explain — генерация объяснения через Mistral
  GET  /health  — статус сервера
"""

import os
import json
import requests
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

# ──────────────────────────────────────────────
# Pydantic модели
# ──────────────────────────────────────────────
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
    decision: str
    shap_values: Dict[str, float]
    anomalies: List[str]

class ExplainRequest(BaseModel):
    score: float
    decision: str
    shap_values: Dict[str, float]
    anomalies: List[str]
    region: str = ""
    direction: str = ""
    district: str = ""
    normativ: float = 0
    amount: float = 0

class ExplainResponse(BaseModel):
    explanation: str


# ──────────────────────────────────────────────
# Autoencoder архитектура (должна совпадать с train_pipeline.py)
# ──────────────────────────────────────────────
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


# ──────────────────────────────────────────────
# Глобальные модели (загружаются при старте)
# ──────────────────────────────────────────────
xgb_model = None
ae_model = None
ae_config = None
scaler = None
encoders = None
feature_cols = None
shap_explainer = None
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "agriscore"

FEATURE_NAMES_RU = {
    "region_enc": "Область",
    "direction_enc": "Направление животноводства",
    "subsidy_name_enc": "Наименование субсидии",
    "district_enc": "Район хозяйства",
    "akimat_enc": "Акимат",
    "normativ": "Норматив",
    "amount": "Причитающаяся сумма",
    "month": "Месяц подачи",
}


def load_scoring_models():
    """Загрузка XGBoost, Autoencoder, скалера и энкодеров."""
    global shap_explainer
    global xgb_model, ae_model, ae_config, scaler, encoders, feature_cols

    import xgboost as xgb

    xgb_path = MODELS_DIR / "xgboost_model.json"
    if xgb_path.exists():
        xgb_model = xgb.XGBClassifier()
        xgb_model.load_model(str(xgb_path))
        import shap
        shap_explainer = shap.TreeExplainer(xgb_model)
        print(f"✅ XGBoost загружен: {xgb_path}")
    else:
        print(f"⚠️  XGBoost не найден: {xgb_path}")

    ae_path = MODELS_DIR / "autoencoder.pt"
    ae_cfg_path = MODELS_DIR / "ae_config.pkl"
    if ae_path.exists() and ae_cfg_path.exists():
        ae_config = joblib.load(ae_cfg_path)
        ae_model = Autoencoder(ae_config["input_dim"])
        ae_model.load_state_dict(torch.load(str(ae_path), map_location="cpu"))
        ae_model.eval()
        print(f"✅ Autoencoder загружен: {ae_path}")
    else:
        print(f"⚠️  Autoencoder не найден")

    scaler_path = MODELS_DIR / "scaler.pkl"
    if scaler_path.exists():
        scaler = joblib.load(scaler_path)
        print(f"✅ Scaler загружен")

    enc_path = MODELS_DIR / "label_encoders.pkl"
    if enc_path.exists():
        encoders = joblib.load(enc_path)
        print(f"✅ LabelEncoders загружены")

    fc_path = MODELS_DIR / "feature_cols.pkl"
    if fc_path.exists():
        feature_cols = joblib.load(fc_path)
        print(f"✅ Feature cols: {feature_cols}")


def check_ollama():
    """Проверка доступности Ollama."""
    try:
        r = requests.get("http://localhost:11434/")
        if r.status_code == 200:
            print(f"✅ Ollama доступна.")
        else:
            print("⚠️ Ollama вернула странный статус:", r.status_code)
    except Exception as e:
        print(f"⚠️ Ollama недоступна (убедитесь, что она запущена): {e}")


@app.on_event("startup")
async def startup():
    load_scoring_models()
    check_ollama()


# ──────────────────────────────────────────────
# POST /score
# ──────────────────────────────────────────────
@app.post("/score", response_model=ScoreResponse)
async def score_application(req: ApplicationRequest):
    if xgb_model is None or scaler is None or encoders is None or shap_explainer is None:
        raise HTTPException(status_code=503, detail="Модели скоринга не загружены. Запустите train_pipeline.py")

    # Кодируем входные данные
    features = {}
    cat_mapping = {
        "region": req.region,
        "direction": req.direction,
        "subsidy_name": req.subsidy_name,
        "district": req.district,
        "akimat": req.akimat,
    }

    for col, val in cat_mapping.items():
        if col in encoders:
            le = encoders[col]
            if val in le.classes_:
                features[col + "_enc"] = le.transform([val])[0]
            else:
                features[col + "_enc"] = -1  # неизвестная категория
        else:
            features[col + "_enc"] = 0

    features["normativ"] = req.normativ
    features["amount"] = req.amount
    features["month"] = req.month

    X = np.array([[features.get(c, 0) for c in feature_cols]], dtype=np.float32)
    X_scaled = scaler.transform(X)

    # XGBoost предсказание
    prob = float(xgb_model.predict_proba(X_scaled)[0][1])
    score = round(prob * 100, 1)

    decision = "Рекомендовано к одобрению" if score >= 60 else "Требует проверки" if score >= 40 else "Высокий риск"

    # SHAP
    shap_vals = shap_explainer.shap_values(X_scaled)[0]
    shap_dict = {}
    for j, col in enumerate(feature_cols):
        name = FEATURE_NAMES_RU.get(col, col)
        shap_dict[name] = round(float(shap_vals[j]), 4)

    # Autoencoder — аномалии
    anomalies = []
    if ae_model is not None and ae_config is not None:
        with torch.no_grad():
            tensor_x = torch.tensor(X_scaled, dtype=torch.float32)
            recon = ae_model(tensor_x)
            error = float(torch.mean((tensor_x - recon) ** 2).item())
        if error > ae_config["threshold"]:
            anomalies.append(f"Заявка выбивается из нормы (ошибка реконструкции: {error:.4f} > порог {ae_config['threshold']:.4f})")

    return ScoreResponse(score=score, decision=decision, shap_values=shap_dict, anomalies=anomalies)


# ──────────────────────────────────────────────
# POST /explain
# ──────────────────────────────────────────────
@app.post("/explain", response_model=ExplainResponse)
async def explain_score(req: ExplainRequest):
    # Формируем SHAP строку
    sorted_shap = sorted(req.shap_values.items(), key=lambda x: abs(x[1]), reverse=True)
    shap_str = "\n".join([f"  {k}: {'+' if v > 0 else ''}{v}" for k, v in sorted_shap])

    anomalies_str = "\n".join(req.anomalies) if req.anomalies else "Нет выявленных аномалий"

    prompt = (
        f"Статус решения: {req.decision}\n"
        f"Скоринговый балл: {req.score}/100\n"
        f"Область: {req.region}\n"
        f"Направление: {req.direction}\n"
        f"Район: {req.district}\n"
        f"Норматив: {req.normativ}\n"
        f"Сумма: {req.amount}\n"
        f"SHAP-факторы:\n{shap_str}\n"
        f"Аномалии: {anomalies_str}"
    )

    try:
        r = requests.post(
            OLLAMA_API_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False
            },
            timeout=120
        )
        r.raise_for_status()
        data = r.json()
        response_text = data.get("response", "")
        return ExplainResponse(explanation=response_text.strip())
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Ошибка соединения с Ollama: {str(e)}")


# ──────────────────────────────────────────────
# POST /api/models
# ──────────────────────────────────────────────
@app.post("/api/models")
async def proxy_models(req: Dict[str, Any]):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY не установлен на сервере")
        
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            json=req,
            headers=headers,
            timeout=120
        )
        r.raise_for_status()
        return r.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 500
        text = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=status, detail=f"Ошибка вызова модели: {text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка вызова модели: {str(e)}")

# ──────────────────────────────────────────────
# GET /health
# ──────────────────────────────────────────────
@app.get("/health")
async def health():
    ollama_ok = False
    try:
        r = requests.get("http://localhost:11434/")
        ollama_ok = (r.status_code == 200)
    except:
        pass

    return {
        "status": "ok",
        "xgboost": xgb_model is not None,
        "autoencoder": ae_model is not None,
        "ollama": ollama_ok,
    }
