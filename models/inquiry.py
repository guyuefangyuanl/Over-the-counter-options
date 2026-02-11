from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any, Tuple
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class InquiryModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'inquiries'
        if db is not None:
            self.collection = db[self.collection_name]
            self._init_indexes()
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def _init_indexes(self):
        try:
            self.collection.create_index("createdAt")
            self.collection.create_index("status")
            self.collection.create_index("phone")
        except Exception as e:
            logger.warning(f"创建索引失败: {e}")

    def create_inquiry(self, data: Dict[str, Any]) -> str:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["createdAt"] = now
        data["updatedAt"] = now
        data["status"] = data.get("status", "pending")
        
        if self._is_cloud():
            try:
                ids = self.cloud_client.add(collection=self.collection_name, data=data)
                return ids[0] if ids else None
            except Exception as e:
                logger.error(f"创建询价失败: {e}")
                return ""
        else:
            if not self.collection:
                return ""
            try:
                result = self.collection.insert_one(data)
                return str(result.inserted_id)
            except Exception as e:
                logger.error(f"创建询价失败: {e}")
                return ""

    def get_inquiries(self, limit: int = 20, skip: int = 0, status: str = None, user_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        if self._is_cloud():
            if not self.cloud_client:
                return [], 0
            
            where_parts = []
            if status:
                where_parts.append(f'status: "{status}"')
            if user_id:
                # Assuming user_id is openid for cloud users
                where_parts.append(f'openid: "{user_id}"')
            
            where_clause = ""
            if where_parts:
                where_clause = f'.where({{{", ".join(where_parts)}}})'
            
            # Count
            count_query = f'db.collection("{self.collection_name}"){where_clause}.count()'
            total = self.cloud_client.count(count_query)
            
            # Query
            query = f'db.collection("{self.collection_name}"){where_clause}.orderBy("createdAt", "desc").skip({skip}).limit({limit}).get()'
            items = self.cloud_client.query(query)
            for item in items:
                if "_id" in item:
                    item["_id"] = str(item["_id"])
            return items, total
        else:
            if not self.collection:
                return [], 0
            
            query = {}
            if status:
                query["status"] = status
            if user_id:
                query["openid"] = user_id # Align field name
                
            total = self.collection.count_documents(query)
            cursor = self.collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
            items = []
            for item in cursor:
                item["_id"] = str(item["_id"])
                for k in ["createdAt", "updatedAt"]:
                    if k in item and hasattr(item[k], "isoformat"):
                        item[k] = item[k].isoformat()
                items.append(item)
            return items, total

    def get_inquiry_by_id(self, inquiry_id: str) -> Optional[Dict[str, Any]]:
        if self._is_cloud():
            safe_id = json.dumps(str(inquiry_id))
            query = f'db.collection("{self.collection_name}").doc({safe_id}).get()'
            items = self.cloud_client.query(query)
            if items:
                item = items[0]
                if "_id" in item:
                    item["_id"] = str(item["_id"])
                return item
            return None
        else:
            if not self.collection:
                return None
            try:
                item = self.collection.find_one({"_id": ObjectId(inquiry_id)})
                if item:
                    item["_id"] = str(item["_id"])
                    for k in ["createdAt", "updatedAt"]:
                        if k in item and hasattr(item[k], "isoformat"):
                            item[k] = item[k].isoformat()
                return item
            except:
                return None

    def update_inquiry(self, inquiry_id: str, data: Dict[str, Any]) -> bool:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["updatedAt"] = now
        
        if self._is_cloud():
            where_js = json.dumps({"_id": inquiry_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data=data
            )
            return updated > 0
        else:
            if not self.collection:
                return False
            result = self.collection.update_one(
                {"_id": ObjectId(inquiry_id)},
                {"$set": data}
            )
            return result.modified_count > 0
