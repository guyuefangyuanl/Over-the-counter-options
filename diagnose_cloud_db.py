#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
云数据库连接诊断脚本
用于排查为什么后台管理系统无法获取询价数据
"""

import os
import sys
import logging
import json
from dotenv import load_dotenv

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def load_env():
    """加载环境变量"""
    env_files = ['.env.local', '.env']
    for env_file in env_files:
        if os.path.exists(env_file):
            load_dotenv(env_file, override=True)
            logger.info(f"已加载环境变量文件: {env_file}")
            return
    logger.warning("未找到 .env 文件")

def check_env_vars():
    """检查必要的环境变量"""
    required_vars = ['WX_CLOUD_ENV', 'WX_APPID', 'WX_SECRET']
    missing = []
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            missing.append(var)
        else:
            masked = value[:4] + '*' * 4 + value[-4:] if len(value) > 8 else '****'
            logger.info(f"环境变量 {var} = {masked}")
    
    if missing:
        logger.error(f"缺少环境变量: {', '.join(missing)}")
        return False
    return True

def diagnose():
    logger.info("=" * 60)
    logger.info("开始诊断云数据库连接")
    logger.info("=" * 60)
    
    # 1. 加载环境变量
    load_env()
    
    # 2. 检查变量
    if not check_env_vars():
        return

    # 3. 尝试初始化客户端
    try:
        from services.cloud_db import CloudDbClient
        client = CloudDbClient.from_env()
        logger.info("✓ CloudDbClient 初始化成功")
    except Exception as e:
        logger.error(f"❌ CloudDbClient 初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return

    # 4. 测试查询
    try:
        logger.info("\n正在尝试查询 'inquiries' 集合 (limit 10)...")
        # 使用简单的查询
        query = "db.collection('inquiries').orderBy('createdAt', 'desc').limit(10).get()"
        results = client.query(query)
        
        if results is None:
            logger.error("❌ 查询返回 None")
            return
            
        logger.info(f"✓ 查询成功，返回 {len(results)} 条记录")
        
        if len(results) == 0:
            logger.warning("⚠️ 返回了 0 条记录。可能原因：")
            logger.warning("  1. 集合 'inquiries' 确实为空")
            logger.warning("  2. 环境 ID (WX_CLOUD_ENV) 不正确，连接到了空环境")
            logger.warning("  3. 权限问题（虽然通常服务端API有高权限）")
        else:
            logger.info("\n数据样例 (第一条):")
            first = results[0]
            logger.info(json.dumps(first, ensure_ascii=False, indent=2))
            
    except Exception as e:
        logger.error(f"❌ 查询失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    diagnose()
