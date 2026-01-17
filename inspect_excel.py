import pandas as pd
import sys

def inspect_excel(file_path):
    try:
        df = pd.read_excel(file_path)
        print("--- Columns ---")
        print(df.columns.tolist())
        print("\n--- First 5 Rows ---")
        print(df.head().to_string())
        print("\n--- Info ---")
        print(df.info())
    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)

if __name__ == "__main__":
    inspect_excel('期权报价汇总模板-L2024(完善版）11.18.xlsx')
