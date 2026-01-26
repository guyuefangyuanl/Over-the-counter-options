"""
直接查询微信云数据库中的inquiries集合
检查是否有数据
"""
import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.cloud_db import CloudDbClient, AccessTokenProvider

def check_inquiries():
    """检查云数据库中的inquiries数据"""
    print("=" * 60)
    print("检查微信云数据库 inquiries 集合")
    print("=" * 60)
    
    # 从环境变量读取配置
    env_id = os.getenv("WX_CLOUD_ENV", "develop-8gx7kh9g045e6c9a")
    appid = os.getenv("WX_APPID")
    secret = os.getenv("WX_SECRET")
    
    print(f"\n环境ID: {env_id}")
    print(f"APPID: {'已配置' if appid else '❌ 未配置'}")
    print(f"SECRET: {'已配置' if secret else '❌ 未配置'}")
    
    if not appid or not secret:
        print("\n❌ 错误：缺少微信云开发配置")
        print("请设置环境变量:")
        print("  - WX_APPID")
        print("  - WX_SECRET")
        return
    
    try:
        # 初始化云数据库客户端
        print("\n正在连接云数据库...")
        token_provider = AccessTokenProvider(appid=appid, secret=secret)
        cloud_db = CloudDbClient(env_id=env_id, token_provider=token_provider)
        
        # 查询所有询价记录
        print("\n查询 inquiries 集合...")
        query_js = "db.collection('inquiries').orderBy('createdAt', 'desc').limit(20).get()"
        inquiries = cloud_db.query(query_js)
        
        # 统计总数
        count_js = "db.collection('inquiries').count()"
        total = cloud_db.count(count_js)
        
        print(f"\n✅ 查询成功！")
        print(f"总记录数: {total}")
        print(f"返回记录数: {len(inquiries)}")
        
        if inquiries:
            print("\n最新 5 条记录:")
            print("-" * 60)
            for i, item in enumerate(inquiries[:5], 1):
                print(f"\n记录 {i}:")
                print(f"  ID: {item.get('_id', '无')}")
                print(f"  产品: {item.get('productName', '无')}")
                print(f"  联系人: {item.get('contactName', '无')}")
                print(f"  状态: {item.get('status', '无')}")
                print(f"  来源: {item.get('source', '无')}")
                print(f"  创建时间: {item.get('createdAt', '无')}")
        else:
            print("\n⚠️ 云数据库中暂无询价记录")
            print("请在小程序中提交询价后再检查")
        
        # 按来源统计
        if inquiries:
            sources = {}
            for item in inquiries:
                source = item.get('source', 'miniprogram')
                sources[source] = sources.get(source, 0) + 1
            
            print("\n按来源统计:")
            print("-" * 60)
            for source, count in sources.items():
                print(f"  {source}: {count} 条")
        
        # 按状态统计
        print("\n按状态统计:")
        print("-" * 60)
        for status in ['pending', 'processing', 'completed', 'rejected']:
            status_query = f"db.collection('inquiries').where({{status: '{status}'}}).count()"
            count = cloud_db.count(status_query)
            status_name = {'pending': '待处理', 'processing': '处理中', 'completed': '已完成', 'rejected': '已拒绝'}.get(status, status)
            print(f"  {status_name}: {count} 条")
        
    except Exception as e:
        print(f"\n❌ 查询失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_inquiries()
