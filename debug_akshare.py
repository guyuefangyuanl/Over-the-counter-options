import akshare as ak
import logging

logging.basicConfig(level=logging.INFO)

try:
    print("Testing stock_info_a_code_name...")
    df = ak.stock_info_a_code_name()
    print(f"Columns: {df.columns}")
    print(df.head())
except Exception as e:
    print(f"Error: {e}")
