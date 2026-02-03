#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试后台API获取询价数据"""
import requests
import json

def test_inquiries_api():
    print("=" * 60)
    print("测试后台询价API")
    print("=" * 60)
    
    # 测试地址
    base_url = "http://127.0.0.1:5002"
    
    # 1. 先登录获取token
    print("\n1. 登录获取token...")
    login_url = f"{base_url}/api/v1/auth/login"
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    try:
        login_resp = requests.post(login_url, json=login_data, timeout=5)
        print(f"登录响应状态: {login_resp.status_code}")
        login_result = login_resp.json()
        print(f"登录响应: {json.dumps(login_result, ensure_ascii=False, indent=2)}")
        
        if not login_result.get('success'):
            print("❌ 登录失败")
            return
        
        token = login_result.get('data', {}).get('token')
        if not token:
            print("❌ 未获取到token")
            return
        
        print(f"✓ 获取到token: {token[:20]}...")
        
        # 2. 获取询价列表
        print("\n2. 获取询价列表...")
        inquiries_url = f"{base_url}/admin/inquiries"
        headers = {
            "Authorization": f"Bearer {token}"
        }
        params = {
            "page": 1,
            "pageSize": 20
        }
        
        inquiries_resp = requests.get(inquiries_url, headers=headers, params=params, timeout=10)
        print(f"询价API响应状态: {inquiries_resp.status_code}")
        inquiries_result = inquiries_resp.json()
        print(f"询价API响应: {json.dumps(inquiries_result, ensure_ascii=False, indent=2)}")
        
        if inquiries_result.get('success'):
            data = inquiries_result.get('data', {})
            items = data.get('items', [])
            pagination = data.get('pagination', {})
            print(f"\n✓ 成功获取询价列表")
            print(f"总数: {pagination.get('total', 0)}")
            print(f"当前页: {pagination.get('page', 0)}")
            print(f"返回数量: {len(items)}")
            
            if items:
                print(f"\n前3条询价数据:")
                for i, item in enumerate(items[:3], 1):
                    print(f"{i}. ID={item.get('_id')}, 联系人={item.get('contactName')}, 产品={item.get('productName')}")
            else:
                print("\n⚠️ 返回的询价列表为空")
        else:
            print(f"❌ 获取询价失败: {inquiries_result.get('message')}")
        
        # 3. 获取统计信息
        print("\n3. 获取统计信息...")
        stats_url = f"{base_url}/admin/inquiries/statistics"
        stats_resp = requests.get(stats_url, headers=headers, timeout=5)
        print(f"统计API响应状态: {stats_resp.status_code}")
        stats_result = stats_resp.json()
        print(f"统计API响应: {json.dumps(stats_result, ensure_ascii=False, indent=2)}")
        
    except requests.exceptions.ConnectionError:
        print(f"❌ 无法连接到后台服务 {base_url}")
        print("请确保Flask后台服务正在运行 (python app.py)")
    except requests.exceptions.Timeout:
        print("❌ 请求超时")
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_inquiries_api()
