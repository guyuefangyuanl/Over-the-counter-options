# -*- coding: utf-8 -*-
from typing import Dict, Any, List, Optional
from datetime import datetime
from pymongo.collection import Collection
from pymongo.database import Database
import logging

logger = logging.getLogger(__name__)

class InquiryModel:
    def __init__(self, db: Database):
        self.db = db
        self.collection: Collection = self.db.inquiries
        self._init_indexes()
        self._cache = {}
        self._cache_ttl = 300  # 5分钟缓存

    def _init_indexes(self):
        """初始化数据库索引"""
        try:
            self.collection.create_index("createdAt")
            self.collection.create_index("status")
            self.collection.create_index("phone")
            self.collection.create_index([("contactName", 1), ("status", 1)])
            self.collection.create_index([("selectedProduct.name", "text"), ("selectedProduct.code", "text")])
        except Exception as e:
            logger.warning(f"创建索引失败: {e}")

    def create_inquiry(self, data: Dict[str, Any]) -> str:
        try:
            data["createdAt"] = datetime.utcnow()
            data["status"] = data.get("status", "pending")
            result = self.collection.insert_one(data)
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"创建询价记录失败: {e}")
            return ""

    def get_inquiries(self, limit: int = 20, skip: int = 0, status: str = None) -> List[Dict[str, Any]]:
        try:
            query = {}
            if status:
                query["status"] = status
            
            cursor = self.collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
            inquiries = []
            for item in cursor:
                item["_id"] = str(item["_id"])
                # 转换 datetime 为字符串
                if "createdAt" in item and hasattr(item["createdAt"], "isoformat"):
                    item["createdAt"] = item["createdAt"].isoformat()
                if "updatedAt" in item and hasattr(item["updatedAt"], "isoformat"):
                    item["updatedAt"] = item["updatedAt"].isoformat()
                inquiries.append(item)
            return inquiries
        except Exception as e:
            logger.error(f"获取询价记录失败: {e}")
            return []

    def update_status(self, inquiry_id: str, status: str, remark: str = None, operator: str = None) -> bool:
        from bson.objectid import ObjectId
        try:
            now = datetime.utcnow()
            update_data = {"status": status, "updatedAt": now}
            if remark:
                update_data["remark"] = remark
                
            # 记录历史
            history_entry = {
                "status": status,
                "remark": remark,
                "operator": operator,
                "time": now
            }
            
            result = self.collection.update_one(
                {"_id": ObjectId(inquiry_id)},
                {
                    "$set": update_data,
                    "$push": {"history": history_entry}
                }
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"更新询价状态失败: {e}")
            return False

    def batch_update_status(self, inquiry_ids: List[str], status: str) -> int:
        from bson.objectid import ObjectId
        try:
            update_data = {"status": status, "updatedAt": datetime.utcnow()}
            object_ids = [ObjectId(id) for id in inquiry_ids]
            
            result = self.collection.update_many(
                {"_id": {"$in": object_ids}},
                {"$set": update_data}
            )
            return result.modified_count
        except Exception as e:
            logger.error(f"批量更新询价状态失败: {e}")
            return 0
