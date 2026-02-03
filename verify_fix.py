import requests
import json
import time

BASE_URL = "http://127.0.0.1:5002/api/v1"

def test_api():
    print("="*60)
    print("开始验证接口修复结果")
    print("="*60)

    # 1. 登录
    print("1. 正在登录...")
    try:
        # 注意：routes/auth.py 定义的是 /login，加上 prefix /api/v1/auth，完整路径是 /api/v1/auth/login
        resp = requests.post(f"{BASE_URL}/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            print(f"❌ 登录失败: {data}")
            return
        token = data['data']['token']
        print("✓ 登录成功")
    except Exception as e:
        print(f"❌ 登录异常: {e}")
        return

    # 2. 查询询价列表
    print("\n2. 查询询价列表 (GET /admin/inquiries)...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        # 故意不传筛选条件，看是否能返回数据
        resp = requests.get(f"{BASE_URL}/admin/inquiries", headers=headers, params={"page": 1, "pageSize": 10})
        resp.raise_for_status()
        result = resp.json()
        
        if not result.get("success"):
            print(f"❌ 查询失败: {result}")
            return
            
        items = result['data']['items']
        total = result['data']['pagination']['total']
        
        print(f"✓ 接口请求成功")
        print(f"  - 总记录数 (total): {total}")
        print(f"  - 当前页记录数: {len(items)}")
        
        if len(items) > 0:
            print("\n  [第一条数据预览]")
            first = items[0]
            print(f"  ID: {first.get('_id')}")
            print(f"  联系人: {first.get('contactName')}")
            print(f"  产品: {first.get('productName')}")
            print(f"  时间: {first.get('createdAt')}")
        else:
            print("\n⚠️ 列表为空！如果数据库有数据但这里为空，说明修复未生效或有其他过滤条件。")
            
    except Exception as e:
        print(f"❌ 查询异常: {e}")

if __name__ == "__main__":
    test_api()
