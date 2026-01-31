#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""综合诊断询价云数据库问题"""
import os
import sys
import json
from dotenv import load_dotenv
from services.cloud_db import CloudDbClient

def main():
    # 加载环境变量
    load_dotenv()
    
    print("=" * 80)
    print("询价云数据库综合诊断")
    print("=" * 80)
    
    # 检查环境变量
    print("\n【步骤1】环境变量检查")
    print("-" * 80)
    env_id = os.getenv('WX_CLOUD_ENV')
    appid = os.getenv('WX_APPID')
    secret = os.getenv('WX_SECRET')
    
    print(f"WX_CLOUD_ENV = {env_id}")
    print(f"WX_APPID = {appid[:10]}... (已隐藏)")
    print(f"WX_SECRET = {secret[:10]}... (已隐藏)")
    
    if not all([env_id, appid, secret]):
        print("❌ 环境变量配置不完整")
        sys.exit(1)
    
    try:
        # 初始化云数据库客户端
        print("\n【步骤2】初始化云数据库客户端")
        print("-" * 80)
        client = CloudDbClient.from_env()
        print("✓ 云数据库客户端初始化成功")
        
        # 测试1: 查询所有询价数据
        print("\n【步骤3】查询所有询价数据（不加条件）")
        print("-" * 80)
        query1 = 'db.collection("inquiries").get()'
        print(f"查询语句: {query1}")
        result1 = client.query(query1)
        print(f"结果数量: {len(result1)}")
        
        if len(result1) > 0:
            print(f"\n✓✓✓ 找到 {len(result1)} 条询价数据")
            print("\n前5条数据概要:")
            for i, item in enumerate(result1[:5], 1):
                print(f"  {i}. ID={item.get('_id')}")
                print(f"     联系人={item.get('contactName')}, 电话={item.get('phone')}")
                print(f"     产品={item.get('productName')}, 代码={item.get('productCode')}")
                print(f"     状态={item.get('status')}, 创建时间={item.get('createdAt')}")
                print(f"     所有字段: {list(item.keys())}")
                print()
        else:
            print("❌ 云数据库中没有询价数据")
            print("\n可能的原因:")
            print("1. inquiries 集合不存在（需要在云开发控制台创建）")
            print("2. 小程序提交的数据保存失败")
            print("3. 环境ID不正确（当前环境ID: {}）".format(env_id))
            sys.exit(1)
        
        # 测试2: 查询特定ID的询价
        print("\n【步骤4】查询特定ID的询价")
        print("-" * 80)
        target_id = "33a086d96977715f00b938774d8fb279"
        query2 = f'db.collection("inquiries").where({{_id: "{target_id}"}}).get()'
        print(f"查询语句: {query2}")
        result2 = client.query(query2)
        print(f"结果数量: {len(result2)}")
        
        if len(result2) > 0:
            print("\n✓ 找到指定ID的询价数据:")
            item = result2[0]
            print(json.dumps(item, ensure_ascii=False, indent=2))
        else:
            print(f"\n❌ 未找到ID为 {target_id} 的询价数据")
            print("这可能说明:")
            print("1. 小程序提交的数据没有成功保存")
            print("2. 数据保存在其他环境中")
            print("3. _id格式不匹配")
        
        # 测试3: 使用后台API相同的查询方式
        print("\n【步骤5】模拟后台API的查询方式")
        print("-" * 80)
        query3 = 'db.collection("inquiries").orderBy("createdAt", "desc").get()'
        print(f"查询语句: {query3}")
        result3 = client.query(query3)
        print(f"结果数量: {len(result3)}")
        
        if len(result3) > 0:
            print("\n✓ 后台API查询方式可以获取到数据")
            print(f"这说明后台Flask代码逻辑正常，但前端可能没有正确显示数据")
        else:
            print("\n❌ 后台API查询方式也无法获取数据")
            print("这说明后台代码逻辑可能有问题")
        
        # 测试4: 检查统计数据
        print("\n【步骤6】检查统计数据")
        print("-" * 80)
        stats_queries = {
            'pending': "db.collection('inquiries').where({status: 'pending'}).count()",
            'processing': "db.collection('inquiries').where({status: 'processing'}).count()",
            'completed': "db.collection('inquiries').where({status: 'completed'}).count()",
            'rejected': "db.collection('inquiries').where({status: 'rejected'}).count()",
            'total': "db.collection('inquiries').count()"
        }
        
        stats = {}
        for status, query in stats_queries.items():
            try:
                count = client.count(query)
                stats[status] = count
                print(f"  {status}: {count}")
            except Exception as e:
                print(f"  {status}: 查询失败 - {e}")
        
        print("\n" + "=" * 80)
        print("诊断完成")
        print("=" * 80)
        
        # 总结
        print("\n【诊断总结】")
        total = stats.get('total', 0)
        if total > 0:
            print(f"✓ 云数据库中有 {total} 条询价数据")
            print(f"  - 待处理: {stats.get('pending', 0)}")
            print(f"  - 处理中: {stats.get('processing', 0)}")
            print(f"  - 已完成: {stats.get('completed', 0)}")
            print(f"  - 已拒绝: {stats.get('rejected', 0)}")
            print("\n建议:")
            print("1. 检查后台Flask服务的日志输出")
            print("2. 检查前端admin-ui的API请求和响应")
            print("3. 确认前端代码的分页参数是否正确")
        else:
            print("❌ 云数据库中没有询价数据")
            print("\n建议:")
            print("1. 在小程序中重新提交一次询价")
            print("2. 检查小程序代码的提交逻辑")
            print("3. 在微信开发者工具中检查云函数调用日志")
            print("4. 确认环境ID配置正确")
        
    except Exception as e:
        print(f"\n❌❌❌ 诊断失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
