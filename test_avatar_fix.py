# 测试默认头像修复
# 测试访问默认头像图片

import requests
import json

def test_avatar_fix():
    print("🧪 测试默认头像修复...")
    
    try:
        # 测试默认头像PNG访问
        print("📷 测试 default-avatar.png 访问...")
        response = requests.get("http://localhost:3000/images/default-avatar.png", timeout=5)
        print(f"   状态码: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        print(f"   Content-Length: {response.headers.get('Content-Length')}")
        
        if response.status_code == 200:
            print("   ✅ 默认头像PNG访问成功")
        else:
            print(f"   ❌ 默认头像PNG访问失败: {response.status_code}")
        
        # 测试默认头像SVG访问
        print("\n📷 测试 default-avatar.svg 访问...")
        response = requests.get("http://localhost:3000/images/default-avatar.svg", timeout=5)
        print(f"   状态码: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        print(f"   Content-Length: {response.headers.get('Content-Length')}")
        
        if response.status_code == 200:
            print("   ✅ 默认头像SVG访问成功")
        else:
            print(f"   ❌ 默认头像SVG访问失败: {response.status_code}")
            
        # 测试健康检查
        print("\n❤️ 测试健康检查...")
        response = requests.get("http://localhost:3000/health", timeout=5)
        if response.status_code == 200:
            health_data = response.json()
            print(f"   ✅ 健康检查通过: {health_data.get('status')}")
        else:
            print(f"   ❌ 健康检查失败: {response.status_code}")
            
    except requests.exceptions.ConnectionError:
        print("❌ 连接失败 - 请确保服务器正在运行")
    except Exception as e:
        print(f"❌ 测试出错: {e}")

if __name__ == "__main__":
    test_avatar_fix()