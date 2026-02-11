# -*- coding: utf-8 -*-
"""
股票数据服务模块
提供股票实时数据、历史数据和搜索功能
"""

# import akshare as ak  # 云托管环境暂不需要
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from requests.exceptions import RequestException

# 配置日志
logger = logging.getLogger(__name__)


class StockService:
    """
    股票数据服务类
    提供股票数据获取和处理功能
    """
    
    @staticmethod
    def get_stock_realtime_data(symbol: str) -> Optional[Dict[str, Any]]:
        """获取股票实时数据（云托管环境返回模拟数据）"""
        logger.info(f"返回模拟股票数据: {symbol}")
        return {
            "code": symbol,
            "name": f"股票{symbol}",
            "price": 10.0,
            "change_percent": 0.0,
            "volume": 10000,
            "amount": 100000.0,
            "open": 10.0,
            "high": 10.5,
            "low": 9.8,
            "pre_close": 10.0
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
            
        # 过滤掉没有 rate 的数据并排序
        valid_quotes = [q for q in quotes if q.get("rate") is not None]
        if not valid_quotes:
            return None
            
        return min(valid_quotes, key=lambda x: x.get("rate", float('inf')))

    @staticmethod
    def search_stock(keyword: str) -> Optional[List[Dict[str, Any]]]:
        """搜索股票（云托管环境返回模拟数据）"""
        logger.info(f"返回模拟搜索结果: {keyword}")
        return [
            {"code": "000001", "name": "平安银行", "price": 10.0, "change_percent": 0.0},
            {"code": "000002", "name": "万科A", "price": 15.0, "change_percent": 0.5}
        ]