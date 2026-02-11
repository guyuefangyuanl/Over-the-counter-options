from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any, Tuple
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class OrderModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'orders'
        if db is not None:
            self.collection = db[self.collection_name]
            try:
                self.collection.create_index("orderId", unique=True)
                self.collection.create_index("createdAt")
            except:
                pass
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_order(self, data: Dict[str, Any]) -> str:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["createdAt"] = now
        data["updatedAt"] = now
        # Generate Order ID if not present
        if "orderId" not in data:
            import time
            data["orderId"] = f"ORD{int(time.time()*1000)}"
            
        if self._is_cloud():
            try:
                ids = self.cloud_client.add(collection=self.collection_name, data=data)
                return ids[0] if ids else None
            except Exception as e:
                logger.error(f"创建订单失败: {e}")
                return ""
        else:
            if not self.collection:
                return ""
            try:
                result = self.collection.insert_one(data)
                return str(result.inserted_id)
            except Exception as e:
                logger.error(f"创建订单失败: {e}")
                return ""

    def get_orders(self, limit: int = 20, skip: int = 0, status: str = None, user_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        if self._is_cloud():
            if not self.cloud_client:
                return [], 0
            
            where_parts = []
            if status:
                where_parts.append(f'status: "{status}"')
            if user_id:
                where_parts.append(f'openid: "{user_id}"')
            
            where_clause = ""
            if where_parts:
                where_clause = f'.where({{{", ".join(where_parts)}}})'
            
            count_query = f'db.collection("{self.collection_name}"){where_clause}.count()'
            total = self.cloud_client.count(count_query)
            
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
                query["openid"] = user_id
                
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

    def update_order(self, order_id: str, data: Dict[str, Any]) -> bool:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["updatedAt"] = now
        
        if self._is_cloud():
            where_js = json.dumps({"_id": order_id})
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
                {"_id": ObjectId(order_id)},
                {"$set": data}
            )
            return result.modified_count > 0
