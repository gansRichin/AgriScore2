import pandas as pd

file_path = r"c:\Users\terra\Desktop\agriscore-main\Выгрузка по выданным субсидиям 2025 год (обезлич).xlsx"

# Читаем первые 10 строк без заголовков чтобы найти строку с реальными названиями колонок
df_raw = pd.read_excel(file_path, header=None, nrows=10)
for i, row in df_raw.iterrows():
    vals = [str(v)[:40] for v in row if pd.notna(v)]
    print(f"Row {i}: {vals}")

print("\n--- Now trying header=3 ---")
df = pd.read_excel(file_path, header=3, nrows=3)
print("Columns:", df.columns.tolist())
print("\nShape:", df.shape)
print("\nFirst row:")
for col in df.columns:
    print(f"  {col}: {df.iloc[0][col]}")
