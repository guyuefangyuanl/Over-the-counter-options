# -*- coding: utf-8 -*-
"""
股票数据服务模块
提供股票实时数据、历史数据和搜索功能
"""

# import akshare as ak  # 云托管环境暂不需要
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

# 配置日志
logger = logging.getLogger(__name__)


class StockService:
    """
    股票数据服务类
    提供股票数据获取和处理功能
    """
    
    @staticmethod
    def get_stock_realtime_data(symbol: str) -> Optional[Dict[str, Any]]:
        """
        获取股票实时数据（优先云端/本地 mock，最后才返回兜底 Mock）。

        说明：
        - 前端/小程序使用字段名 `changePercent`
        - 本地 `mock_db.json` 使用 `stocks[*].changePercent`（也包含 `change_percent` 兼容字段）
        """
        if not symbol:
            return None

        symbol = str(symbol).strip()
        if not symbol:
            return None

        # 1) 优先读取云数据库 quotes（如果云可用）
        try:
            from flask import current_app

            cloud_db = getattr(current_app, "cloud_db", None)
            if cloud_db:
                # 股票在 quotes 集合里通常使用 code / stock_code 作为标识
                query = (
                    f'db.collection("quotes").where({{code: "{symbol}"}}).limit(1).get()'
                )
                items = cloud_db.query(query)
                if items:
                    item = items[0] or {}
                    pre_close = item.get("pre_close", None)
                    if pre_close is None:
                        pre_close = item.get("preClose", None)

                    change_percent = item.get("changePercent", None)
                    if change_percent is None:
                        change_percent = item.get("change_percent", None)

                    return {
                        "code": symbol,
                        "name": item.get("name", f"股票{symbol}"),
                        "price": item.get("price"),
                        "changePercent": change_percent,
                        "change_percent": change_percent,  # 兼容旧字段名
                        "volume": item.get("volume"),
                        "amount": item.get("amount"),
                        "open": item.get("open"),
                        "high": item.get("high"),
                        "low": item.get("low"),
                        "pre_close": pre_close,
                        "updateSource": item.get("updateSource", "cloud_quote"),
                        "updated_at": item.get("updated_at") or item.get("updateTime"),
                    }
        except Exception as e:
            # 云端查询失败不应阻断行情展示，继续走本地 mock
            logger.warning(f"[get_stock_realtime_data] 云端读取失败: symbol={symbol}, err={e}")

        # 2) 读取本地 mock_db.json（由 sync_quotes 的回退写入）
        try:
            from models.stock import StockModel

            model = StockModel(None)  # None => 使用本地 mock_db.json
            stock_data = model.get_stock_data(symbol)
            if stock_data:
                # 统一返回字段名（确保 changePercent 存在）
                change_percent = stock_data.get("changePercent", stock_data.get("change_percent", 0.0))
                return {
                    "code": symbol,
                    "name": stock_data.get("name", f"股票{symbol}"),
                    "price": stock_data.get("price"),
                    "changePercent": change_percent,
                    "change_percent": change_percent,  # 兼容旧字段名
                    "volume": stock_data.get("volume"),
                    "amount": stock_data.get("amount"),
                    "open": stock_data.get("open"),
                    "high": stock_data.get("high"),
                    "low": stock_data.get("low"),
                    "pre_close": stock_data.get("pre_close"),
                    "updateSource": stock_data.get("updateSource"),
                    "updated_at": stock_data.get("updated_at"),
                }
        except Exception as e:
            logger.warning(f"[get_stock_realtime_data] 本地mock读取失败: symbol={symbol}, err={e}")

        # 3) 兜底 Mock（避免前端报错，但带明显的“占位”特征）
        logger.info(f"[get_stock_realtime_data] 未找到行情数据，使用兜底 Mock: {symbol}")
        return {
            "code": symbol,
            "name": f"股票{symbol}",
            "price": 0.0,
            "changePercent": 0.0,
            "change_percent": 0.0,
            "volume": 0,
            "amount": 0.0,
            "open": 0.0,
            "high": 0.0,
            "low": 0.0,
            "pre_close": 0.0,
            "updateSource": "mock_fallback",
            "updated_at": None,
        }
    
    @staticmethod
    def get_stock_history_data(
        symbol: str, 
        period: str = "daily", 
        start_date: str = "", 
        end_date: str = ""
    ) -> Optional[List[Dict[str, Any]]]:
        """获取股票历史数据（云托管环境返回模拟数据）"""
        logger.info(f"返回模拟历史数据: {symbol}")
        from datetime import datetime, timedelta
        
        # 生成模拟数据
        result = []
        base_price = 10.0
        for i in range(30):
            date = datetime.now() - timedelta(days=i)
            result.append({
                "date": date.strftime('%Y-%m-%d'),
                "open": base_price,
                "high": base_price * 1.05,
                "low": base_price * 0.95,
                "close": base_price,
                "volume": 10000,
                "amount": 100000.0,
                "change_percent": 0.0
            })
        return result[::-1]  # 倒序排列
    
    @staticmethod
    def get_quotes_comparison(stock_code: str, quote_type: Optional[str] = None, term: Optional[str] = None, cloud_client: Any = None) -> List[Dict[str, Any]]:
        """
        获取不同交易商的报价比较
        """
        if not cloud_client:
            return []
            
        try:
            # 构造查询语句
            query_parts = [f'stock_code: "{stock_code}"']
            if quote_type:
                query_parts.append(f'type: "{quote_type}"')
            if term:
                query_parts.append(f'term: "{term}"')
            
            where_js = "{" + ", ".join(query_parts) + "}"
            query = f'db.collection("quotes").where({where_js}).get()'
            
            quotes = cloud_client.query(query)
            if not quotes:
                return []
                
            # 按交易商分组，并找出最低报价
            # 如果没有指定 type 和 term，可能返回很多数据，这里简单按交易商+类型+期限分组
            return quotes
            
        except Exception as e:
            logger.error(f"获取报价比较失败: {stock_code}, {e}")
            return []

    @staticmethod
    def get_lowest_quote(stock_code: str, quote_type: str, term: str, cloud_client: Any = None) -> Optional[Dict[str, Any]]:
        """
        获取指定股票在特定类型和期限下的最低报价
        """
        quotes = StockService.get_quotes_comparison(stock_code, quote_type, term, cloud_client)
        if not quotes:
            return None
            
        # 支持兼容字段：部分数据源写入的是 rates（复数），部分写入 rate（单数）
        def _get_rate(q: Dict[str, Any]) -> Optional[float]:
            rate = q.get("rate", None)
            if rate is None:
                rate = q.get("rates", None)
            return rate

        valid_quotes = []
        for q in quotes:
            rate_val = _get_rate(q)
            if rate_val is not None:
                q2 = dict(q)
                # 统一回填到 rate，保证下游逻辑只关心 rate
                q2["rate"] = rate_val
                valid_quotes.append(q2)

        if not valid_quotes:
            return None

        return min(valid_quotes, key=lambda x: x.get("rate", float("inf")))

    @staticmethod
    def search_stock(keyword: str) -> Optional[List[Dict[str, Any]]]:
        """搜索股票（云托管环境返回模拟数据）"""
        logger.info(f"返回模拟搜索结果: {keyword}")
        return [
            {"code": "000001", "name": "平安银行", "price": 10.0, "change_percent": 0.0},
            {"code": "000002", "name": "万科A", "price": 15.0, "change_percent": 0.5}
        ]