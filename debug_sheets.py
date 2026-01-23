import pandas as pd
import os

files = [
    '中金国际 香草.xlsx', 
    '中信中证资本期权报价表2024-11-19 香草.xlsx', 
    '浙期实业-2024-11-19.xlsx', 
    '银河德睿-2024-11-19.xlsx', 
    '华泰长城报价2024-11-19.xlsx', 
    '国君风险子-2024-11-19.xlsx', 
    '永安资本 香草.xlsx', 
    '中信中证资本期权报价表2024-11-19.xlsx'
]

for f in files:
    if not os.path.exists(f):
        print(f"{f}: Not Found")
        continue
    try:
        excel = pd.ExcelFile(f)
        print(f"{f}: {excel.sheet_names}")
        # Also print first few rows of sheets containing '个股' or '香草'
        for sheet in excel.sheet_names:
            if '个股' in sheet or '香草' in sheet:
                df = pd.read_excel(f, sheet_name=sheet, header=None).head(10)
                print(f"  --- Sheet: {sheet} (Top 10 rows) ---")
                print(df.to_string())
    except Exception as e:
        print(f"{f}: Error - {e}")
