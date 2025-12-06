# -*- coding: utf-8 -*-
"""
Stock路由测试文件
用于测试Stock路由蓝图的导入和基本结构
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_import():
    """测试stock_bp的导入"""
    try:
        from routes.stock import stock_bp
        print("✓ stock_bp导入成功")
        return True
    except Exception as e:
        print(f"✗ stock_bp导入失败: {e}")
        return False

def test_blueprint_structure():
    """测试蓝图结构"""
    try:
        from routes.stock import stock_bp
        import inspect
        
        # 检查是否为Blueprint实例
        from flask import Blueprint
        if not isinstance(stock_bp, Blueprint):
            print("✗ stock_bp不是Blueprint实例")
            return False
            
        # 检查蓝图名称
        if stock_bp.name != 'stock':
            print(f"✗ stock_bp名称不正确: {stock_bp.name}")
            return False
            
        # 检查URL前缀
        if stock_bp.url_prefix != '/api/stock':
            print(f"✗ stock_bp URL前缀不正确: {stock_bp.url_prefix}")
            return False
            
        print("✓ Blueprint结构正确")
        print("✓ 蓝图名称正确")
        print("✓ URL前缀正确")
        return True
        
    except Exception as e:
        print(f"✗ Blueprint结构测试失败: {e}")
        return False

def test_routes():
    """测试路由注册"""
    try:
        from routes.stock import stock_bp
        
        # 获取所有路由规则
        rules = list(stock_bp.url_map.iter_rules()) if stock_bp.url_map else []
        
        # 检查必需的路由
        required_endpoints = [
            'stock.get_realtime_data',
            'stock.get_history_data',
            'stock.search_stocks',
            'stock.get_stock_list'
        ]
        
        registered_endpoints = [rule.endpoint for rule in rules] if rules else []
        
        missing_endpoints = []
        for endpoint in required_endpoints:
            if endpoint not in registered_endpoints:
                missing_endpoints.append(endpoint)
                
        if missing_endpoints:
            print(f"✗ 缺少路由端点: {missing_endpoints}")
            return False
            
        print("✓ 所有必需路由已注册")
        return True
        
    except Exception as e:
        print(f"✗ 路由测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("开始测试Stock路由...")
    
    tests = [
        test_import,
        test_blueprint_structure,
        test_routes
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
            
    print(f"\n测试结果: {passed}/{total} 通过")
    
    if passed == total:
        print("🎉 所有测试通过！Stock路由实现正确。")
    else:
        print("❌ 部分测试失败，请检查实现。")

if __name__ == "__main__":
    main()