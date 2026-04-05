import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
import joblib
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent / "models"
DATA_PATH = Path("/app/Выгрузка по выданным субсидиям 2025 год (обезлич).xlsx")

def train():
    df = pd.read_excel(DATA_PATH, header=4)
    df.columns = ['num', 'date', 'c2', 'c3', 'region', 'akimat', 'app_num',
                  'direction', 'subsidy_name', 'status', 'normativ', 'amount', 'district']
    df = df[df['status'].notna()].copy()
    df['date'] = pd.to_datetime(df['date'], errors='coerce', dayfirst=True)
    df['month'] = df['date'].dt.month.fillna(0).astype(int)
    df['target'] = (df['status'].str.strip() == 'Исполнена').astype(int)

    cat_cols = ['region', 'direction', 'subsidy_name', 'district', 'akimat']
    encoders = {}
    for col in cat_cols:
        df[col] = df[col].fillna('Unknown').astype(str)
        le = LabelEncoder()
        df[col + '_enc'] = le.fit_transform(df[col])
        encoders[col] = le

    feature_cols = ['region_enc', 'direction_enc', 'subsidy_name_enc',
                    'district_enc', 'akimat_enc', 'normativ', 'amount', 'month']

    df['normativ'] = pd.to_numeric(df['normativ'], errors='coerce').fillna(0)
    df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0)

    X = df[feature_cols].values
    y = df['target'].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

    model = xgb.XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.1,
                               eval_metric='logloss', random_state=42)
    model.fit(X_train, y_train)

    MODELS_DIR.mkdir(exist_ok=True)
    model.save_model(str(MODELS_DIR / "xgboost_model.json"))
    joblib.dump(scaler, MODELS_DIR / "scaler.pkl")
    joblib.dump(encoders, MODELS_DIR / "label_encoders.pkl")
    joblib.dump(feature_cols, MODELS_DIR / "feature_cols.pkl")
    print("✅ Модель обучена и сохранена")

if __name__ == "__main__":
    train()