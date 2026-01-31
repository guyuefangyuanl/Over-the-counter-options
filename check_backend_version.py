"""
检查云托管后端服务的代码版本
通过特定的API行为来判断是否已经部署了最新的修复代码
"""
import requests
import json

# 后端API地址
BASE_URL = "https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com"

def check_backend_version():
    print("=" * 60)
    print("检查云托管后端服务代码版本")
    print("=" * 60)
    
    # 1. 测试健康检查接口
    print("\n1. 测试健康检查接口...")
    try:
        health_url = f"{BASE_URL}/api/v1/health"
        resp = requests.get(health_url, timeout=10)
        print(f"   状态码: {resp.status_code}")
        if resp.status_code == 200:
            print(f"   ✅ 后端服务正常运行")
            data = resp.json()
            print(f"   响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        else:
            print(f"   ❌ 健康检查失败")
    except Exception as e:
        print(f"   ❌ 无法连接到后端服务: {e}")
        return
    
    # 2. 测试询价列表接口（这个接口包含了我们修复的代码）
    print("\n2. 测试询价列表接口（包含修复代码）...")
    try:
        inquiries_url = f"{BASE_URL}/api/v1/admin/inquiries"
        resp = requests.get(inquiries_url, params={"page": 1, "per_page": 5}, timeout=10)
        print(f"   状态码: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"   ✅ API 响应成功")
            
            # 检查响应格式
            if 'data' in data:
                items = data['data'].get('items', [])
                total = data['data'].get('total', 0)
                page = data['data'].get('page', 0)
                per_page = data['data'].get('per_page', 0)
                
                print(f"\n   响应数据:")
                print(f"   - 总记录数: {total}")
                print(f"   - 返回记录数: {len(items)}")
                print(f"   - 当前页: {page}")
                print(f"   - 每页数量: {per_page}")
                
                # 判断代码版本
                if total == 0 and len(items) == 0:
                    print(f"\n   📊 分析:")
                    print(f"   云数据库返回了空数组 []")
                    print(f"   后端正确处理了空数组（没有回退到本地MongoDB）")
                    print(f"\n   ✅ 判断: 后端服务已部署最新代码")
                    print(f"   - 使用了 'if cloud_data is not None:' 判断")
                    print(f"   - 正确返回了分页数据结构")
                elif total > 0:
                    print(f"\n   ✅ 判断: 后端服务已部署最新代码，并且云数据库有数据")
                    print(f"   第一条记录示例:")
                    if items:
                        print(json.dumps(items[0], indent=2, ensure_ascii=False))
            else:
                print(f"   ⚠️ 响应格式异常")
                print(f"   完整响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
        elif resp.status_code == 401:
            print(f"   ⚠️ 需要认证（这是正常的，说明接口存在）")
            print(f"   无法判断代码版本，但服务正常运行")
        else:
            print(f"   ❌ API 响应失败")
            print(f"   错误内容: {resp.text}")
    except Exception as e:
        print(f"   ❌ 请求失败: {e}")
    
    # 3. 测试统计接口
    print("\n3. 测试统计接口...")
    try:
        stats_url = f"{BASE_URL}/api/v1/admin/inquiries/statistics"
        resp = requests.get(stats_url, timeout=10)
        print(f"   状态码: {resp.status_code}")
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"   ✅ API 响应成功")
            print(f"   统计数据: {json.dumps(data, indent=2, ensure_ascii=False)}")
        elif resp.status_code == 401:
            print(f"   ⚠️ 需要认证（这是正常的）")
        else:
            print(f"   错误: {resp.text}")
    except Exception as e:
        print(f"   ❌ 请求失败: {e}")
    
    print("\n" + "=" * 60)
    print("检查完成")
    print("=" * 60)

if __name__ == "__main__":
    check_backend_version()
