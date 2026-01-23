import pandas as pd
import json
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

info = {}

for f in files:
    if not os.path.exists(f): continue
    try:
        excel = pd.ExcelFile(f)
        info[f] = {}
        for sheet in excel.sheet_names:
            if '个股' in sheet or '香草' in sheet:
                df = pd.read_excel(f, sheet_name=sheet, header=None).head(10)
                info[f][sheet] = df.values.tolist()
    except Exception as e:
        info[f] = {"error": str(e)}

with open('excel_structure.json', 'w', encoding='utf-8') as f_out:
    json.dump(info, f_out, ensure_ascii=False, indent=2)
