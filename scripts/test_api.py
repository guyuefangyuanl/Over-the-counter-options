# -*- coding: utf-8 -*-
"""
报价API验证脚本
用于测试报价相关API的完整功能
"""

import os
import sys
import json
import time
import requests
from datetime import datetime

# API 基础URL
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:5002/api/v1')

def print_header(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def print_result(name, success, message="", data=None):
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n{status} - {name}")
    if message:
        print(f"   消息: {message}")
    if data:
        print(f"   数据: {json.dumps(data, ensure_ascii=False, indent=2)[:500]}")

def test_health_check():
    """测试健康检查接口"""
    print_header("健康检查测试")
    
    try:
        url = f"{API_BASE_URL}/health"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        success = data.get('success', False) and data.get('data', {}).get('status') == 'healthy'
        db_status = data.get('data', {}).get('database', {}).get('status', 'unknown')
        
        print_result(
            "API健康检查", 
            success,
            f"数据库状态: {db_status}"
        )
        return success
    except Exception as e:
        print_result("API健康检查", False, str(e))
        return False

def test_quotes_list():
    """测试报价列表接口"""
    print_header("报价列表测试")
    
    try:
        url = f"{API_BASE_URL}/admin/quotes?page=1&pageSize=10"
        response = requests.get(url, timeout=30)
        data = response.json()
        
        success = data.get('success', False)
        total = data.get('data', {}).get('pagination', {}).get('total', 0) if success else 0
        items_count = len(data.get('data', {}).get('items', [])) if success else 0
        
        print_result(
            "获取报价列表",
            success,
            f"总数: {total}, 返回: {items_count}条"
        )
        return success
    except Exception as e:
        print_result("获取报价列表", False, str(e))
        return False

def test_quote_detail(code="600519"):
    """测试报价详情接口"""
    print_header("报价详情测试")
    
    try:
        url = f"{API_BASE_URL}/admin/quotes/{code}"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        success = data.get('success', False) or data.get('code') == 404  # 404也算通过
        quote = data.get('data', {})
        
        print_result(
            "获取报价详情",
            success,
            f"代码: {code}" if not quote else f"代码: {code}, 名称: {quote.get('name', 'N/A')}"
        )
        return success
    except Exception as e:
        print_result("获取报价详情", False, str(e))
        return False

def test_stock_search():
    """测试股票搜索接口"""
    print_header("股票搜索测试")
    
    try:
        url = f"{API_BASE_URL}/stock/search?keyword=茅台"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        success = data.get('success', False)
        results = data.get('data', {}).get('results', []) if success else []
        
        print_result(
            "股票搜索",
            success,
            f"搜索关键词: 茅台, 结果数: {len(results)}"
        )
        return success
    except Exception as e:
        print_result("股票搜索", False, str(e))
        return False

def test_inquiry_submit():
    """测试询价提交接口（不实际提交，仅验证接口可达性）"""
    print_header("询价接口测试")
    
    try:
        # 测试OPTIONS请求验证CORS
        url = f"{API_BASE_URL}/inquiry"
        response = requests.options(url, timeout=10)
        
        # 检查CORS头
        cors_headers = response.headers.get('Access-Control-Allow-Origin', '')
        allow_methods = response.headers.get('Access-Control-Allow-Methods', '')
        
        success = response.status_code in [200, 204]
        
        print_result(
            "询价接口CORS检查",
            success,
            f"CORS Origin: {cors_headers}, Methods: {allow_methods}"
        )
        return success
    except Exception as e:
        print_result("询价接口测试", False, str(e))
        return False

def test_stats():
    """测试统计接口"""
    print_header("统计数据测试")
    
    try:
        url = f"{API_BASE_URL}/admin/stats"
        response = requests.get(url, timeout=10)
        data = response.json()
        
        success = data.get('success', False)
        stats = data.get('data', {}) if success else {}
        
        print_result(
            "统计数据",
            success,
            f"股票数: {stats.get('stockCount', 0)}, 询价数: {stats.get('inquiryCount', 0)}"
        )
        return success
    except Exception as e:
        print_result("统计数据", False, str(e))
        return False

def run_all_tests():
    """运行所有测试"""
    print("\n" + "🚀" * 30)
    print("场外期权小程序 API 验证测试")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"API地址: {API_BASE_URL}")
    print("🚀" * 30)
    
    results = []
    
    # 运行测试
    results.append(("健康检查", test_health_check()))
    results.append(("报价列表", test_quotes_list()))
    results.append(("报价详情", test_quote_detail()))
    results.append(("股票搜索", test_stock_search()))
    results.append(("询价接口", test_inquiry_submit()))
    results.append(("统计数据", test_stats()))
    
    # 汇总结果
    print_header("测试结果汇总")
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
    
    print("\n" + "-" * 40)
    print(f"  通过: {passed}/{total}")
    print(f"  通过率: {passed/total*100:.1f}%")
    print("-" * 40)
    
    if passed == total:
        print("\n🎉 所有测试通过！系统已准备就绪。")
    elif passed >= total * 0.8:
        print("\n⚠️ 大部分测试通过，请检查失败项。")
    else:
        print("\n❌ 多项测试失败，请检查系统配置。")
    
    return passed, total

if __name__ == "__main__":
    # 允许通过命令行参数指定API地址
    if len(sys.argv) > 1:
        API_BASE_URL = sys.argv[1]
    
    passed, total = run_all_tests()
    
    # 返回退出码
    sys.exit(0 if passed == total else 1)