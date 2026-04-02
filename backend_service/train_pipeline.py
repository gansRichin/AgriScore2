"""
AgriScore — Полный пайплайн обучения
1. Загрузка и подготовка данных из Excel
2. Обучение XGBoost (скоринг заявок)
3. Обучение Autoencoder (детекция аномалий)
4. Вычисление SHAP-значений
5. Генерация обучающих примеров для Mistral
6. Скачивание и дообучение Mistral-7B через LoRA (PEFT)
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

# ──────────────────────────────────────────────
# Пути
# ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATA_PATH = PROJECT_DIR / "Выгрузка по выданным субсидиям 2025 год (обезлич).xlsx"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────────
# 1. Загрузка данных
# ──────────────────────────────────────────────
def load_data() -> pd.DataFrame:
    print("=" * 60)
    print("ЭТАП 1: Загрузка данных")
    print("=" * 60)

    df = pd.read_excel(str(DATA_PATH), header=4)

    # Переименуем колонки (убираем лишние пробелы, стандартизируем)
    col_map = {}
    for col in df.columns:
        clean = str(col).strip()
        col_map[col] = clean
    df.rename(columns=col_map, inplace=True)

    # Стандартные имена колонок
    rename = {
        "№ п/п": "id",
        "Дата поступления": "date",
        "Область": "region",
        "Акимат": "akimat",
        "Номер заявки": "app_number",
        "Направление водства": "direction",
        "Наименование субсидирования": "subsidy_name",
        "Статус заявки": "status",
        "Норматив": "normativ",
        "Причитающая сумма": "amount",
        "Район хозяйства": "district",
    }

    # Применяем переименования на те колонки, которые нашлись
    for old_name, new_name in rename.items():
        for col in df.columns:
            if old_name in col:
                df.rename(columns={col: new_name}, inplace=True)
                break

    # Убираем строки, где нет данных
    df.dropna(subset=["status"], inplace=True)

    # Парсим дату
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce", dayfirst=True)
        df["month"] = df["date"].dt.month.fillna(0).astype(int)
    else:
        df["month"] = 0

    # Числовые колонки
    for col in ["normativ", "amount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    print(f"  Загружено строк: {len(df)}")
    print(f"  Колонки: {list(df.columns)}")
    print(f"  Статусы заявок: {df['status'].value_counts().to_dict()}")
    print()
    return df


# ──────────────────────────────────────────────
# 2. Подготовка фичей
# ──────────────────────────────────────────────
def prepare_features(df: pd.DataFrame):
    print("=" * 60)
    print("ЭТАП 2: Подготовка фичей")
    print("=" * 60)

    # Целевая переменная: 1 = Исполнена (одобрена), 0 = остальные
    df["target"] = (df["status"] == "Исполнена").astype(int)
    print(f"  Целевая: Исполнена={df['target'].sum()}, Остальные={len(df) - df['target'].sum()}")

    # Категориальные фичи — кодируем LabelEncoder
    cat_cols = ["region", "direction", "subsidy_name", "district", "akimat"]
    encoders = {}
    for col in cat_cols:
        if col in df.columns:
            le = LabelEncoder()
            df[col + "_enc"] = le.fit_transform(df[col].astype(str))
            encoders[col] = le
            print(f"  Закодировано '{col}': {len(le.classes_)} классов")

    feature_cols = [c + "_enc" for c in cat_cols if c in df.columns] + ["normativ", "amount", "month"]
    feature_cols = [c for c in feature_cols if c in df.columns]

    X = df[feature_cols].values.astype(np.float32)
    y = df["target"].values

    # Скалирование
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    print(f"  Фичи: {feature_cols}")
    print(f"  Размерность X: {X_scaled.shape}")
    print()

    # Сохраняем энкодеры и скалер
    joblib.dump(encoders, MODELS_DIR / "label_encoders.pkl")
    joblib.dump(scaler, MODELS_DIR / "scaler.pkl")
    joblib.dump(feature_cols, MODELS_DIR / "feature_cols.pkl")

    return X_scaled, y, feature_cols, encoders, scaler, df


# ──────────────────────────────────────────────
# 3. Обучение XGBoost
# ──────────────────────────────────────────────
def train_xgboost(X, y):
    import xgboost as xgb
    from sklearn.metrics import classification_report

    print("=" * 60)
    print("ЭТАП 3: Обучение XGBoost")
    print("=" * 60)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )

    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = model.predict(X_test)
    print(classification_report(y_test, y_pred, target_names=["Отказ", "Одобрена"]))

    # Сохраняем
    model.save_model(str(MODELS_DIR / "xgboost_model.json"))
    print(f"  Модель сохранена: {MODELS_DIR / 'xgboost_model.json'}")
    print()
    return model


# ──────────────────────────────────────────────
# 4. Обучение Autoencoder (PyTorch)
# ──────────────────────────────────────────────
def train_autoencoder(X):
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset

    print("=" * 60)
    print("ЭТАП 4: Обучение Autoencoder (детекция аномалий)")
    print("=" * 60)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"  Устройство: {device}")

    input_dim = X.shape[1]

    class Autoencoder(nn.Module):
        def __init__(self, dim):
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Linear(dim, 32),
                nn.ReLU(),
                nn.Linear(32, 16),
                nn.ReLU(),
                nn.Linear(16, 8),
            )
            self.decoder = nn.Sequential(
                nn.Linear(8, 16),
                nn.ReLU(),
                nn.Linear(16, 32),
                nn.ReLU(),
                nn.Linear(32, dim),
            )

        def forward(self, x):
            z = self.encoder(x)
            return self.decoder(z)

    ae = Autoencoder(input_dim).to(device)
    optimizer = torch.optim.Adam(ae.parameters(), lr=1e-3)
    criterion = nn.MSELoss()

    tensor_X = torch.tensor(X, dtype=torch.float32)
    dataset = TensorDataset(tensor_X, tensor_X)
    loader = DataLoader(dataset, batch_size=64, shuffle=True)

    epochs = 50
    for epoch in range(epochs):
        total_loss = 0
        for batch_x, _ in loader:
            batch_x = batch_x.to(device)
            recon = ae(batch_x)
            loss = criterion(recon, batch_x)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        if (epoch + 1) % 10 == 0:
            print(f"  Epoch {epoch+1}/{epochs}, Loss: {total_loss/len(loader):.6f}")

    # Порог аномальности: mean + 2*std ошибки реконструкции
    ae.eval()
    with torch.no_grad():
        recon = ae(tensor_X.to(device))
        errors = torch.mean((tensor_X.to(device) - recon) ** 2, dim=1).cpu().numpy()

    threshold = float(np.mean(errors) + 2 * np.std(errors))
    print(f"  Порог аномальности: {threshold:.6f}")
    print(f"  Аномалий обнаружено: {(errors > threshold).sum()} из {len(errors)}")

    torch.save(ae.state_dict(), str(MODELS_DIR / "autoencoder.pt"))
    joblib.dump({"input_dim": input_dim, "threshold": threshold}, MODELS_DIR / "ae_config.pkl")
    print(f"  Autoencoder сохранён: {MODELS_DIR / 'autoencoder.pt'}")
    print()
    return ae, threshold


# ──────────────────────────────────────────────
# 5. SHAP-анализ
# ──────────────────────────────────────────────
def compute_shap(xgb_model, X, feature_cols):
    import shap

    print("=" * 60)
    print("ЭТАП 5: Вычисление SHAP-значений")
    print("=" * 60)

    explainer = shap.TreeExplainer(xgb_model)
    shap_values = explainer.shap_values(X)

    print(f"  SHAP shape: {shap_values.shape}")

    # Среднее абсолютное влияние каждой фичи
    mean_abs = np.abs(shap_values).mean(axis=0)
    for name, val in sorted(zip(feature_cols, mean_abs), key=lambda x: -x[1]):
        print(f"    {name}: {val:.4f}")

    print()
    return shap_values


# ──────────────────────────────────────────────
# 6. Генерация обучающих примеров для Mistral
# ──────────────────────────────────────────────
def generate_training_examples(df, X, shap_values, feature_cols, threshold_ae_errors=None):
    print("=" * 60)
    print("ЭТАП 6: Генерация обучающих примеров для Mistral")
    print("=" * 60)

    examples = []

    # Русские имена фичей
    feature_names_ru = {
        "region_enc": "Область",
        "direction_enc": "Направление животноводства",
        "subsidy_name_enc": "Наименование субсидии",
        "district_enc": "Район хозяйства",
        "akimat_enc": "Акимат",
        "normativ": "Норматив",
        "amount": "Причитающаяся сумма",
        "month": "Месяц подачи",
    }

    for i in range(len(df)):
        row = df.iloc[i]
        shap_vals = shap_values[i]
        score = float(1 / (1 + np.exp(-shap_vals.sum()))) * 100  # сигмоид -> 0-100

        # SHAP разбивка
        shap_dict = {}
        for j, col in enumerate(feature_cols):
            name = feature_names_ru.get(col, col)
            shap_dict[name] = round(float(shap_vals[j]), 4)

        # Сортируем по абсолютному влиянию
        sorted_factors = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)

        status = str(row.get("status", "Неизвестно"))
        region = str(row.get("region", "—"))
        direction = str(row.get("direction", "—"))
        district = str(row.get("district", "—"))
        normativ = row.get("normativ", 0)
        amount = row.get("amount", 0)

        # Входной промт
        input_text = (
            f"Объясни решение по заявке на субсидию.\n"
            f"Статус: {status}\n"
            f"Скоринговый балл: {score:.1f}/100\n"
            f"Область: {region}\n"
            f"Направление: {direction}\n"
            f"Район: {district}\n"
            f"Норматив: {normativ}\n"
            f"Сумма: {amount}\n"
            f"SHAP-факторы (влияние на решение):\n"
        )
        for name, val in sorted_factors:
            sign = "+" if val > 0 else ""
            input_text += f"  {name}: {sign}{val}\n"

        # Генерируем эталонный ответ (шаблонный) для обучения
        top_positive = [(n, v) for n, v in sorted_factors if v > 0][:3]
        top_negative = [(n, v) for n, v in sorted_factors if v < 0][:3]

        output_text = f"📊 Аналитическая справка по заявке\n\n"
        output_text += f"Скоринговый балл заявки составляет {score:.1f} из 100.\n"

        if score >= 70:
            output_text += f"Заявка получила высокий балл, что указывает на соответствие типичным одобренным заявкам.\n\n"
        elif score >= 40:
            output_text += f"Заявка получила средний балл, что требует дополнительного внимания эксперта.\n\n"
        else:
            output_text += f"Заявка получила низкий балл, что выделяет её из типичных одобренных заявок.\n\n"

        if top_positive:
            output_text += "✅ Факторы, повышающие вероятность одобрения:\n"
            for name, val in top_positive:
                output_text += f"  • {name} (+{val:.3f}): данный параметр укрепляет позицию заявки.\n"
            output_text += "\n"

        if top_negative:
            output_text += "⚠️ Факторы риска:\n"
            for name, val in top_negative:
                output_text += f"  • {name} ({val:.3f}): данный параметр снижает вероятность одобрения. Рекомендуется проверка.\n"
            output_text += "\n"

        output_text += f"📋 Рекомендация эксперту: "
        if score >= 70:
            output_text += "Заявка соответствует типичному профилю одобрения. Рекомендуется стандартная проверка."
        elif score >= 40:
            output_text += "Рекомендуется углублённая проверка по факторам риска перед принятием решения."
        else:
            output_text += "Заявка значительно отличается от типичных. Требуется тщательная проверка всех документов."

        examples.append({
            "input": input_text.strip(),
            "output": output_text.strip(),
        })

    # Сохраняем
    output_path = MODELS_DIR / "training_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(examples, f, ensure_ascii=False, indent=2)

    print(f"  Сгенерировано примеров: {len(examples)}")
    print(f"  Сохранено: {output_path}")
    print()
    return examples


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────
if __name__ == "__main__":
    # 1. Загрузка данных
    df = load_data()

    # 2. Подготовка фичей
    X, y, feature_cols, encoders, scaler, df = prepare_features(df)

    # 3. XGBoost
    xgb_model = train_xgboost(X, y)

    # 4. Autoencoder
    ae_model, ae_threshold = train_autoencoder(X)

    # 5. SHAP
    shap_values = compute_shap(xgb_model, X, feature_cols)

    # Готово!
    print("=" * 60)
    print("✅ ОБУЧЕНИЕ СКОРИНГОВЫХ МОДЕЛЕЙ ЗАВЕРШЕНО!")
    print("Модели XGBoost и Autoencoder сохранены в папку 'models/'.")
    print("Для создания локальной LLM-модели запустите скрипт create_ollama_model.py")
    print("=" * 60)
