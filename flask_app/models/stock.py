# -*- coding: utf-8 -*-
"""
股票数据模型模块
提供股票数据的存储、查询和管理功能
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError
import logging

# 配置日志
logger = logging.getLogger(__name__)


class StockModel:
    """
    股票数据模型类
    提供股票数据的增删改查操作
    """
    
    def __init__(self, db: Database):
        """
        初始化股票数据模型
        
        Args:
            db (Database): MongoDB数据库实例
        """
        self.db = db
        self.collection: Collection = self.db.stocks
        # 创建索引以提高查询性能
        self.collection.create_index("stock_code", unique=True)
        self.collection.create_index("created_at")
        self.collection.create_index("updated_at")
    
    def save_stock_data(self, stock_code: str, data: Dict[str, Any]) -> bool:
        """
        保存或更新股票数据到MongoDB
        
        Args:
            stock_code (str): 股票代码
            data (Dict[str, Any]): 股票数据
            
        Returns:
            bool: 保存成功返回True，失败返回False
            
        Raises:
            Exception: 数据库操作异常
            
        Example:
            >>> stock_model.save_stock_data("000001", {"name": "平安银行", "price": 12.5})
            True
        """
        try:
            # 添加时间戳
            current_time = datetime.utcnow()
            data["stock_code"] = stock_code
            data["updated_at"] = current_time
            
            # 如果是新记录，设置创建时间
            if "_id" not in data:
                data["created_at"] = current_time
            
            # 使用upsert操作保存或更新数据
            result = self.collection.update_one(
                {"stock_code": stock_code},  # 查询条件
                {"$set": data},  # 更新数据
                upsert=True  # 如果不存在则插入
            )
            
            logger.info(f"股票数据保存成功: {stock_code}")
            return True
            
        except PyMongoError as e:
            logger.error(f"保存股票数据时数据库错误: {stock_code}, 错误: {str(e)}")
            return False
        except ValueError as e:
            logger.error(f"保存股票数据时数据验证错误: {stock_code}, 错误: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"保存股票数据时发生未知错误: {stock_code}, 错误: {str(e)}")
            return False
    
    def get_stock_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        根据股票代码获取数据
        
        Args:
            stock_code (str): 股票代码
            
        Returns:
            Optional[Dict[str, Any]]: 股票数据，如果不存在返回None
            
        Raises:
            Exception: 数据库操作异常
            
        Example:
            >>> stock_model.get_stock_data("000001")
            {"stock_code": "000001", "name": "平安银行", "price": 12.5, ...}
        """
        try:
            # 查询股票数据
            stock_data = self.collection.find_one({"stock_code": stock_code})
            
            if stock_data:
                logger.info(f"成功获取股票数据: {stock_code}")
                return stock_data
            else:
                logger.info(f"未找到股票数据: {stock_code}")
                return None
                
        except PyMongoError as e:
            logger.error(f"获取股票数据时数据库错误: {stock_code}, 错误: {str(e)}")
            return None
        except ValueError as e:
            logger.error(f"获取股票数据时参数验证错误: {stock_code}, 错误: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"获取股票数据时发生未知错误: {stock_code}, 错误: {str(e)}")
            return None
    
    def get_all_stocks(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        分页获取所有股票数据
        
        Args:
            skip (int): 跳过的记录数，默认为0
            limit (int): 返回的记录数，默认为100
            
        Returns:
            List[Dict[str, Any]]: 股票数据列表
            
        Raises:
            Exception: 数据库操作异常
            
        Example:
            >>> stock_model.get_all_stocks(0, 10)
            [{"stock_code": "000001", ...}, {"stock_code": "000002", ...}]
        """
        try:
            # 查询股票数据并分页
            cursor = self.collection.find().skip(skip).limit(limit)
            stocks = list(cursor)
            
            logger.info(f"成功获取股票数据列表，数量: {len(stocks)}")
            return stocks
            
        except PyMongoError as e:
            logger.error(f"获取股票数据列表时数据库错误: {str(e)}")
            return []
        except ValueError as e:
            logger.error(f"获取股票数据列表时参数验证错误: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"获取股票数据列表时发生未知错误: {str(e)}")
            return []
    
    def count_stocks(self) -> int:
        """
        统计股票总数
        
        Returns:
            int: 股票总数
            
        Raises:
            Exception: 数据库操作异常
            
        Example:
            >>> stock_model.count_stocks()
            1250
        """
        try:
            # 统计股票总数
            count = self.collection.count_documents({})
            
            logger.info(f"成功统计股票总数: {count}")
            return count
            
        except PyMongoError as e:
            logger.error(f"统计股票总数时数据库错误: {str(e)}")
            return 0
        except ValueError as e:
            logger.error(f"统计股票总数时参数验证错误: {str(e)}")
            return 0
        except Exception as e:
            logger.error(f"统计股票总数时发生未知错误: {str(e)}")
            return 0