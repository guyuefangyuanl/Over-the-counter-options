# -*- coding: utf-8 -*-
"""
股票数据服务模块
提供股票实时数据、历史数据和搜索功能
"""

import akshare as ak
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
        """
        获取股票实时数据
        
        Args:
            symbol (str): 股票代码，例如 "000001"
            
        Returns:
            Optional[Dict[str, Any]]: 股票实时数据字典，如果获取失败返回None
            
        Example:
            >>> StockService.get_stock_realtime_data("000001")
            {
                "code": "000001",
                "name": "平安银行",
                "price": 12.5,
                "change_percent": 1.2,
                "volume": 1000000,
                "amount": 12500000,
                "open": 12.3,
                "high": 12.6,
                "low": 12.2,
                "pre_close": 12.4
            }
        """
        try:
            # 获取A股实时行情数据
            stock_data = ak.stock_zh_a_spot_em()
            
            # 根据股票代码筛选数据
            filtered_data = stock_data[stock_data['代码'] == symbol]
            
            if filtered_data.empty:
                logger.warning(f"未找到股票代码: {symbol}")
                return None
            
            # 获取第一条数据
            row = filtered_data.iloc[0]
            
            # 格式化返回数据
            result = {
                "code": row['代码'],
                "name": row['名称'],
                "price": float(row['最新价']) if row['最新价'] != '-' else 0.0,
                "change_percent": float(row['涨跌幅'].strip('%')) if row['涨跌幅'] != '-' else 0.0,
                "volume": int(row['成交量']) if row['成交量'] != '-' else 0,
                "amount": float(row['成交额']) if row['成交额'] != '-' else 0.0,
                "open": float(row['今开']) if row['今开'] != '-' else 0.0,
                "high": float(row['最高']) if row['最高'] != '-' else 0.0,
                "low": float(row['最低']) if row['最低'] != '-' else 0.0,
                "pre_close": float(row['昨收']) if row['昨收'] != '-' else 0.0
            }
            
            logger.info(f"成功获取股票实时数据: {symbol}")
            return result
            
        except RequestException as e:
            logger.error(f"获取股票实时数据时网络请求失败: {symbol}, 错误: {str(e)}")
            return None
        except ValueError as e:
            logger.error(f"获取股票实时数据时数据转换失败: {symbol}, 错误: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"获取股票实时数据时发生未知错误: {symbol}, 错误: {str(e)}")
            return None
    
    @staticmethod
    def get_stock_history_data(
        symbol: str, 
        period: str = "daily", 
        start_date: str = "", 
        end_date: str = ""
    ) -> Optional[List[Dict[str, Any]]]:
        """
        获取股票历史数据
        
        Args:
            symbol (str): 股票代码，例如 "000001"
            period (str): 周期类型，可选 "daily"(日线)、"weekly"(周线)、"monthly"(月线)，默认为"daily"
            start_date (str): 开始日期，格式 "YYYYMMDD"，默认为空表示最近一年
            end_date (str): 结束日期，格式 "YYYYMMDD"，默认为空表示今天
            
        Returns:
            Optional[List[Dict[str, Any]]]: 股票历史数据列表，如果获取失败返回None
            
        Example:
            >>> StockService.get_stock_history_data("000001", "daily", "20230101", "20231231")
            [
                {
                    "date": "2023-01-01",
                    "open": 12.3,
                    "high": 12.6,
                    "low": 12.2,
                    "close": 12.5,
                    "volume": 1000000,
                    "amount": 12500000,
                    "change_percent": 1.2
                },
                ...
            ]
        """
        try:
            # 参数验证
            if period not in ["daily", "weekly", "monthly"]:
                logger.warning(f"不支持的周期类型: {period}")
                period = "daily"
            
            # 设置周期参数
            period_map = {
                "daily": "daily",
                "weekly": "weekly",
                "monthly": "monthly"
            }
            
            # 获取历史数据
            # 使用前复权数据
            stock_data = ak.stock_zh_a_hist(
                symbol=symbol,
                period=period_map[period],
                start_date=start_date,
                end_date=end_date,
                adjust="qfq"  # 前复权
            )
            
            if stock_data.empty:
                logger.warning(f"未获取到股票历史数据: {symbol}")
                return []
            
            # 转换为列表格式
            result = []
            for _, row in stock_data.iterrows():
                item = {
                    "date": row['日期'].strftime('%Y-%m-%d') if isinstance(row['日期'], datetime) else str(row['日期']),
                    "open": float(row['开盘']) if row['开盘'] != '-' else 0.0,
                    "high": float(row['最高']) if row['最高'] != '-' else 0.0,
                    "low": float(row['最低']) if row['最低'] != '-' else 0.0,
                    "close": float(row['收盘']) if row['收盘'] != '-' else 0.0,
                    "volume": int(row['成交量']) if row['成交量'] != '-' else 0,
                    "amount": float(row['成交额']) if row['成交额'] != '-' else 0.0,
                    "change_percent": float(row['涨跌幅'].strip('%')) if '涨跌幅' in row and row['涨跌幅'] != '-' else 0.0
                }
                result.append(item)
            
            logger.info(f"成功获取股票历史数据: {symbol}, 数量: {len(result)}")
            return result
            
        except RequestException as e:
            logger.error(f"获取股票历史数据时网络请求失败: {symbol}, 错误: {str(e)}")
            return None
        except ValueError as e:
            logger.error(f"获取股票历史数据时数据转换失败: {symbol}, 错误: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"获取股票历史数据时发生未知错误: {symbol}, 错误: {str(e)}")
            return None
    
    @staticmethod
    def search_stock(keyword: str) -> Optional[List[Dict[str, Any]]]:
        """
        搜索股票
        
        Args:
            keyword (str): 搜索关键词，可以是股票代码或名称
            
        Returns:
            Optional[List[Dict[str, Any]]]: 搜索结果列表，最多返回20条，如果搜索失败返回None
            
        Example:
            >>> StockService.search_stock("平安")
            [
                {
                    "code": "000001",
                    "name": "平安银行",
                    "price": 12.5,
                    "change_percent": 1.2
                },
                ...
            ]
        """
        try:
            # 获取A股实时行情数据
            stock_data = ak.stock_zh_a_spot_em()
            
            # 根据关键词筛选数据（代码或名称）
            filtered_data = stock_data[
                (stock_data['代码'].str.contains(keyword, case=False)) |
                (stock_data['名称'].str.contains(keyword, case=False))
            ]
            
            # 限制返回前20条结果
            filtered_data = filtered_data.head(20)
            
            if filtered_data.empty:
                logger.info(f"未找到匹配的股票: {keyword}")
                return []
            
            # 格式化返回数据
            result = []
            for _, row in filtered_data.iterrows():
                item = {
                    "code": row['代码'],
                    "name": row['名称'],
                    "price": float(row['最新价']) if row['最新价'] != '-' else 0.0,
                    "change_percent": float(row['涨跌幅'].strip('%')) if row['涨跌幅'] != '-' else 0.0
                }
                result.append(item)
            
            logger.info(f"股票搜索完成: {keyword}, 结果数量: {len(result)}")
            return result
            
        except RequestException as e:
            logger.error(f"股票搜索时网络请求失败: {keyword}, 错误: {str(e)}")
            return None
        except ValueError as e:
            logger.error(f"股票搜索时数据转换失败: {keyword}, 错误: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"股票搜索时发生未知错误: {keyword}, 错误: {str(e)}")
            return None