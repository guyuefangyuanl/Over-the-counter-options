# -*- coding: utf-8 -*-
from typing import Dict, Any, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo.database import Database
import logging

logger = logging.getLogger(__name__)

class OrderModel:
    def __init__(self, db: Database):
        self.db = db
        self.collection: Collection = self.db.orders
        self.collection.create_index("orderId", unique=True)
        self.collection.create_index("createdAt")

    def create_order(self, data: Dict[str, Any]) -> str:
        try:
            data["createdAt"] = datetime.utcnow()
            # 生成简单的订单号
            import time
            data["orderId"] = f"ORD{int(time.time()*1000)}"
            result = self.collection.insert_one(data)
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"创建订单失败: {e}")
            return ""

    def get_orders(self, limit: int = 20, skip: int = 0) -> List[Dict[str, Any]]:
        try:
            cursor = self.collection.find().sort("createdAt", -1).skip(skip).limit(limit)
            orders = []
            for item in cursor:
                item["_id"] = str(item["_id"])
                # 转换 datetime 为字符串
                if "createdAt" in item and hasattr(item["createdAt"], "isoformat"):
                    item["createdAt"] = item["createdAt"].isoformat()
                if "updatedAt" in item and hasattr(item["updatedAt"], "isoformat"):
                    item["updatedAt"] = item["updatedAt"].isoformat()
                orders.append(item)
            return orders
        except Exception as e:
            logger.error(f"获取订单列表失败: {e}")
            return []
