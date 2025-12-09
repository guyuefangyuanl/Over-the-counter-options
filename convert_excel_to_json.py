import pandas as pd
import json
import os
import glob
from datetime import datetime

def convert_excel_to_cloud_json():
    # 1. Find Excel files (supports .xls and .xlsx)
    # Priority: SZ股票行情.xlsx -> others
    target_files = []
    
    # Specific priority file
    priority_file = 'SZ股票行情.xlsx'
    if os.path.exists(priority_file):
        target_files.append(priority_file)
    
    # Add other excel files
    all_files = glob.glob('*.xls*')
    for f in all_files:
        if f != priority_file and not f.startswith('~$'): # Skip temp files
            target_files.append(f)
    
    if not target_files:
        print("错误: 当前目录下没有找到 Excel 文件。")
        return

    print(f"找到以下文件: {target_files}")
    
    # We will process all files and merge them, or just pick the most relevant one.
    # Given the user context ("SZ股票行情.xlsx" seems most relevant for stock quotes), let's process that one primarily.
    # If there are multiple relevant files, we can merge.
    # For now, let's process the first valid one that contains stock data.
    
    json_lines = []
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    processed_count = 0
    
    for file_path in target_files:
        print(f"正在读取文件: {file_path} ...")
        try:
            # Use 'openpyxl' for xlsx, 'xlrd' might be needed for xls but pandas handles auto usually if installed
            if file_path.endswith('.xls'):
                # Install xlrd if needed: pip install xlrd
                try:
                    df = pd.read_excel(file_path, engine='xlrd')
                except:
                     # Fallback or skip if xlrd not present
                     print(f"跳过 {file_path}: 需要 pip install xlrd 来读取 .xls 文件")
                     continue
            else:
                df = pd.read_excel(file_path)
        except Exception as e:
            print(f"读取 Excel 失败 ({file_path}): {e}")
            continue

        # 2. Map Columns
        column_mapping = {
            'code': ['代码', '股票代码', 'Code', '证券代码', 'A股代码'],
            'name': ['名称', '股票名称', 'Name', '证券简称', 'A股简称'],
            'price': ['现价', '最新价', '价格', 'Price', '收盘价'],
            'changePercent': ['涨跌幅', '涨跌', 'Change', '涨跌幅(%)'],
            'volume': ['成交量', 'Volume', '总手'],
            'amount': ['成交额', 'Amount', '金额']
        }

        found_cols = {}
        for key, candidates in column_mapping.items():
            for col in df.columns:
                if any(cand in str(col) for cand in candidates):
                    found_cols[key] = col
                    break
        
        print(f"  [{file_path}] 列映射结果: {found_cols}")
        
        if 'code' not in found_cols or 'name' not in found_cols:
            print(f"  警告: {file_path} 未能识别关键列，跳过。")
            continue
        
        # 3. Process Data
        file_count = 0
        for index, row in df.iterrows():
            item = {}
            
            # Code
            raw_code = str(row[found_cols['code']])
            import re
            code_match = re.search(r'\d{6}', raw_code)
            if code_match:
                item['code'] = code_match.group(0)
            else:
                continue # Skip invalid code

            # Name
            item['name'] = str(row[found_cols['name']])
            
            # Helper
            def get_float(col_key, default=0.0):
                if col_key in found_cols:
                    try:
                        val = row[found_cols[col_key]]
                        if isinstance(val, str):
                            val = val.replace('%', '').replace(',', '')
                        return float(val)
                    except:
                        return default
                return default

            item['price'] = get_float('price')
            item['changePercent'] = get_float('changePercent')
            item['volume'] = int(get_float('volume'))
            item['amount'] = int(get_float('amount'))
            item['updateTime'] = current_time

            # Avoid duplicates if we process multiple files? 
            # For now, just append. Cloud DB import 'upsert' will handle duplicates if _id is set, 
            # but we are letting Cloud DB auto-generate _id or we should set _id to code?
            # Setting _id to code is better for deduplication!
            item['_id'] = item['code'] 

            json_lines.append(json.dumps(item, ensure_ascii=False))
            file_count += 1
        
        print(f"  已从 {file_path} 提取 {file_count} 条数据")
        processed_count += file_count

    if processed_count == 0:
        print("未提取到任何有效数据。")
        return

    # 4. Write to JSON file
    output_file = 'quotes_data.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        for line in json_lines:
            f.write(line + '\n')
    
    print(f"转换完成！已生成 {output_file}")
    print(f"共合并处理 {len(json_lines)} 条数据。")
    print("下一步：请打开微信开发者工具 -> 云开发 -> 数据库 -> 选择 'quotes' 集合 -> 导入 -> 选择此文件。")
    print("注意：导入时建议选择 'Upsert' (如果存在则更新) 模式，因为我们指定了股票代码作为 _id")

if __name__ == '__main__':
    convert_excel_to_cloud_json()
