"""
测试后端API是否正常返回询价数据
"""
import requests
import json

# 后端API地址
BASE_URL = "https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com"

def test_inquiries_api():
    print("=" * 60)
    print("测试后端 API - /api/v1/admin/inquiries")
    print("=" * 60)
    
    # 测试询价列表接口
    url = f"{BASE_URL}/api/v1/admin/inquiries"
    
    print(f"\n请求 URL: {url}")
    print("\n发送请求...")
    
    try:
        response = requests.get(url, params={"page": 1, "per_page": 10})
        
        print(f"\n响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ API 响应成功！")
            print(f"响应数据结构:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
            
            # 检查数据
            if 'data' in data:
                items = data['data'].get('items', [])
                total = data['data'].get('total', 0)
                print(f"\n总记录数: {total}")
                print(f"返回记录数: {len(items)}")
                
                if items:
                    print("\n第一条记录示例:")
                    print(json.dumps(items[0], indent=2, ensure_ascii=False))
                else:
                    print("\n⚠️ 返回数据为空")
            else:
                print("\n⚠️ 响应格式异常，没有 'data' 字段")
        else:
            print(f"\n❌ API 响应失败: {response.status_code}")
            print(f"错误内容: {response.text}")
    
    except Exception as e:
        print(f"\n❌ 请求失败: {e}")
        import traceback
        traceback.print_exc()

def test_statistics_api():
    print("\n" + "=" * 60)
    print("测试后端 API - /api/v1/admin/inquiries/statistics")
    print("=" * 60)
    
    url = f"{BASE_URL}/api/v1/admin/inquiries/statistics"
    
    print(f"\n请求 URL: {url}")
    print("\n发送请求...")
    
    try:
        response = requests.get(url)
        
        print(f"\n响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ API 响应成功！")
            print(f"统计数据:")
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(f"\n❌ API 响应失败: {response.status_code}")
            print(f"错误内容: {response.text}")
    
    except Exception as e:
        print(f"\n❌ 请求失败: {e}")

if __name__ == "__main__":
    test_inquiries_api()
    test_statistics_api()
