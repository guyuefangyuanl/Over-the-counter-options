#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
询价数据诊断工具
用于检查云数据库中询价数据的存在情况，并诊断后台查询问题
"""

import sys
import os
import logging
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 设置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_env_config():
    """检查环境配置"""
    logger.info("=" * 70)
    logger.info("步骤1: 检查环境配置")
    logger.info("=" * 70)
    
    required_vars = ['WX_CLOUD_ENV', 'WX_APPID', 'WX_SECRET']
    config_ok = True
    
    for var in required_vars:
        value = os.getenv(var)
        if value and 'your_' not in value:
            logger.info(f"✓ {var}: 已配置")
        else:
            logger.error(f"✗ {var}: 未配置或配置错误")
            config_ok = False
    
    return config_ok

def test_cloud_db_connection():
    """测试云数据库连接"""
    logger.info("\n" + "=" * 70)
    logger.info("步骤2: 测试云数据库连接")
    logger.info("=" * 70)
    
    try:
        from services.cloud_db import CloudDbClient
        cloud_db = CloudDbClient.from_env()
        logger.info("✓ 云数据库客户端初始化成功")
        return cloud_db
    except Exception as e:
        logger.error(f"✗ 云数据库客户端初始化失败: {e}")
        return None

def query_inquiry_data(cloud_db, target_id="b7bd8fdc6977118400aec77a518c679e"):
    """查询询价数据"""
    logger.info("\n" + "=" * 70)
    logger.info("步骤3: 查询云数据库中的询价数据")
    logger.info("=" * 70)
    
    if not cloud_db:
        logger.error("✗ 云数据库客户端未初始化，无法查询")
        return False
    
    try:
        # 查询所有询价记录
        logger.info("\n3.1 查询所有询价记录（前10条）")
        query_all = "db.collection('inquiries').orderBy('createdAt', 'desc').limit(10).get()"
        logger.info(f"查询语句: {query_all}")
        
        all_data = cloud_db.query(query_all)
        logger.info(f"✓ 查询成功，返回 {len(all_data)} 条记录")
        
        if len(all_data) == 0:
            logger.warning("⚠️ 云数据库中暂无询价数据！")
            logger.warning("   这意味着小程序提交的数据可能:")
            logger.warning("   1. 没有成功写入云数据库")
            logger.warning("   2. 写入了不同的集合")
            logger.warning("   3. 环境ID配置不正确")
            return False
        
        # 显示查询结果摘要
        logger.info("\n查询结果摘要:")
        for i, record in enumerate(all_data, 1):
            logger.info(f"  记录 {i}:")
            logger.info(f"    ID: {record.get('_id')}")
            logger.info(f"    产品: {record.get('productName', 'N/A')}")
            logger.info(f"    状态: {record.get('status', 'N/A')}")
            logger.info(f"    联系人: {record.get('contactName', 'N/A')}")
            logger.info(f"    创建时间: {record.get('createdAt', 'N/A')}")
        
        # 查询特定ID的记录
        logger.info(f"\n3.2 查询特定ID: {target_id}")
        query_specific = f"db.collection('inquiries').where({{_id: '{target_id}'}}).get()"
        logger.info(f"查询语句: {query_specific}")
        
        specific_data = cloud_db.query(query_specific)
        if specific_data:
            logger.info(f"✓ 找到目标记录")
            logger.info(f"   完整数据: {specific_data[0]}")
        else:
            logger.warning(f"⚠️ 未找到ID为 {target_id} 的记录")
            logger.warning(f"   可能的原因:")
            logger.warning(f"   1. 该记录不存在")
            logger.warning(f"   2. ID格式不匹配（检查是否有额外空格或特殊字符）")
        
        # 统计总数
        logger.info("\n3.3 统计询价总数")
        count_query = "db.collection('inquiries').count()"
        logger.info(f"统计语句: {count_query}")
        
        total = cloud_db.count(count_query)
        logger.info(f"✓ 总计 {total} 条询价记录")
        
        return True
        
    except Exception as e:
        logger.error(f"✗ 查询失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def test_backend_api():
    """测试后台API"""
    logger.info("\n" + "=" * 70)
    logger.info("步骤4: 测试后台管理API")
    logger.info("=" * 70)
    
    try:
        import requests
        
        # 测试健康检查
        logger.info("\n4.1 测试健康检查接口")
        health_url = "http://localhost:5002/api/v1/health"
        try:
            response = requests.get(health_url, timeout=5)
            if response.status_code == 200:
                logger.info(f"✓ 后端服务正常运行")
                logger.info(f"   响应: {response.json()}")
            else:
                logger.warning(f"⚠️ 后端服务响应异常: {response.status_code}")
        except requests.exceptions.ConnectionError:
            logger.error("✗ 无法连接到后端服务 (http://localhost:5002)")
            logger.error("   请确保后端服务已启动: python app.py")
            return False
        except Exception as e:
            logger.error(f"✗ 测试健康检查失败: {e}")
            return False
        
        # 测试询价列表API（需要token）
        logger.info("\n4.2 测试询价列表API（需要登录）")
        logger.info("   提示: 该API需要管理员登录，请在浏览器中测试")
        logger.info("   URL: http://localhost:5002/api/v1/admin/inquiries?page=1&pageSize=10")
        
        return True
        
    except Exception as e:
        logger.error(f"✗ 测试后台API失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def analyze_code_issues():
    """分析代码潜在问题"""
    logger.info("\n" + "=" * 70)
    logger.info("步骤5: 分析代码潜在问题")
    logger.info("=" * 70)
    
    issues = []
    
    # 检查inquiry.py文件
    logger.info("\n5.1 检查 routes/inquiry.py")
    try:
        with open('routes/inquiry.py', 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 检查查询语法
        if "db.collection('inquiries')" in content:
            logger.info("✓ 发现云数据库查询代码")
        else:
            issues.append("未找到云数据库查询代码")
        
        # 检查orderBy用法
        if ".orderBy('createdAt', 'desc')" in content:
            logger.info("✓ 使用了正确的排序语法")
        else:
            issues.append("排序语法可能有误")
        
        # 检查错误处理
        if "except Exception as e:" in content:
            logger.info("✓ 包含异常处理")
        else:
            issues.append("缺少异常处理")
            
    except Exception as e:
        logger.error(f"✗ 无法读取 routes/inquiry.py: {e}")
        issues.append(f"文件读取失败: {e}")
    
    if issues:
        logger.warning(f"\n发现 {len(issues)} 个潜在问题:")
        for i, issue in enumerate(issues, 1):
            logger.warning(f"  {i}. {issue}")
    else:
        logger.info("\n✓ 未发现明显的代码问题")
    
    return len(issues) == 0

def main():
    """主函数"""
    logger.info("\n")
    logger.info("*" * 70)
    logger.info("询价数据诊断工具")
    logger.info("*" * 70)
    
    results = {
        '环境配置': False,
        '云数据库连接': False,
        '数据查询': False,
        '后台API': False,
        '代码分析': False
    }
    
    # 1. 检查环境配置
    results['环境配置'] = check_env_config()
    if not results['环境配置']:
        logger.error("\n❌ 环境配置检查失败，请检查 .env 文件")
        return False
    
    # 2. 测试云数据库连接
    cloud_db = test_cloud_db_connection()
    results['云数据库连接'] = cloud_db is not None
    if not results['云数据库连接']:
        logger.error("\n❌ 云数据库连接失败")
        return False
    
    # 3. 查询数据
    results['数据查询'] = query_inquiry_data(cloud_db)
    
    # 4. 测试后台API
    results['后台API'] = test_backend_api()
    
    # 5. 分析代码
    results['代码分析'] = analyze_code_issues()
    
    # 输出诊断总结
    logger.info("\n" + "=" * 70)
    logger.info("诊断总结")
    logger.info("=" * 70)
    
    for check, passed in results.items():
        status = "✓ 通过" if passed else "✗ 失败"
        logger.info(f"{check}: {status}")
    
    all_passed = all(results.values())
    
    if all_passed:
        logger.info("\n" + "=" * 70)
        logger.info("✓ 所有检查通过")
        logger.info("=" * 70)
    else:
        logger.warning("\n" + "=" * 70)
        logger.warning("⚠️ 部分检查未通过，请根据上述输出进行修复")
        logger.warning("=" * 70)
    
    return all_passed

if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("\n\n用户中断")
        sys.exit(1)
    except Exception as e:
        logger.error(f"\n诊断工具运行失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)
