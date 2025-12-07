# -*- coding: utf-8 -*-
"""
StockModel测试文件
用于测试StockModel类的功能
"""

import sys
import os
from pymongo import MongoClient
from datetime import datetime

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.stock import StockModel

def test_stock_model():
    """测试StockModel类的功能"""
    # 连接到MongoDB测试数据库
    client = MongoClient('mongodb://localhost:27017/')
    db = client['option_test_db']
    
    # 创建StockModel实例
    stock_model = StockModel(db)
    
    print("开始测试StockModel...")
    
    # 测试保存股票数据
    print("\n1. 测试保存股票数据...")
    test_data = {
        "name": "测试股票",
        "price": 12.5,
        "volume": 1000000,
        "market": "SZ"
    }
    
    result = stock_model.save_stock_data("TEST001", test_data)
    print(f"保存结果: {result}")
    
    # 测试获取股票数据
    print("\n2. 测试获取股票数据...")
    stock_data = stock_model.get_stock_data("TEST001")
    print(f"获取到的数据: {stock_data}")
    
    # 测试更新股票数据
    print("\n3. 测试更新股票数据...")
    updated_data = {
        "name": "测试股票更新版",
        "price": 13.2,
        "volume": 1200000,
        "market": "SZ"
    }
    
    result = stock_model.save_stock_data("TEST001", updated_data)
    print(f"更新结果: {result}")
    
    # 再次获取数据验证更新
    stock_data = stock_model.get_stock_data("TEST001")
    print(f"更新后的数据: {stock_data}")
    
    # 测试获取所有股票数据
    print("\n4. 测试获取所有股票数据...")
    all_stocks = stock_model.get_all_stocks(0, 10)
    print(f"获取到的股票数量: {len(all_stocks)}")
    
    # 测试统计股票总数
    print("\n5. 测试统计股票总数...")
    count = stock_model.count_stocks()
    print(f"股票总数: {count}")
    
    # 清理测试数据
    print("\n6. 清理测试数据...")
    db.stocks.delete_many({"stock_code": "TEST001"})
    
    print("\n测试完成！")
    
    # 关闭数据库连接
    client.close()

if __name__ == "__main__":
    test_stock_model()