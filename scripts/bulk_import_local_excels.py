import os
import sys
import logging
from typing import List

# Ensure we can import from parent directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.file_parser import parse_quotes_file
from services.sync_service import upsert_quotes_from_file
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    # Load environment variables
    load_dotenv()
    
    # 定义要搜索的关键字模式
    # 只要文件名包含这些关键字（且是 .xlsx 或 .xls）就会被自动识别处理
    target_patterns = [
        "中金国际 香草", 
        "中信中证资本期权报价表", # 会匹配带香草和不带香草的两个文件
        "浙期实业", 
        "银河德睿", 
        "华泰长城报价", 
        "国君风险子", 
        "永安资本 香草"
    ]
    
    workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # 获取目录下所有 Excel 文件进行匹配
    import re
    all_files = [f for f in os.listdir(workspace_root) if f.endswith(('.xlsx', '.xls'))]
    files_to_process = []
    
    for pattern in target_patterns:
        # 寻找文件名中包含该模式的文件
        matches = [f for f in all_files if pattern in f]
        # 如果是“中信中证资本期权报价表”，可能会匹配到两个文件（香草和普通）
        # 我们把所有匹配到的都加入处理列表，但去重
        for m in matches:
            if m not in files_to_process:
                files_to_process.append(m)
    
    total_processed = 0
    total_errors = []
    
    for filename in files_to_process:
        file_path = os.path.join(workspace_root, filename)
        if not os.path.exists(file_path):
            logger.warning(f"文件未找到: {filename}")
            continue
            
        logger.info(f"正在处理文件: {filename}...")
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # 自动选择“个股香草”相关 sheet
            items = parse_quotes_file(filename=filename, content=content)
            
            if not items:
                logger.warning(f"文件 {filename} 未提取到任何报价记录")
                continue
                
            logger.info(f"从 {filename} 提取到 {len(items)} 条记录，正在同步至云数据库...")
            
            # 同步至云数据库
            result = upsert_quotes_from_file(
                items=items, 
                requested_by="bulk_import_script",
                source=f"local_file:{filename}"
            )
            
            if result.get("success"):
                logger.info(f"✅ 文件 {filename} 处理成功: 已同步 {result.get('processed', 0)} 条记录")
                total_processed += result.get("processed", 0)
            else:
                logger.error(f"❌ 文件 {filename} 处理失败: {result.get('message', '未知错误')}")
                total_errors.extend(result.get("errors", []))
                
        except Exception as e:
            logger.error(f"处理文件 {filename} 时发生异常: {e}")
            total_errors.append({"file": filename, "error": str(e)})

    logger.info("=" * 50)
    logger.info(f"批量导入完成！")
    logger.info(f"成功导入总数: {total_processed}")
    logger.info(f"错误总数: {len(total_errors)}")
    if total_errors:
        logger.error(f"部分错误详情: {total_errors[:5]}")
    logger.info("=" * 50)

if __name__ == "__main__":
    main()
