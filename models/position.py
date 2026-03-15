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

    def get_position_by_id(self, position_id: str) -> Optional[Dict[str, Any]]:
        """根据ID获取单个持仓"""
        if self._is_cloud():
            if not self.cloud_client:
                return None
            try:
                query = f'db.collection("{self.collection_name}").where({{_id: "{position_id}"}}).limit(1).get()'
                items = self.cloud_client.query(query)
                if items:
                    item = items[0]
                    if "_id" in item:
                        item["_id"] = str(item["_id"])
                    return item
                return None
            except Exception as e:
                logger.warning(f"[get_position_by_id] 云数据库查询失败: {e}")
                return None
        else:
            if not self.collection:
                return None
            try:
                item = self.collection.find_one({'_id': ObjectId(position_id)})
                if item:
                    item["_id"] = str(item["_id"])
                    for k in ["createdAt", "updatedAt"]:
                        if k in item and hasattr(item[k], "isoformat"):
                            item[k] = item[k].isoformat()
                return item
            except Exception as e:
                logger.warning(f"[get_position_by_id] MongoDB查询失败: {e}")
                return None

    def get_statistics(self, customer_id: str = None) -> Dict[str, Any]:
        """获取持仓统计数据，包括存续和已完结的统计"""
        stats = {
            "totalMarketValue": 0,      # 存续名义本金
            "totalProfitLoss": 0,       # 存续净收益
            "completedProfit": 0,       # 完结净收益
            "optionFee": 0,             # 权利金总额
            "commission": 0,            # 手续费总额
            "totalCount": 0
        }

        if self._is_cloud():
            if not self.cloud_client:
                return stats

            # 查询存续持仓
            active_where = '.where({status: "active"})'
            if customer_id:
                active_where = f'.where({{status: "active", customerId: "{customer_id}"}})'

            active_query = f'db.collection("{self.collection_name}"){active_where}.limit(1000).get()'
            try:
                active_items = self.cloud_client.query(active_query)
            except Exception as e:
                logger.warning(f"[get_statistics] 云数据库查询存续持仓失败: {e}")
                active_items = []

            # 查询已完结持仓
            closed_where = '.where({status: "closed"})'
            if customer_id:
                closed_where = f'.where({{status: "closed", customerId: "{customer_id}"}})'

            closed_query = f'db.collection("{self.collection_name}"){closed_where}.limit(1000).get()'
            try:
                closed_items = self.cloud_client.query(closed_query)
            except Exception as e:
                logger.warning(f"[get_statistics] 云数据库查询已完结持仓失败: {e}")
                closed_items = []

            # 统计存续持仓
            stats["totalCount"] = len(active_items)
            for item in active_items:
                stats["totalMarketValue"] += float(item.get("marketValue", 0))
                stats["totalProfitLoss"] += float(item.get("profitLoss", 0))
                stats["optionFee"] += float(item.get("optionFee", 0))
                stats["commission"] += float(item.get("commission", 0))

            # 统计已完结持仓盈亏
            for item in closed_items:
                stats["completedProfit"] += float(item.get("profitLoss", 0))
                stats["optionFee"] += float(item.get("optionFee", 0))
                stats["commission"] += float(item.get("commission", 0))

        else:
            if not self.collection:
                return stats

            # 存续持仓统计
            active_match = {"status": "active"}
            if customer_id:
                active_match["customerId"] = customer_id

            active_pipeline = [
                {"$match": active_match},
                {"$group": {
                    "_id": None,
                    "totalMarketValue": {"$sum": "$marketValue"},
                    "totalProfitLoss": {"$sum": "$profitLoss"},
                    "optionFee": {"$sum": {"$ifNull": ["$optionFee", 0]}},
                    "commission": {"$sum": {"$ifNull": ["$commission", 0]}},
                    "count": {"$sum": 1}
                }}
            ]
            active_result = list(self.collection.aggregate(active_pipeline))
            if active_result:
                stats["totalMarketValue"] = active_result[0]["totalMarketValue"]
                stats["totalProfitLoss"] = active_result[0]["totalProfitLoss"]
                stats["optionFee"] = active_result[0]["optionFee"]
                stats["commission"] = active_result[0]["commission"]
                stats["totalCount"] = active_result[0]["count"]

            # 已完结持仓统计
            closed_match = {"status": "closed"}
            if customer_id:
                closed_match["customerId"] = customer_id

            closed_pipeline = [
                {"$match": closed_match},
                {"$group": {
                    "_id": None,
                    "completedProfit": {"$sum": "$profitLoss"},
                    "optionFee": {"$sum": {"$ifNull": ["$optionFee", 0]}},
                    "commission": {"$sum": {"$ifNull": ["$commission", 0]}}
                }}
            ]
            closed_result = list(self.collection.aggregate(closed_pipeline))
            if closed_result:
                stats["completedProfit"] = closed_result[0]["completedProfit"]
                stats["optionFee"] += closed_result[0]["optionFee"]
                stats["commission"] += closed_result[0]["commission"]

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
