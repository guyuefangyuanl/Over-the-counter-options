#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""测试询价数据查询"""

import sys
import logging
from app import app

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def test_inquiry_query():
    """测试从云数据库查询询价数据"""
    
    logger.info("=" * 60)
    logger.info("开始测试询价数据查询")
    logger.info("=" * 60)
    
    # 检查云数据库连接
    cloud_db = app.cloud_db
    if not cloud_db:
        logger.error("❌ 云数据库未初始化")
        return False
    
    logger.info("✓ 云数据库已初始化")
    
    # 测试查询所有询价
    try:
        logger.info("\n1. 查询所有询价记录...")
        query_js = "db.collection('inquiries').limit(10).get()"
        logger.info(f"查询语句: {query_js}")
        
        result = cloud_db.query(query_js)
        logger.info(f"✓ 查询成功，返回 {len(result)} 条记录")
        
        if len(result) == 0:
            logger.warning("⚠️ 云数据库中暂无询价数据")
            return True
        
        # 显示查询结果
        logger.info("\n查询结果详情:")
        for i, record in enumerate(result, 1):
            logger.info(f"\n记录 {i}:")
            logger.info(f"  ID: {record.get('_id')}")
            logger.info(f"  产品: {record.get('productName', 'N/A')}")
            logger.info(f"  状态: {record.get('status', 'N/A')}")
            logger.info(f"  联系人: {record.get('contactName', 'N/A')}")
            logger.info(f"  创建时间: {record.get('createdAt', 'N/A')}")
        
        # 测试查询特定ID
        target_id = "b7bd8fdc6977118400aec77a518c679e"
        logger.info(f"\n2. 查询特定ID: {target_id}")
        query_js = f"db.collection('inquiries').where({{_id: '{target_id}'}}).get()"
        logger.info(f"查询语句: {query_js}")
        
        specific_result = cloud_db.query(query_js)
        if specific_result:
            logger.info(f"✓ 找到目标记录")
            logger.info(f"记录详情: {specific_result[0]}")
        else:
            logger.warning(f"⚠️ 未找到ID为 {target_id} 的记录")
        
        # 测试统计
        logger.info("\n3. 统计询价数量...")
        count_js = "db.collection('inquiries').count()"
        logger.info(f"统计语句: {count_js}")
        
        total = cloud_db.count(count_js)
        logger.info(f"✓ 总计 {total} 条询价记录")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ 查询失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

if __name__ == '__main__':
    success = test_inquiry_query()
    logger.info("\n" + "=" * 60)
    if success:
        logger.info("✓ 测试完成")
    else:
        logger.error("❌ 测试失败")
    logger.info("=" * 60)
    sys.exit(0 if success else 1)
