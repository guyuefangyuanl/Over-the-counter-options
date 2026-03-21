# -*- coding: utf-8 -*-
"""测试东方财富 API 获取股票代码"""
import requests
import json

def test_eastmoney_api():
    base_url = "http://push2.eastmoney.com/api/qt/clist/get"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "http://quote.eastmoney.com/",
    }

    markets = [
        ("1", "沪市主板"),
        ("2", "深市主板"),
        ("3", "创业板"),
        ("4", "科创板"),
    ]

    all_codes = []

    for market, name in markets:
        params = {
            "pn": 1,
            "pz": 5000,
            "po": 1,
            "np": 1,
            "ut": "bd1d9ddb04089700cf9c27f6f7426281",
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": f"m:{market},t:23",
            "fields": "f12",
        }

        try:
            print(f"正在获取 {name}...")
            resp = requests.get(base_url, params=params, headers=headers, timeout=30)
            print(f"  Status: {resp.status_code}")
            data = resp.json()

            if data and "data" in data and "diff" in data["data"]:
                items = data["data"]["diff"]
                codes = [item["f12"] for item in items if "f12" in item]
                all_codes.extend(codes)
                print(f"  获取到 {len(codes)} 只股票")
            else:
                print(f"  返回数据为空或格式错误")
                print(f"  Response: {json.dumps(data, ensure_ascii=False)[:300]}")

        except Exception as e:
            print(f"  错误: {e}")

    # 去重
    all_codes = sorted(set(all_codes))
    valid_codes = [c for c in all_codes if c.isdigit() and len(c) == 6]

    print(f"\n总计: {len(valid_codes)} 只有效股票代码")
    if valid_codes:
        print(f"前10个: {valid_codes[:10]}")
        print(f"后10个: {valid_codes[-10:]}")

    return valid_codes

if __name__ == "__main__":
    test_eastmoney_api()