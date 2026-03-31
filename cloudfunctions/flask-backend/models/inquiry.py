from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any, Tuple
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class InquiryModel:
    # 用户关联字段定义（用于查询和索引）
    USER_LINK_FIELDS = ['userId', 'openid', 'phone', 'contactPhone']

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
        """初始化索引，优化用户关联查询"""
        try:
            # 基础索引
            self.collection.create_index("createdAt")
            self.collection.create_index("status")

            # 用户关联索引（支持按用户查询询价）
            self.collection.create_index("userId")
            self.collection.create_index("openid")

            # 联系方式索引（支持按手机号查询）
            self.collection.create_index("phone")
            self.collection.create_index("contactPhone")

            # 复合索引：用户+状态（常用查询组合）
            self.collection.create_index([("userId", 1), ("status", 1)])
            self.collection.create_index([("openid", 1), ("status", 1)])

            # 游客标记索引
            self.collection.create_index("isGuest")

            logger.info("询价集合索引初始化完成")
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
            
            try:
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
            except CloudDbRequestError as e:
                logger.warning(f"云数据库查询失败，返回空数据: {e}")
                return [], 0
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

    def update_inquiry_status_with_history(
        self,
        inquiry_id: str,
        new_status: str,
        operator: str = "system",
        remark: str = ""
    ) -> bool:
        """
        更新询价状态并记录历史

        Args:
            inquiry_id: 询价ID
            new_status: 新状态
            operator: 操作者（userId 或 'system'）
            remark: 备注

        Returns:
            是否更新成功
        """
        # 先获取当前询价记录
        inquiry = self.get_inquiry_by_id(inquiry_id)
        if not inquiry:
            logger.warning(f"询价记录不存在: {inquiry_id}")
            return False

        current_status = inquiry.get("status", "pending")

        # 构建历史记录条目
        history_entry = {
            "fromStatus": current_status,
            "toStatus": new_status,
            "operator": operator,
            "remark": remark,
            "timestamp": datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        }

        # 更新数据
        update_data = {
            "status": new_status,
            "updatedAt": datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        }

        if remark:
            update_data["remark"] = remark

        if self._is_cloud():
            # 云数据库：需要先获取现有历史，追加后再更新
            existing_history = inquiry.get("history", [])
            existing_history.append(history_entry)
            update_data["history"] = existing_history

            where_js = json.dumps({"_id": inquiry_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data=update_data
            )
            return updated > 0
        else:
            # MongoDB：使用 $push 操作符追加历史记录
            if not self.collection:
                return False

            result = self.collection.update_one(
                {"_id": ObjectId(inquiry_id)},
                {
                    "$set": update_data,
                    "$push": {"history": history_entry}
                }
            )
            return result.modified_count > 0

    def get_inquiries_by_user(
        self,
        user_id: str,
        limit: int = 20,
        skip: int = 0,
        status: str = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        获取指定用户的询价列表

        支持通过 userId 或 openid 查询，确保用户关联准确
        """
        return self.get_inquiries(limit=limit, skip=skip, status=status, user_id=user_id)

    def get_inquiry_statistics_by_user(self, user_id: str) -> Dict[str, int]:
        """
        获取用户的询价统计

        Args:
            user_id: 用户ID

        Returns:
            各状态的询价数量统计
        """
        from models.inquiry_status import INQUIRY_STATUS_VALUES

        stats = {s: 0 for s in INQUIRY_STATUS_VALUES}

        if self._is_cloud():
            for status in INQUIRY_STATUS_VALUES:
                try:
                    where_clause = f'{{openid: "{user_id}", status: "{status}"}}'
                    count_query = f'db.collection("{self.collection_name}").where({where_clause}).count()'
                    stats[status] = self.cloud_client.count(count_query)
                except Exception as e:
                    logger.warning(f"获取用户 {user_id} 状态 {status} 统计失败: {e}")
        else:
            if not self.collection:
                return stats

            try:
                pipeline = [
                    {"$match": {"$or": [{"userId": user_id}, {"openid": user_id}]}},
                    {"$group": {"_id": "$status", "count": {"$sum": 1}}}
                ]
                for row in self.collection.aggregate(pipeline):
                    s = row.get("_id")
                    if s in stats:
                        stats[s] = row.get("count", 0)
            except Exception as e:
                logger.warning(f"获取用户询价统计失败: {e}")

        return stats

    def link_inquiry_to_user(
        self,
        inquiry_id: str,
        user_id: str,
        user_info: Dict[str, Any] = None
    ) -> bool:
        """
        将询价记录关联到用户账户

        用于匿名询价后用户登录，将历史询价关联到账户
        """
        update_data = {
            "userId": user_id,
            "openid": user_id,
            "isGuest": False
        }

        if user_info:
            if user_info.get("nickname"):
                update_data["userNickname"] = user_info["nickname"]
            if user_info.get("phone"):
                inquiry = self.get_inquiry_by_id(inquiry_id)
                if inquiry and not inquiry.get("contactPhone"):
                    update_data["contactPhone"] = user_info["phone"]
                    update_data["phone"] = user_info["phone"]

        return self.update_inquiry(inquiry_id, update_data)

    def batch_link_inquiries_to_user(
        self,
        phone: str,
        user_id: str,
        user_info: Dict[str, Any] = None
    ) -> int:
        """
        批量将手机号关联的匿名询价关联到用户账户

        用于用户注册/登录后，将历史匿名询价关联到账户

        Returns:
            更新的记录数量
        """
        if self._is_cloud():
            try:
                where_clause = f'{{contactPhone: "{phone}", userId: ""}}'
                query = f'db.collection("{self.collection_name}").where({where_clause}).get()'
                items = self.cloud_client.query(query)

                updated_count = 0
                for item in items:
                    if self.link_inquiry_to_user(item["_id"], user_id, user_info):
                        updated_count += 1

                return updated_count
            except Exception as e:
                logger.error(f"批量关联询价失败: {e}")
                return 0
        else:
            if not self.collection:
                return 0

            try:
                update_data = {
                    "userId": user_id,
                    "openid": user_id,
                    "isGuest": False,
                    "updatedAt": datetime.utcnow()
                }

                if user_info and user_info.get("nickname"):
                    update_data["userNickname"] = user_info["nickname"]

                result = self.collection.update_many(
                    {"contactPhone": phone, "userId": {"$in": ["", None]}},
                    {"$set": update_data}
                )

                logger.info(f"批量关联 {result.modified_count} 条询价记录到用户 {user_id}")
                return result.modified_count
            except Exception as e:
                logger.error(f"批量关联询价失败: {e}")
                return 0
