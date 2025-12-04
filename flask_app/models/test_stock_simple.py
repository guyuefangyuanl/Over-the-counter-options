# -*- coding: utf-8 -*-
"""
StockModel简单测试文件
用于测试StockModel类的导入和基本结构
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_import():
    """测试StockModel类的导入"""
    try:
        from models.stock import StockModel
        print("✓ StockModel导入成功")
        return True
    except Exception as e:
        print(f"✗ StockModel导入失败: {e}")
        return False

def test_class_structure():
    """测试StockModel类的结构"""
    try:
        from models.stock import StockModel
        import inspect
        
        # 检查类是否存在
        if not inspect.isclass(StockModel):
            print("✗ StockModel不是类")
            return False
            
        # 检查方法是否存在
        required_methods = [
            '__init__',
            'save_stock_data',
            'get_stock_data',
            'get_all_stocks',
            'count_stocks'
        ]
        
        for method in required_methods:
            if not hasattr(StockModel, method):
                print(f"✗ StockModel缺少方法: {method}")
                return False
                
        print("✓ StockModel类结构正确")
        print("✓ 所有必需方法存在")
        return True
        
    except Exception as e:
        print(f"✗ StockModel类结构测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("开始测试StockModel...")
    
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
        print("🎉 所有测试通过！StockModel实现正确。")
    else:
        print("❌ 部分测试失败，请检查实现。")

if __name__ == "__main__":
    main()