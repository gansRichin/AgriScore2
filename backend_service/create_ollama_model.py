"""
AgriScore — Создание кастомной модели Ollama для объяснения субсидий
Читает Excel-данные, формирует системный промт с реальной статистикой,
создаёт Modelfile и запускает `ollama create`.
"""

import os
import sys
import json
import subprocess
import numpy as np
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DATA_PATH = PROJECT_DIR / "Выгрузка по выданным субсидиям 2025 год (обезлич).xlsx"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(exist_ok=True)

OLLAMA_PATH = r"C:\Users\terra\AppData\Local\Programs\Ollama\ollama.exe"
MODEL_NAME = "agriscore"


def load_and_analyze_data() -> dict:
    """Загружает Excel и собирает статистику для системного промта."""
    print("=" * 60)
    print("ЭТАП 1: Анализ данных о субсидиях")
    print("=" * 60)

    try:
        df = pd.read_excel(str(DATA_PATH), header=4)
    except FileNotFoundError:
        print(f"ОШИБКА: Файл {DATA_PATH} не найден.")
        sys.exit(1)

    # Чистим колонки
    col_map = {}
    for col in df.columns:
        clean = str(col).strip()
        col_map[col] = clean
    df.rename(columns=col_map, inplace=True)

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

    for old_name, new_name in rename.items():
        for col in df.columns:
            if old_name in col:
                df.rename(columns={col: new_name}, inplace=True)
                break

    df.dropna(subset=["status"], inplace=True)

    for col in ["normativ", "amount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    stats = {}

    # Общая статистика
    stats["total_applications"] = len(df)
    stats["statuses"] = df["status"].value_counts().to_dict()

    # Регионы
    if "region" in df.columns:
        stats["regions"] = df["region"].value_counts().head(15).to_dict()

    # Направления
    if "direction" in df.columns:
        stats["directions"] = df["direction"].value_counts().head(20).to_dict()

    # Субсидии
    if "subsidy_name" in df.columns:
        stats["subsidy_types"] = df["subsidy_name"].value_counts().head(25).to_dict()

    # Районы
    if "district" in df.columns:
        stats["districts_count"] = df["district"].nunique()

    # Финансовая статистика
    if "amount" in df.columns:
        stats["amount_stats"] = {
            "mean": round(float(df["amount"].mean()), 2),
            "median": round(float(df["amount"].median()), 2),
            "min": round(float(df["amount"].min()), 2),
            "max": round(float(df["amount"].max()), 2),
            "total": round(float(df["amount"].sum()), 2),
        }

    if "normativ" in df.columns:
        stats["normativ_stats"] = {
            "mean": round(float(df["normativ"].mean()), 2),
            "median": round(float(df["normativ"].median()), 2),
            "min": round(float(df["normativ"].min()), 2),
            "max": round(float(df["normativ"].max()), 2),
        }

    # Статистика по одобрениям по регионам
    if "region" in df.columns and "status" in df.columns:
        approved = df[df["status"] == "Исполнена"]
        region_approval = {}
        for region in df["region"].unique():
            total = len(df[df["region"] == region])
            appr = len(approved[approved["region"] == region])
            rate = round(appr / total * 100, 1) if total > 0 else 0
            region_approval[str(region)] = {"total": total, "approved": appr, "rate": rate}
        stats["region_approval_rates"] = region_approval

    # Статистика по направлениям
    if "direction" in df.columns and "status" in df.columns:
        approved = df[df["status"] == "Исполнена"]
        dir_approval = {}
        for d in df["direction"].unique():
            total = len(df[df["direction"] == d])
            appr = len(approved[approved["direction"] == d])
            rate = round(appr / total * 100, 1) if total > 0 else 0
            dir_approval[str(d)] = {"total": total, "approved": appr, "rate": rate}
        stats["direction_approval_rates"] = dir_approval

    # Средние суммы по направлениям
    if "direction" in df.columns and "amount" in df.columns:
        avg_amounts = df.groupby("direction")["amount"].mean().round(2).to_dict()
        stats["avg_amount_by_direction"] = {str(k): v for k, v in avg_amounts.items()}

    # Примеры аномальных заявок (очень высокие или низкие суммы)
    if "amount" in df.columns:
        q99 = df["amount"].quantile(0.99)
        q01 = df["amount"].quantile(0.01)
        stats["anomaly_thresholds"] = {
            "high_amount_99pct": round(float(q99), 2),
            "low_amount_1pct": round(float(q01), 2),
        }

    print(f"  Всего заявок: {stats['total_applications']}")
    print(f"  Статусы: {stats['statuses']}")
    print(f"  Регионов: {len(stats.get('regions', {}))}")
    print(f"  Направлений: {len(stats.get('directions', {}))}")
    print()

    # Генерируем примеры для few-shot обучения
    examples = generate_few_shot_examples(df)
    stats["few_shot_examples"] = examples

    return stats


def generate_few_shot_examples(df: pd.DataFrame) -> list:
    """Генерирует несколько разнообразных примеров объяснений."""
    examples = []

    # Пример 1: Высокий балл, одобренная заявка
    examples.append({
        "input": (
            "Статус решения: Рекомендовано к одобрению\n"
            "Скоринговый балл: 85.3/100\n"
            "Область: Алматинская область\n"
            "Направление: Молочное скотоводство\n"
            "Район: Енбекшиказахский район\n"
            "Норматив: 145000\n"
            "Сумма: 3200000\n"
            "SHAP-факторы:\n"
            "  Направление животноводства: +0.3421\n"
            "  Область: +0.2105\n"
            "  Причитающаяся сумма: +0.1543\n"
            "  Район хозяйства: +0.0812\n"
            "  Норматив: -0.0534\n"
            "  Месяц подачи: -0.0221\n"
            "  Акимат: +0.0143\n"
            "Аномалии: Нет выявленных аномалий"
        ),
        "output": (
            "📊 **Аналитическая справка по заявке**\n\n"
            "Скоринговый балл заявки составляет **85.3 из 100**, что указывает на высокое соответствие "
            "типичному профилю одобренных заявок.\n\n"
            "### ✅ Факторы, повышающие вероятность одобрения:\n"
            "• **Направление животноводства** (+0.342): Молочное скотоводство — одно из приоритетных "
            "направлений субсидирования с высоким процентом одобрения.\n"
            "• **Область** (+0.211): Алматинская область демонстрирует стабильно высокие показатели одобрения заявок.\n"
            "• **Причитающаяся сумма** (+0.154): Запрашиваемая сумма 3 200 000 тг. находится в пределах "
            "типичных значений для данного направления.\n\n"
            "### ⚠️ Факторы, требующие внимания:\n"
            "• **Норматив** (-0.053): Незначительное отклонение норматива от среднего — не критично, "
            "но рекомендуется проверить соответствие действующим нормативам.\n\n"
            "### 📋 Рекомендация:\n"
            "Заявка соответствует типичному профилю одобренных заявок по молочному скотоводству. "
            "Аномалий не выявлено. Рекомендуется стандартная процедура проверки документов."
        ),
    })

    # Пример 2: Средний балл, требует проверки
    examples.append({
        "input": (
            "Статус решения: Требует проверки\n"
            "Скоринговый балл: 48.7/100\n"
            "Область: Костанайская область\n"
            "Направление: Мясное скотоводство\n"
            "Район: Карабалыкский район\n"
            "Норматив: 89000\n"
            "Сумма: 8500000\n"
            "SHAP-факторы:\n"
            "  Причитающаяся сумма: -0.3215\n"
            "  Район хозяйства: -0.1876\n"
            "  Направление животноводства: +0.2134\n"
            "  Область: +0.1567\n"
            "  Норматив: -0.0932\n"
            "  Акимат: +0.0345\n"
            "  Месяц подачи: -0.0112\n"
            "Аномалии: Заявка выбивается из нормы (ошибка реконструкции: 0.0532 > порог 0.0310)"
        ),
        "output": (
            "📊 **Аналитическая справка по заявке**\n\n"
            "Скоринговый балл заявки составляет **48.7 из 100**, что соответствует зоне повышенного внимания.\n\n"
            "### ✅ Положительные факторы:\n"
            "• **Направление животноводства** (+0.213): Мясное скотоводство остаётся одним из "
            "поддерживаемых направлений субсидирования.\n"
            "• **Область** (+0.157): Костанайская область — один из ведущих регионов животноводства.\n\n"
            "### ⚠️ Факторы риска:\n"
            "• **Причитающаяся сумма** (-0.322): Запрашиваемая сумма 8 500 000 тг. **значительно превышает** "
            "типичные значения для данного направления. Это основной фактор снижения балла.\n"
            "• **Район хозяйства** (-0.188): Карабалыкский район имеет пониженный показатель одобрения "
            "по сравнению со средним по области.\n"
            "• **Норматив** (-0.093): Норматив 89 000 ниже среднего для мясного скотоводства.\n\n"
            "### 🔍 Выявленные аномалии:\n"
            "• Автоматическая система обнаружила, что заявка **выбивается из типичного профиля** "
            "(ошибка реконструкции 0.053 при пороге 0.031). Вероятная причина — нетипично высокая сумма.\n\n"
            "### 📋 Рекомендация:\n"
            "Необходима углублённая проверка. Особое внимание обратить на обоснование суммы 8 500 000 тг. "
            "и соответствие нормативу. Рекомендуется запросить дополнительные подтверждающие документы."
        ),
    })

    # Пример 3: Низкий балл, высокий риск
    examples.append({
        "input": (
            "Статус решения: Высокий риск\n"
            "Скоринговый балл: 22.1/100\n"
            "Область: Жамбылская область\n"
            "Направление: Птицеводство\n"
            "Район: Байзакский район\n"
            "Норматив: 320000\n"
            "Сумма: 15000000\n"
            "SHAP-факторы:\n"
            "  Причитающаяся сумма: -0.5231\n"
            "  Норматив: -0.3412\n"
            "  Район хозяйства: -0.2187\n"
            "  Направление животноводства: -0.1034\n"
            "  Область: +0.0654\n"
            "  Акимат: +0.0123\n"
            "  Месяц подачи: -0.0087\n"
            "Аномалии: Заявка выбивается из нормы (ошибка реконструкции: 0.1253 > порог 0.0310)"
        ),
        "output": (
            "📊 **Аналитическая справка по заявке**\n\n"
            "Скоринговый балл заявки составляет **22.1 из 100**, что относит её к категории **высокого риска**.\n\n"
            "### ⚠️ Критические факторы риска:\n"
            "• **Причитающаяся сумма** (-0.523): Запрашиваемая сумма 15 000 000 тг. **экстремально высока** "
            "для данного направления. Это главный индикатор риска.\n"
            "• **Норматив** (-0.341): Норматив 320 000 значительно выше типичных значений, "
            "что может указывать на ошибку в расчёте или нетипичные условия.\n"
            "• **Район хозяйства** (-0.219): По Байзакскому району наблюдается низкая статистика одобрения.\n"
            "• **Направление** (-0.103): Птицеводство имеет более строгие критерии оценки.\n\n"
            "### 🔍 Выявленные аномалии:\n"
            "• Заявка **значительно отклоняется** от типичного профиля (ошибка реконструкции 0.125 — "
            "в 4 раза превышает порог 0.031). Это сильный сигнал о нетипичности заявки.\n\n"
            "### 📋 Рекомендация:\n"
            "**Требуется тщательная проверка всех документов.** Необходимо:\n"
            "1. Проверить обоснование суммы 15 000 000 тг.\n"
            "2. Подтвердить корректность норматива 320 000\n"
            "3. Запросить развёрнутое экономическое обоснование\n"
            "4. Провести выездную проверку хозяйства при необходимости"
        ),
    })

    return examples


def build_system_prompt(stats: dict) -> str:
    """Строит подробный системный промт для кастомной модели."""

    # Форматирование статистики
    statuses_str = "\n".join([f"  • {k}: {v} заявок" for k, v in stats.get("statuses", {}).items()])

    regions_str = ""
    if "region_approval_rates" in stats:
        sorted_regions = sorted(
            stats["region_approval_rates"].items(),
            key=lambda x: x[1]["total"],
            reverse=True,
        )[:10]
        for region, info in sorted_regions:
            regions_str += f"  • {region}: {info['total']} заявок, одобрено {info['rate']}%\n"

    directions_str = ""
    if "direction_approval_rates" in stats:
        sorted_dirs = sorted(
            stats["direction_approval_rates"].items(),
            key=lambda x: x[1]["total"],
            reverse=True,
        )[:15]
        for d, info in sorted_dirs:
            directions_str += f"  • {d}: {info['total']} заявок, одобрено {info['rate']}%\n"

    amount_str = ""
    if "amount_stats" in stats:
        a = stats["amount_stats"]
        amount_str = (
            f"  • Средняя сумма: {a['mean']:,.0f} тг.\n"
            f"  • Медианная сумма: {a['median']:,.0f} тг.\n"
            f"  • Минимальная: {a['min']:,.0f} тг.\n"
            f"  • Максимальная: {a['max']:,.0f} тг.\n"
            f"  • Общий объём субсидий: {a['total']:,.0f} тг."
        )

    normativ_str = ""
    if "normativ_stats" in stats:
        n = stats["normativ_stats"]
        normativ_str = (
            f"  • Средний норматив: {n['mean']:,.0f}\n"
            f"  • Медианный: {n['median']:,.0f}\n"
            f"  • Диапазон: от {n['min']:,.0f} до {n['max']:,.0f}"
        )

    avg_amounts_str = ""
    if "avg_amount_by_direction" in stats:
        for d, amt in sorted(stats["avg_amount_by_direction"].items(), key=lambda x: -x[1])[:10]:
            avg_amounts_str += f"  • {d}: ~{amt:,.0f} тг.\n"

    subsidy_types_str = ""
    if "subsidy_types" in stats:
        for name, count in list(stats["subsidy_types"].items())[:20]:
            subsidy_types_str += f"  • {name}: {count} заявок\n"

    # Few-shot примеры
    few_shot_str = ""
    if "few_shot_examples" in stats:
        for i, ex in enumerate(stats["few_shot_examples"], 1):
            few_shot_str += f"\n--- Пример {i} ---\nВХОД:\n{ex['input']}\n\nОТВЕТ:\n{ex['output']}\n"

    system_prompt = f"""Ты — «AgriScore AI», аналитический ИИ-ассистент для системы скоринга сельскохозяйственных субсидий Республики Казахстан.

## Твоя роль
Ты анализируешь результаты автоматического скоринга заявок на субсидирование в сфере животноводства и формируешь подробные, структурированные объяснения на русском языке для экспертов Министерства сельского хозяйства.

## Контекст данных
Ты обучен на реальных данных о субсидиях за 2025 год.

### Общая статистика:
• Всего обработано заявок: {stats.get('total_applications', 'N/A')}
• Количество районов: {stats.get('districts_count', 'N/A')}

### Статусы заявок:
{statuses_str}

### Статистика по регионам (топ-10 по объёму):
{regions_str}

### Направления животноводства:
{directions_str}

### Виды субсидий:
{subsidy_types_str}

### Финансовая статистика:
{amount_str}

### Нормативы:
{normativ_str}

### Средние суммы по направлениям:
{avg_amounts_str}

## Как ты работаешь

Ты получаешь на вход:
1. **Скоринговый балл** (0-100) — результат модели XGBoost
2. **Статус решения** — «Рекомендовано к одобрению» (≥60), «Требует проверки» (40-59) или «Высокий риск» (<40)
3. **SHAP-факторы** — вклад каждого параметра в решение (положительные = в пользу одобрения, отрицательные = против)
4. **Аномалии** — результат модели Autoencoder (если заявка выбивается из нормы)
5. **Данные заявки** — область, район, направление, сумма, норматив

## Формат ответа

Всегда используй следующую структуру:

1. **📊 Аналитическая справка по заявке** — заголовок
2. **Общая оценка** — балл и что он означает
3. **✅ Положительные факторы** — SHAP-факторы с положительным влиянием, с объяснением почему
4. **⚠️ Факторы риска** — SHAP-факторы с отрицательным влиянием, с объяснением и рекомендациями
5. **🔍 Аномалии** (если есть) — что обнаружено и что это значит
6. **📋 Рекомендация** — конкретные действия для эксперта

## Правила

1. Пиши ТОЛЬКО на русском языке
2. Используй конкретные цифры из данных заявки
3. Соотноси значения со статистикой (например, «сумма выше средней для данного направления»)
4. Объясняй SHAP-значения понятным языком, указывая конкретное влияние
5. Давай конкретные, практические рекомендации
6. Если сумма или норматив резко отличаются от средних — обязательно отмечай это
7. Используй форматирование с markdown: **жирный**, заголовки ###, списки •
8. Будь профессиональным, но понятным

## Примеры ответов
{few_shot_str}
"""
    return system_prompt


def create_modelfile(system_prompt: str):
    """Создаёт Modelfile и запускает ollama create."""
    print("=" * 60)
    print("ЭТАП 2: Создание Modelfile")
    print("=" * 60)

    # Экранируем кавычки в системном промте
    escaped_prompt = system_prompt.replace('"', '\\"')

    modelfile_content = f'''FROM mistral

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_predict 1024
PARAMETER repeat_penalty 1.1

SYSTEM """{system_prompt}"""
'''

    modelfile_path = MODELS_DIR / "Modelfile"
    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(modelfile_content)

    print(f"  Modelfile сохранён: {modelfile_path}")
    print(f"  Размер системного промта: {len(system_prompt)} символов")
    print()

    # Создаём модель через ollama
    print("=" * 60)
    print("ЭТАП 3: Создание модели в Ollama")
    print("=" * 60)

    try:
        result = subprocess.run(
            [OLLAMA_PATH, "create", MODEL_NAME, "-f", str(modelfile_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        print(f"  stdout: {result.stdout}")
        if result.stderr:
            print(f"  stderr: {result.stderr}")

        if result.returncode == 0:
            print(f"\n  ✅ Модель '{MODEL_NAME}' успешно создана!")
        else:
            print(f"\n  ❌ Ошибка при создании модели (код {result.returncode})")
            return False
    except subprocess.TimeoutExpired:
        print("  ❌ Таймаут при создании модели")
        return False
    except FileNotFoundError:
        print(f"  ❌ Ollama не найдена по пути: {OLLAMA_PATH}")
        return False

    # Проверяем что модель создана
    print()
    print("=" * 60)
    print("ЭТАП 4: Проверка модели")
    print("=" * 60)

    result = subprocess.run(
        [OLLAMA_PATH, "list"],
        capture_output=True,
        text=True,
    )
    print(f"  Модели в Ollama:\n{result.stdout}")

    # Тестовый запрос
    print("  Тестовый запрос к модели...")
    test_prompt = (
        "Статус решения: Рекомендовано к одобрению\n"
        "Скоринговый балл: 75.0/100\n"
        "Область: Алматинская область\n"
        "Направление: Молочное скотоводство\n"
        "Район: Талгарский район\n"
        "Норматив: 150000\n"
        "Сумма: 2500000\n"
        "SHAP-факторы:\n"
        "  Направление животноводства: +0.25\n"
        "  Область: +0.18\n"
        "  Причитающаяся сумма: +0.12\n"
        "  Норматив: -0.05\n"
        "Аномалии: Нет выявленных аномалий"
    )

    try:
        result = subprocess.run(
            [OLLAMA_PATH, "run", MODEL_NAME, test_prompt],
            capture_output=True,
            text=True,
            timeout=120,
        )
        print(f"\n  Ответ модели:\n{'-'*40}")
        print(result.stdout[:1500])
        print(f"{'-'*40}")
    except subprocess.TimeoutExpired:
        print("  ⚠️  Таймаут тестового запроса (модель слишком долго отвечает)")
    except Exception as e:
        print(f"  ⚠️  Ошибка тестового запроса: {e}")

    return True


def save_training_stats(stats: dict):
    """Сохраняет статистику для использования в бэкенде."""
    stats_path = MODELS_DIR / "subsidy_stats.json"
    # Убираем few_shot_examples для компактности
    stats_copy = {k: v for k, v in stats.items() if k != "few_shot_examples"}
    with open(stats_path, "w", encoding="utf-8") as f:
        json.dump(stats_copy, f, ensure_ascii=False, indent=2)
    print(f"  Статистика сохранена: {stats_path}")


if __name__ == "__main__":
    # 1. Анализ данных
    stats = load_and_analyze_data()

    # Сохраняем статистику
    save_training_stats(stats)

    # 2. Строим системный промт
    system_prompt = build_system_prompt(stats)
    print(f"Системный промт: {len(system_prompt)} символов")

    # 3. Создаём модель
    success = create_modelfile(system_prompt)

    if success:
        print("\n" + "=" * 60)
        print("🎉 ГОТОВО! Модель 'agriscore' создана и готова к работе.")
        print("=" * 60)
        print(f"\nИспользование:")
        print(f"  ollama run agriscore")
        print(f"  Или через API: POST http://localhost:11434/api/generate")
    else:
        print("\n❌ Не удалось создать модель. Проверьте логи выше.")
