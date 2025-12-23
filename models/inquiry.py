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
        self.collection.create_index("createdAt")

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
                inquiries.append(item)
            return inquiries
        except Exception as e:
            logger.error(f"获取询价记录失败: {e}")
            return []

    def update_status(self, inquiry_id: str, status: str, remark: str = None) -> bool:
        from bson.objectid import ObjectId
        try:
            update_data = {"status": status, "updatedAt": datetime.utcnow()}
            if remark:
                update_data["remark"] = remark
                
            result = self.collection.update_one(
                {"_id": ObjectId(inquiry_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"更新询价状态失败: {e}")
            return False
