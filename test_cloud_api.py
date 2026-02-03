import requests
import json
import sys
import time

# 配置
BASE_URL = "https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1"
HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "TestScript/1.0"
}

def log(message, status="INFO"):
    print(f"[{status}] {message}")

def test_api_connectivity():
    """测试API连通性"""
    log("正在测试API连通性...", "TEST")
    try:
        # 尝试访问 quotes 接口作为连通性测试，因为通常没有 health 接口
        response = requests.get(f"{BASE_URL}/quotes", headers=HEADERS, timeout=10)
        if response.status_code in [200, 404, 500]: # 只要能连通，哪怕报错也是连通了
            log(f"API 连接成功 (Status: {response.status_code})", "PASS")
            return True
        else:
            log(f"API 连接异常 (Status: {response.status_code})", "WARN")
            return False
    except Exception as e:
        log(f"API 连接失败: {str(e)}", "FAIL")
        return False

def test_get_quotes():
    """测试获取报价数据"""
    log("正在测试获取报价列表...", "TEST")
    try:
        response = requests.get(f"{BASE_URL}/quotes", headers=HEADERS, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                quotes = data.get("data", [])
                log(f"获取成功，共 {len(quotes)} 条数据", "PASS")
                if len(quotes) > 0:
                    # 检查数据结构
                    sample = quotes[0]
                    if "name" in sample and "price" in sample or "lastPrice" in sample:
                        log("数据结构验证通过", "PASS")
                    else:
                        log(f"数据结构可能异常: {sample.keys()}", "WARN")
                    
                    # 检查是否为Mock数据 (简单的启发式检查)
                    if "MOCK" in str(quotes):
                         log("警告：数据中包含 'MOCK' 关键字，请确认是否已切换至真实数据源", "WARN")
                else:
                    log("警告：返回数据为空列表，请确认数据库是否已导入数据", "WARN")
                return True
            else:
                log(f"API 返回错误: {data.get('message')}", "FAIL")
                return False
        else:
            log(f"HTTP 请求失败: {response.status_code}", "FAIL")
            return False
    except Exception as e:
        log(f"请求异常: {str(e)}", "FAIL")
        return False

def run_tests():
    print("="*50)
    print("开始执行云端 API 冒烟测试")
    print(f"Target: {BASE_URL}")
    print("="*50)
    
    results = {
        "connectivity": False,
        "quotes": False
    }
    
    # 1. 连通性
    results["connectivity"] = test_api_connectivity()
    
    # 2. 报价数据 (如果连通)
    if results["connectivity"]:
        results["quotes"] = test_get_quotes()
    
    print("\n" + "="*50)
    print("测试摘要")
    print("="*50)
    all_pass = all(results.values())
    for k, v in results.items():
        status = "✅ PASS" if v else "❌ FAIL"
        print(f"{k.ljust(20)}: {status}")
    
    if all_pass:
        print("\n🎉 冒烟测试通过！API 服务基本正常。")
        print("请继续进行小程序端的 UI 和交互测试。")
    else:
        print("\n⚠️ 测试存在失败项，请检查日志。")

if __name__ == "__main__":
    run_tests()
