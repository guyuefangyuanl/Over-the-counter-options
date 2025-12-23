# -*- coding: utf-8 -*-
"""
股票数据模型模块
提供股票数据的存储、查询 and 管理功能
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
        """
        try:
            # 添加时间戳
            current_time = datetime.utcnow()
            data["stock_code"] = stock_code
            data["updated_at"] = current_time
            
            # 使用upsert操作保存或更新数据
            result = self.collection.update_one(
                {"stock_code": stock_code},  # 查询条件
                {"$set": data, "$setOnInsert": {"created_at": current_time}},  # 更新数据
                upsert=True  # 如果不存在则插入
            )
            
            logger.info(f"股票数据保存成功: {stock_code}")
            return True
            
        except PyMongoError as e:
            logger.error(f"保存股票数据时数据库错误: {stock_code}, 错误: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"保存股票数据时发生未知错误: {stock_code}, 错误: {str(e)}")
            return False

    def bulk_save_stock_data(self, stock_list: List[Dict[str, Any]]) -> int:
        """
        批量保存或更新股票数据
        
        Args:
            stock_list (List[Dict[str, Any]]): 包含多个股票数据的列表，每个数据必须包含 stock_code
            
        Returns:
            int: 成功处理的数量
        """
        if not stock_list:
            return 0
            
        try:
            from pymongo import UpdateOne
            operations = []
            current_time = datetime.utcnow()
            
            for item in stock_list:
                code = item.get("stock_code")
                if not code: continue
                
                item["updated_at"] = current_time
                # 确保不覆盖 created_at
                update_data = {"$set": item, "$setOnInsert": {"created_at": current_time}}
                
                operations.append(UpdateOne(
                    {"stock_code": code},
                    update_data,
                    upsert=True
                ))
            
            if operations:
                result = self.collection.bulk_write(operations)
                return result.upserted_count + result.modified_count
            return 0
        except Exception as e:
            logger.error(f"批量保存股票数据失败: {e}")
            return 0

    def get_stock_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        根据股票代码获取数据
        
        Args:
            stock_code (str): 股票代码
            
        Returns:
            Optional[Dict[str, Any]]: 股票数据，如果不存在返回None
        """
        try:
            return self.collection.find_one({"stock_code": stock_code}, {"_id": 0})
        except Exception as e:
            logger.error(f"查询股票数据失败: {stock_code}, {e}")
            return None

    def get_all_stocks(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        分页获取所有股票数据
        
        Args:
            skip (int): 跳过的记录数，默认为0
            limit (int): 返回的记录数，默认为100
            
        Returns:
            List[Dict[str, Any]]: 股票数据列表
        """
        try:
            cursor = self.collection.find({}, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(limit)
            return list(cursor)
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

    def count_stocks(self) -> int:
        """
        获取股票总数
        """
        try:
            return self.collection.count_documents({})
        except Exception as e:
            logger.error(f"获取股票总数失败: {e}")
            return 0
