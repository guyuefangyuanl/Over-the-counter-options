"""
全面诊断询价数据查询问题
检查：
1. 环境变量配置
2. 云数据库连接
3. inquiries集合数据
4. API接口响应
"""
import os
import sys
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(".env.local", override=True)
load_dotenv(".env", override=False)

def check_env_config():
    """检查环境变量配置"""
    logger.info("=" * 80)
    logger.info("步骤 1: 检查环境变量配置")
    logger.info("=" * 80)
    
    required_vars = {
        'WX_CLOUD_ENV': os.getenv('WX_CLOUD_ENV'),
        'WX_APPID': os.getenv('WX_APPID'),
        'WX_SECRET': os.getenv('WX_SECRET'),
        'FLASK_PORT': os.getenv('FLASK_PORT', '5002'),
    }
    
    all_ok = True
    for key, value in required_vars.items():
        if key == 'WX_SECRET':
            status = f"{'✅ 已配置' if value else '❌ 未配置'} ({'***' if value else ''})"
        else:
            status = f"{'✅' if value else '❌'} {value or '未配置'}"
        logger.info(f"  {key}: {status}")
        if not value or value.startswith('your_'):
            all_ok = False
            logger.error(f"    ❌ {key} 未正确配置")
    
    return all_ok

def check_cloud_db_connection():
    """检查云数据库连接"""
    logger.info("\n" + "=" * 80)
    logger.info("步骤 2: 检查云数据库连接")
    logger.info("=" * 80)
    
    try:
        from services.cloud_db import CloudDbClient
        logger.info("✅ 成功导入 CloudDbClient")
        
        cloud_db = CloudDbClient.from_env()
        logger.info("✅ 云数据库客户端初始化成功")
        
        # 测试查询
        test_query = "db.collection('inquiries').limit(1).get()"
        logger.info(f"\n测试查询: {test_query}")
        result = cloud_db.query(test_query)
        logger.info(f"✅ 查询执行成功，返回类型: {type(result)}, 长度: {len(result) if isinstance(result, list) else 'N/A'}")
        
        return True, cloud_db
    except Exception as e:
        logger.error(f"❌ 云数据库连接失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False, None

def check_inquiries_data(cloud_db):
    """检查inquiries集合数据"""
    logger.info("\n" + "=" * 80)
    logger.info("步骤 3: 检查 inquiries 集合数据")
    logger.info("=" * 80)
    
    try:
        # 统计总数
        count_query = "db.collection('inquiries').count()"
        logger.info(f"统计查询: {count_query}")
        total = cloud_db.count(count_query)
        logger.info(f"✅ inquiries 集合总记录数: {total}")
        
        if total == 0:
            logger.warning("⚠️ inquiries 集合为空，可能原因：")
            logger.warning("  1. 小程序未提交过询价")
            logger.warning("  2. 数据未正确同步到云数据库")
            logger.warning("  3. 集合权限设置问题")
            return False
        
        # 获取最新记录
        list_query = "db.collection('inquiries').orderBy('createdAt', 'desc').limit(5).get()"
        logger.info(f"\n获取最新记录: {list_query}")
        records = cloud_db.query(list_query)
        logger.info(f"✅ 获取到 {len(records)} 条记录")
        
        if records:
            logger.info("\n最新5条记录详情：")
            for i, record in enumerate(records, 1):
                logger.info(f"\n  记录 {i}:")
                logger.info(f"    _id: {record.get('_id')}")
                logger.info(f"    产品: {record.get('productName', 'N/A')}")
                logger.info(f"    联系人: {record.get('contactName', 'N/A')}")
                logger.info(f"    状态: {record.get('status', 'N/A')}")
                logger.info(f"    创建时间: {record.get('createdAt', 'N/A')}")
                logger.info(f"    来源: {record.get('source', 'N/A')}")
        
        # 按状态统计
        logger.info("\n按状态统计：")
        for status in ['pending', 'processing', 'completed', 'rejected']:
            status_query = f"db.collection('inquiries').where({{status: '{status}'}}).count()"
            count = cloud_db.count(status_query)
            status_name = {
                'pending': '待处理',
                'processing': '处理中',
                'completed': '已完成',
                'rejected': '已拒绝'
            }.get(status, status)
            logger.info(f"  {status_name} ({status}): {count} 条")
        
        return True
    except Exception as e:
        logger.error(f"❌ 检查数据失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def check_api_endpoint():
    """检查API接口"""
    logger.info("\n" + "=" * 80)
    logger.info("步骤 4: 检查后端API接口")
    logger.info("=" * 80)
    
    try:
        import requests
        port = os.getenv('FLASK_PORT', '5002')
        base_url = f"http://localhost:{port}"
        
        # 检查健康状态
        logger.info(f"检查健康状态: {base_url}/api/v1/health")
        resp = requests.get(f"{base_url}/api/v1/health", timeout=5)
        logger.info(f"✅ 健康检查响应: {resp.status_code}")
        logger.info(f"  响应内容: {resp.json()}")
        
        # 检查询价列表接口（需要认证）
        logger.info(f"\n检查询价列表接口: {base_url}/api/v1/admin/inquiries")
        logger.warning("⚠️ 此接口需要认证，如果返回401是正常的")
        try:
            resp = requests.get(
                f"{base_url}/api/v1/admin/inquiries",
                params={'page': 1, 'pageSize': 10},
                timeout=5
            )
            logger.info(f"响应状态: {resp.status_code}")
            if resp.status_code == 401:
                logger.info("✅ 接口正常（需要认证）")
            else:
                logger.info(f"响应内容: {resp.text[:500]}")
        except Exception as e:
            logger.warning(f"接口测试失败: {e}")
        
        return True
    except Exception as e:
        logger.error(f"❌ API接口检查失败: {e}")
        logger.warning("请确保后端服务已启动（python app.py）")
        return False

def main():
    """主诊断流程"""
    logger.info("\n")
    logger.info("█" * 80)
    logger.info("█" + " " * 78 + "█")
    logger.info("█" + " " * 20 + "询价数据查询问题全面诊断" + " " * 20 + "█")
    logger.info("█" + " " * 78 + "█")
    logger.info("█" * 80)
    logger.info("\n")
    
    results = {
        '环境变量配置': False,
        '云数据库连接': False,
        '数据查询': False,
        'API接口': False
    }
    
    # 1. 检查环境变量
    results['环境变量配置'] = check_env_config()
    
    # 2. 检查云数据库连接
    if results['环境变量配置']:
        conn_ok, cloud_db = check_cloud_db_connection()
        results['云数据库连接'] = conn_ok
        
        # 3. 检查数据
        if conn_ok and cloud_db:
            results['数据查询'] = check_inquiries_data(cloud_db)
    else:
        logger.warning("\n⚠️ 环境变量配置有问题，跳过云数据库检查")
    
    # 4. 检查API接口
    results['API接口'] = check_api_endpoint()
    
    # 总结
    logger.info("\n" + "=" * 80)
    logger.info("诊断总结")
    logger.info("=" * 80)
    
    for check, status in results.items():
        status_icon = "✅" if status else "❌"
        logger.info(f"{status_icon} {check}: {'通过' if status else '失败'}")
    
    all_passed = all(results.values())
    
    logger.info("\n" + "=" * 80)
    if all_passed:
        logger.info("✅✅✅ 所有检查通过！")
        logger.info("如果后台管理系统仍然看不到数据，请：")
        logger.info("  1. 重启后端服务：python app.py")
        logger.info("  2. 清除浏览器缓存并刷新")
        logger.info("  3. 检查浏览器控制台是否有错误")
    else:
        logger.error("❌❌❌ 部分检查未通过，请根据上述错误信息修复")
        logger.info("\n建议修复步骤：")
        if not results['环境变量配置']:
            logger.info("  1. 检查 .env 或 .env.local 文件中的微信云开发配置")
        if not results['云数据库连接']:
            logger.info("  2. 确认微信云开发环境ID、APPID、SECRET正确")
        if not results['数据查询']:
            logger.info("  3. 在小程序中提交询价测试数据")
        if not results['API接口']:
            logger.info("  4. 启动后端服务：python app.py")
    logger.info("=" * 80)

if __name__ == "__main__":
    main()
