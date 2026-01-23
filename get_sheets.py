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

with open('sheets_info.txt', 'w', encoding='utf-8') as f_out:
    for f in files:
        if not os.path.exists(f):
            f_out.write(f"{f}: Not Found\n")
            continue
        try:
            excel = pd.ExcelFile(f)
            f_out.write(f"{f}: {excel.sheet_names}\n")
            for sheet in excel.sheet_names:
                if '个股' in sheet or '香草' in sheet:
                    df = pd.read_excel(f, sheet_name=sheet, header=None).head(5)
                    f_out.write(f"  --- Sheet: {sheet} ---\n")
                    f_out.write(df.to_string() + "\n")
        except Exception as e:
            f_out.write(f"{f}: Error - {e}\n")
