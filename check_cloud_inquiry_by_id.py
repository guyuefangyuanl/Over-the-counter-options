#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查云数据库中的询价数据"""
import os
import sys
from dotenv import load_dotenv
from services.cloud_db import CloudDbClient

def main():
    # 加载环境变量
    load_dotenv()
    
    inquiry_id = "33a086d96977715f00b938774d8fb279"
    
    print("=" * 60)
    print(f"检查询价ID: {inquiry_id}")
    print("=" * 60)
    
    try:
        # 初始化云数据库客户端
        client = CloudDbClient.from_env()
        print("✓ 云数据库客户端初始化成功")
        
        # 查询特定ID的询价
        query = f'db.collection("inquiries").where({{_id: "{inquiry_id}"}}).get()'
        print(f"\n查询语句: {query}")
        result = client.query(query)
        
        print(f"\n查询结果数量: {len(result)}")
        
        if result:
            print("\n✓✓✓ 找到询价数据:")
            print("-" * 60)
            for item in result:
                print(f"ID: {item.get('_id')}")
                print(f"联系人: {item.get('contactName')}")
                print(f"电话: {item.get('phone')}")
                print(f"产品名称: {item.get('productName')}")
                print(f"产品代码: {item.get('productCode')}")
                print(f"状态: {item.get('status')}")
                print(f"创建时间: {item.get('createdAt')}")
                print(f"完整数据: {item}")
        else:
            print("\n❌ 未找到该询价数据")
            print("\n尝试查询所有询价数据...")
            all_query = 'db.collection("inquiries").orderBy("createdAt", "desc").limit(10).get()'
            all_result = client.query(all_query)
            print(f"所有询价数量: {len(all_result)}")
            if all_result:
                print("\n最新10条询价:")
                for i, item in enumerate(all_result, 1):
                    print(f"{i}. ID={item.get('_id')}, 联系人={item.get('contactName')}, 产品={item.get('productName')}")
        
    except Exception as e:
        print(f"\n❌❌❌ 检查失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
