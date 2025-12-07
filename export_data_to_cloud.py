import json
import datetime
import random

def fetch_and_export_data():
    """
    获取A股实时行情并导出为云数据库可导入的JSON格式
    如果网络请求失败，则生成模拟数据。
    """
    print("正在尝试获取A股实时行情...")
    export_data = []
    
    try:
        import akshare as ak
        # 尝试获取实时行情
        df = ak.stock_zh_a_spot_em()
        # 只取前100条
        df = df.head(100)
        records = df.to_dict('records')
        
        for item in records:
            export_data.append({
                "code": str(item.get('代码')),
                "name": item.get('名称'),
                "price": float(item.get('最新价')),
                "changePercent": float(item.get('涨跌幅')),
                "volume": item.get('成交量'),
                "amount": item.get('成交额'),
                "updateTime": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
        print("✅ 成功从 AkShare 获取数据")
            
    except Exception as e:
        print(f"⚠️ 网络获取失败 ({e})，正在生成模拟数据...")
        # 生成模拟数据
        mock_stocks = [
            ("600519", "贵州茅台", 1750.00), ("300750", "宁德时代", 180.50),
            ("002594", "比亚迪", 240.20), ("601318", "中国平安", 45.30),
            ("600036", "招商银行", 32.15), ("000858", "五粮液", 145.80)
        ]
        
        for code, name, base_price in mock_stocks:
            price = base_price * (1 + random.uniform(-0.05, 0.05))
            export_data.append({
                "code": code,
                "name": name,
                "price": round(price, 2),
                "changePercent": round(random.uniform(-3, 3), 2),
                "volume": random.randint(10000, 1000000),
                "amount": random.randint(1000000, 100000000),
                "updateTime": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
        print("✅ 已生成模拟数据")

    # 写入文件
    filename = "quotes_data.json"
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            for record in export_data:
                # 每一行写入一个JSON对象 (JSON Lines)
                f.write(json.dumps(record, ensure_ascii=False) + '\n')
        
        print(f"\n🎉 导出成功！文件路径: {filename}")
        print(f"共导出 {len(export_data)} 条数据")
        print("\n下一步操作：")
        print("1. 打开微信开发者工具 -> 云开发 -> 数据库")
        print("2. 选中/创建 'quotes' 集合")
        print("3. 点击导入 -> 选择此文件 -> 选择 JSON 格式")
    except Exception as e:
        print(f"❌ 文件写入失败: {e}")

if __name__ == "__main__":
    fetch_and_export_data()
