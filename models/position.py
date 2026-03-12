from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any, Tuple
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class PositionModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'positions'
        if db is not None:
            self.collection = db[self.collection_name]
            try:
                self.collection.create_index("customerId")
                self.collection.create_index("productCode")
            except:
                pass
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def get_positions(self, limit: int = 20, skip: int = 0, customer_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        if self._is_cloud():
            if not self.cloud_client:
                return [], 0
            
            where_clause = ""
            if customer_id:
                where_clause = f'.where({{customerId: "{customer_id}"}})'  
            
            try:
                count_query = f'db.collection("{self.collection_name}"){where_clause}.count()'
                total = self.cloud_client.count(count_query)
                
                query = f'db.collection("{self.collection_name}"){where_clause}.orderBy("createdAt", "desc").skip({skip}).limit({limit}).get()'
                items = self.cloud_client.query(query)
                for item in items:
                    if "_id" in item:
                        item["_id"] = str(item["_id"])
                return items, total
            except Exception as e:
                logger.warning(f"[get_positions] 云数据库查询失败，返回空数据: {e}")
                return [], 0
        else:
            if not self.collection:
                return [], 0
            
            query = {}
            if customer_id:
                query["customerId"] = customer_id
                
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

    def get_statistics(self, customer_id: str = None) -> Dict[str, Any]:
        # This requires aggregation which is hard with Cloud DB simple client
        # We will do simple fetch and sum for now if data is small, or use count for count.
        # For large data, this is not efficient on Cloud DB without cloud functions.
        # But for local mongo, we can use aggregate.
        
        stats = {
            "totalMarketValue": 0,
            "totalProfitLoss": 0,
            "totalCount": 0
        }
        
        if self._is_cloud():
            # Limited implementation: Fetch all (up to 1000) and sum
            # This is a limitation of the current CloudClient
            if not self.cloud_client:
                return stats
                
            where_clause = '.where({status: "active"})'
            if customer_id:
                where_clause = f'.where({{status: "active", customerId: "{customer_id}"}})'
                
            query = f'db.collection("{self.collection_name}"){where_clause}.limit(1000).get()'
            try:
                items = self.cloud_client.query(query)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"[get_statistics] 云数据库查询失败，返回空统计: {e}")
                return stats
            
            stats["totalCount"] = len(items)
            for item in items:
                stats["totalMarketValue"] += float(item.get("marketValue", 0))
                stats["totalProfitLoss"] += float(item.get("profitLoss", 0))
                
        else:
            if not self.collection:
                return stats
                
            match = {"status": "active"}
            if customer_id:
                match["customerId"] = customer_id
                
            pipeline = [
                {"$match": match},
                {"$group": {
                    "_id": None,
                    "totalMarketValue": {"$sum": "$marketValue"},
                    "totalProfitLoss": {"$sum": "$profitLoss"},
                    "count": {"$sum": 1}
                }}
            ]
            result = list(self.collection.aggregate(pipeline))
            if result:
                stats["totalMarketValue"] = result[0]["totalMarketValue"]
                stats["totalProfitLoss"] = result[0]["totalProfitLoss"]
                stats["totalCount"] = result[0]["count"]
                
        return stats

    def create_positions(self, positions: List[Dict[str, Any]]) -> bool:
        if not positions:
            return False
            
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        for p in positions:
            p["createdAt"] = now
            p["updatedAt"] = now
            # Default fields if missing
            if "status" not in p:
                p["status"] = "active"
            if "currency" not in p:
                p["currency"] = "CNY"
            if "market" not in p:
                p["market"] = "CN"
            
        if self._is_cloud():
            # Cloud DB usually supports add one by one
            success_count = 0
            for p in positions:
                try:
                    self.cloud_client.add(collection=self.collection_name, data=p)
                    success_count += 1
                except:
                    pass
            return success_count > 0
        else:
            if not self.collection:
                return False
            result = self.collection.insert_many(positions)
            return len(result.inserted_ids) > 0

    def create_position(self, data: Dict[str, Any]) -> str:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["createdAt"] = now
        data["updatedAt"] = now
        if "status" not in data:
            data["status"] = "active"
        if "currency" not in data:
            data["currency"] = "CNY"
        if "market" not in data:
            data["market"] = "CN"
            
        if self._is_cloud():
            ids = self.cloud_client.add(collection=self.collection_name, data=data)
            return ids[0] if ids else None
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.insert_one(data)
            return str(result.inserted_id)

    def update_position(self, position_id: str, data: Dict[str, Any]) -> bool:
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["updatedAt"] = now
        
        if self._is_cloud():
            where_js = json.dumps({"_id": position_id})
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
                {'_id': ObjectId(position_id)},
                {'$set': data}
            )
            return result.matched_count > 0

    def delete_position(self, position_id: str) -> bool:
        if self._is_cloud():
            where_js = json.dumps({"_id": position_id})
            deleted = self.cloud_client.delete_where(
                collection=self.collection_name,
                where_js=where_js
            )
            return deleted > 0
        else:
            if not self.collection:
                return False
            result = self.collection.delete_one({'_id': ObjectId(position_id)})
            return result.deleted_count > 0
