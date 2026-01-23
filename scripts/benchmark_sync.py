# -*- coding: utf-8 -*-
import os
import time
import logging
import json
from services.sina_crawler import get_all_stock_codes, crawl_quotes
from services.cloud_db import CloudDbClient
from services.sync_service import sync_quotes

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("benchmark")

def run_benchmark():
    logger.info("开始 A 股行情抓取与存储性能基准测试...")
    
    # 1. 获取所有代码
    t0 = time.time()
    codes = get_all_stock_codes()
    t_codes = time.time() - t0
    logger.info(f"获取 {len(codes)} 条代码耗时: {t_codes:.2f}s")
    
    if not codes:
        logger.error("未能获取到股票代码，测试终止")
        return

    # 2. 抓取行情 (只抓取不存库，测试网络性能)
    t1 = time.time()
    items, errors = crawl_quotes(codes, chunk_size=100, max_workers=16)
    t_crawl = time.time() - t1
    logger.info(f"抓取 {len(items)} 条行情耗时: {t_crawl:.2f}s (错误: {len(errors)})")

    # 3. 全量同步 (包含存库)
    logger.info("开始全量同步测试 (存库)...")
    # 为了测试真实存库性能，我们直接调用 sync_quotes
    t2 = time.time()
    # 限制并发数和分片大小，观察当前性能
    result = sync_quotes(codes=codes, requested_by="benchmark", max_workers=10)
    t_sync = time.time() - t2
    
    logger.info("=== 测试结果 ===")
    logger.info(f"代码获取耗时: {t_codes:.2f}s")
    logger.info(f"独立抓取耗时: {t_crawl:.2f}s")
    logger.info(f"完整同步耗时: {t_sync:.2f}s")
    logger.info(f"处理数量: {result.get('processed', 0)}")
    logger.info(f"抓取数量: {result.get('fetched', 0)}")
    logger.info(f"UPSERT 耗时 (内部统计): {result.get('upsertMs', 0)/1000:.2f}s")
    logger.info(f"总耗时: {time.time() - t0:.2f}s")
    
    if time.time() - t0 < 60:
        logger.info("✅ 目标达成：总耗时小于 60 秒")
    else:
        logger.warning("❌ 目标未达成：总耗时大于 60 秒")

if __name__ == "__main__":
    run_benchmark()
