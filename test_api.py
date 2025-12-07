# -*- coding: utf-8 -*-
"""
API接口测试脚本
用于测试Flask应用的所有API接口
"""

import requests
import json
from urllib.parse import urljoin
from requests.exceptions import RequestException, ConnectionError, Timeout

# API基础URL
BASE_URL = "http://127.0.0.1:5000"

# 分隔线
SEPARATOR = "=" * 60


def format_json(data):
    """
    格式化JSON数据以便美观打印
    
    Args:
        data (dict): JSON数据
        
    Returns:
        str: 格式化后的JSON字符串
    """
    return json.dumps(data, ensure_ascii=False, indent=2)


def test_endpoint(name, url, method="GET", params=None):
    """
    测试单个端点
    
    Args:
        name (str): 测试名称
        url (str): 请求URL
        method (str): HTTP方法
        params (dict): 查询参数
    """
    print(f"🚀 {name}")
    print(SEPARATOR)
    print(f"请求URL: {url}")
    if params:
        print(f"查询参数: {params}")
    
    try:
        if method == "GET":
            response = requests.get(url, params=params, timeout=10)
        else:
            response = requests.request(method, url, params=params, timeout=10)
            
        print(f"响应状态码: {response.status_code}")
        print("响应数据:")
        print(format_json(response.json()))
        
        # 检查CORS头（仅对/api路径）
        if url.startswith(urljoin(BASE_URL, "/api")):
            cors_header = response.headers.get("Access-Control-Allow-Origin", "未设置")
            if cors_header != "未设置":
                print("🌐 CORS支持: 是")
            else:
                print("🌐 CORS支持: 否")
    except ConnectionError as e:
        print(f"❌ 连接错误: {e}")
    except Timeout as e:
        print(f"❌ 请求超时: {e}")
    except RequestException as e:
        print(f"❌ 请求异常: {e}")
    except Exception as e:
        print(f"❌ 未知错误: {e}")
    
    print(SEPARATOR)
    print()


def main():
    """主函数"""
    print("🚀 开始API接口测试")
    print()
    
    # 测试所有接口
    test_endpoint("健康检查接口", urljoin(BASE_URL, "/health"))
    test_endpoint("API版本信息接口", urljoin(BASE_URL, "/api/version"))
    test_endpoint("股票实时数据接口", urljoin(BASE_URL, "/api/stock/realtime/000001"))
    test_endpoint("股票历史数据接口", urljoin(BASE_URL, "/api/stock/history/000001"), 
                 params={"start_date": "20240101", "end_date": "20240131"})
    test_endpoint("股票搜索接口", urljoin(BASE_URL, "/api/stock/search"), 
                 params={"keyword": "平安"})
    test_endpoint("股票列表接口", urljoin(BASE_URL, "/api/stock/list"), 
                 params={"page": 1, "per_page": 5})
    
    # 测试无效路由
    print("🚨 测试错误处理")
    print(SEPARATOR)
    try:
        response = requests.get(urljoin(BASE_URL, "/api/nonexistent"), timeout=10)
        print(f"无效路由状态码: {response.status_code}")
        if response.status_code == 404:
            print("✅ 正确处理了404错误")
    except ConnectionError as e:
        print(f"❌ 连接错误: {e}")
    except Timeout as e:
        print(f"❌ 请求超时: {e}")
    except RequestException as e:
        print(f"❌ 请求异常: {e}")
    except Exception as e:
        print(f"❌ 错误处理测试失败: {e}")
    print(SEPARATOR)
    
    print("✅ API接口测试完成")


if __name__ == "__main__":
    main()