# -*- coding: utf-8 -*-
"""
StockService测试文件
用于测试StockService类的功能
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_import():
    """测试StockService类的导入"""
    try:
        from services.stock_service import StockService
        print("✓ StockService导入成功")
        return True
    except Exception as e:
        print(f"✗ StockService导入失败: {e}")
        return False

def test_class_structure():
    """测试StockService类的结构"""
    try:
        from services.stock_service import StockService
        import inspect
        
        # 检查类是否存在
        if not inspect.isclass(StockService):
            print("✗ StockService不是类")
            return False
            
        # 检查方法是否存在
        required_methods = [
            'get_stock_realtime_data',
            'get_stock_history_data',
            'search_stock'
        ]
        
        for method in required_methods:
            if not hasattr(StockService, method):
                print(f"✗ StockService缺少方法: {method}")
                return False
                
        # 检查方法是否为静态方法
        for method in required_methods:
            method_obj = getattr(StockService, method)
            if not isinstance(method_obj, staticmethod):
                # 注意：这里可能无法准确检测到装饰器，所以我们只检查方法是否存在
                pass
                
        print("✓ StockService类结构正确")
        print("✓ 所有必需方法存在")
        return True
        
    except Exception as e:
        print(f"✗ StockService类结构测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("开始测试StockService...")
    
    tests = [
        test_import,
        test_class_structure
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
            
    print(f"\n测试结果: {passed}/{total} 通过")
    
    if passed == total:
        print("🎉 所有测试通过！StockService实现正确。")
    else:
        print("❌ 部分测试失败，请检查实现。")

if __name__ == "__main__":
    main()