from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class GroupModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'groups'
        if db is not None:
            self.collection = db[self.collection_name]
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_group(self, data):
        """
        创建新分组
        :param data: {name, creator_id, ...}
        :return: group_id
        """
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        group = {
            "name": data.get("name"),
            "creator_id": data.get("creator_id"),
            "members": [],  # List of {stock_code, market, added_at}
            "created_at": now,
            "updated_at": now
        }
        
        if self._is_cloud():
            try:
                ids = self.cloud_client.add(collection=self.collection_name, data=group)
                return ids[0] if ids else None
            except CloudDbRequestError as e:
                if "集合不存在" in str(e):
                    raise CloudDbRequestError(f"云数据库中找不到 '{self.collection_name}' 集合，请在云开发控制台中手动创建该集合后再试。")
                raise e
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.insert_one(group)
            return str(result.inserted_id)

    def get_groups(self, creator_id=None):
        """
        获取分组列表
        """
        if self._is_cloud():
            where_clause = ""
            if creator_id:
                where_clause = f'.where({{creator_id: "{creator_id}"}})'
            
            query = f'db.collection("{self.collection_name}"){where_clause}.orderBy("created_at", "desc").get()'
            groups = self.cloud_client.query(query)
            for g in groups:
                if "_id" in g:
                    g["id"] = str(g["_id"])
                    # del g["_id"] # Keep _id for now as some logic might expect it
            return groups
        else:
            if not self.collection:
                return []
            query = {}
            if creator_id:
                query["creator_id"] = creator_id
                
            groups = list(self.collection.find(query).sort("created_at", -1))
            for g in groups:
                g["id"] = str(g["_id"])
                del g["_id"]
            return groups

    def get_group_by_id(self, group_id):
        if self._is_cloud():
            query = f'db.collection("{self.collection_name}").doc("{group_id}").get()'
            groups = self.cloud_client.query(query)
            if groups:
                g = groups[0]
                g["id"] = str(g["_id"])
                return g
            return None
        else:
            if not self.collection:
                return None
            try:
                group = self.collection.find_one({"_id": ObjectId(group_id)})
                if group:
                    group["id"] = str(group["_id"])
                    del group["_id"]
                return group
            except Exception:
                return None

    def update_group(self, group_id, data):
        """
        更新分组信息
        """
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        update_fields = {"updated_at": now}
        if "name" in data:
            update_fields["name"] = data["name"]
            
        if self._is_cloud():
            try:
                where_js = json.dumps({"_id": group_id})
                updated = self.cloud_client.update_where(
                    collection=self.collection_name,
                    where_js=where_js,
                    data=update_fields
                )
                return updated > 0
            except CloudDbRequestError as e:
                if "集合不存在" in str(e):
                    raise CloudDbRequestError(f"云数据库中找不到 '{self.collection_name}' 集合，请在云开发控制台中手动创建该集合后再试。")
                raise e
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.update_one(
                {"_id": ObjectId(group_id)},
                {"$set": update_fields}
            )
            return result.modified_count > 0

    def delete_group(self, group_id):
        if self._is_cloud():
            where_js = json.dumps({"_id": group_id})
            deleted = self.cloud_client.delete_where(
                collection=self.collection_name,
                where_js=where_js
            )
            return deleted > 0
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.delete_one({"_id": ObjectId(group_id)})
            return result.deleted_count > 0

    def add_member(self, group_id, member_data):
        """
        添加成员（股票）
        :param member_data: {stock_code, market}
        """
        stock_code = member_data.get("stock_code")
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        
        if self._is_cloud():
            # In cloud DB, we need to handle the array update differently
            # We first get the current members, check if exists, then update
            group = self.get_group_by_id(group_id)
            if not group:
                return False
            
            members = group.get("members", [])
            if any(m.get("stock_code") == stock_code for m in members):
                return False
                
            new_member = {
                "stock_code": stock_code,
                "market": member_data.get("market", ""),
                "name": member_data.get("name", ""),
                "added_at": now
            }
            
            # Use db.command.push if supported by client, otherwise fetch-modify-save
            # Our client doesn't support complex commands like push directly in update_where
            # but we can try to use a JS-like query if update_where allows it.
            # However, simpler is fetch-modify-save for now.
            members.append(new_member)
            where_js = json.dumps({"_id": group_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data={"members": members, "updated_at": now}
            )
            return updated > 0
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            # Check existence
            exists = self.collection.find_one({
                "_id": ObjectId(group_id),
                "members.stock_code": stock_code
            })
            
            if exists:
                return False # Already exists
                
            member = {
                "stock_code": stock_code,
                "market": member_data.get("market", ""),
                "name": member_data.get("name", ""),
                "added_at": now
            }
            
            result = self.collection.update_one(
                {"_id": ObjectId(group_id)},
                {"$push": {"members": member}, "$set": {"updated_at": now}}
            )
            return result.modified_count > 0

    def remove_member(self, group_id, stock_code):
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        if self._is_cloud():
            group = self.get_group_by_id(group_id)
            if not group:
                return False
            
            members = group.get("members", [])
            new_members = [m for m in members if m.get("stock_code") != stock_code]
            
            if len(new_members) == len(members):
                return False
                
            where_js = json.dumps({"_id": group_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data={"members": new_members, "updated_at": now}
            )
            return updated > 0
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.update_one(
                {"_id": ObjectId(group_id)},
                {"$pull": {"members": {"stock_code": stock_code}}, "$set": {"updated_at": now}}
            )
            return result.modified_count > 0
