import pandas as pd
import os
import sys

print("Starting...")
try:
    import openpyxl
    print("openpyxl imported")
except ImportError:
    print("openpyxl NOT found")

f = '中金国际 香草.xlsx'
if os.path.exists(f):
    print(f"File {f} exists")
    try:
        xl = pd.ExcelFile(f)
        print(f"Sheets: {xl.sheet_names}")
    except Exception as e:
        print(f"Error reading excel: {e}")
else:
    print(f"File {f} NOT found")
