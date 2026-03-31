from datetime import datetime, timedelta
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class UserModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.admin_collection_name = 'admin_users'
        self.user_collection_name = 'users'
        
        if db is not None:
            self.admin_collection = db[self.admin_collection_name]
            self.user_collection = db[self.user_collection_name]
        else:
            self.admin_collection = None
            self.user_collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_session(self, user_id: str, device_info: str, ip: str, refresh_token_hash: str, expires_at: datetime):
        """Create a new user session"""
        data = {
            "user_id": user_id,
            "device_info": device_info,
            "ip": ip,
            "refresh_token_hash": refresh_token_hash,
            "created_at": datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow(),
            "expires_at": expires_at.isoformat() if self._is_cloud() else expires_at,
            "is_active": True
        }
        
        if self._is_cloud():
            self.cloud_client.add(collection="user_sessions", data=data)
        else:
            if self.db is not None:
                self.db["user_sessions"].insert_one(data)

    def find_session(self, refresh_token_hash: str):
        """Find active session by refresh token hash"""
        if self._is_cloud():
            query = f'db.collection("user_sessions").where({{refresh_token_hash: "{refresh_token_hash}", is_active: true}}).limit(1).get()'
            sessions = self.cloud_client.query(query)
            if sessions:
                s = sessions[0]
                if "_id" in s: s["_id"] = str(s["_id"])
                return s
            return None
        else:
            if self.db is not None:
                s = self.db["user_sessions"].find_one({"refresh_token_hash": refresh_token_hash, "is_active": True})
                if s: s["_id"] = str(s["_id"])
                return s
            return None

    def revoke_session(self, session_id: str):
        """Revoke a session"""
        if self._is_cloud():
            where_js = json.dumps({"_id": session_id})
            self.cloud_client.update_where(
                collection="user_sessions",
                where_js=where_js,
                data={"is_active": False}
            )
        else:
            if self.db is not None:
                self.db["user_sessions"].update_one(
                    {"_id": ObjectId(session_id)},
                    {"$set": {"is_active": False}}
                )

    def list_sessions(self, user_id: str):
        """List active sessions for user"""
        if self._is_cloud():
            query = f'db.collection("user_sessions").where({{user_id: "{user_id}", is_active: true}}).get()'
            sessions = self.cloud_client.query(query)
            for s in sessions:
                if "_id" in s: s["_id"] = str(s["_id"])
            return sessions
        else:
            if self.db is not None:
                sessions = list(self.db["user_sessions"].find({"user_id": user_id, "is_active": True}))
                for s in sessions: s["_id"] = str(s["_id"])
                return sessions
            return []

    # --- Admin User Methods ---

    def find_admin_user(self, username: str) -> Optional[Dict[str, Any]]:
        if self._is_cloud():
            query = f'db.collection("{self.admin_collection_name}").where({{username: "{username}"}}).limit(1).get()'
            users = self.cloud_client.query(query)
            if users:
                u = users[0]
                if "_id" in u:
                    u["_id"] = str(u["_id"])
                return u
            return None
        else:
            if not self.admin_collection:
                return None
            return self.admin_collection.find_one({"username": username})

    def upsert_admin_user(self, username: str, data: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        if self._is_cloud():
            # Check existing
            existing = self.find_admin_user(username)
            if existing:
                where_js = json.dumps({"username": username})
                data['updated_at'] = now
                self.cloud_client.update_where(
                    collection=self.admin_collection_name,
                    where_js=where_js,
                    data=data
                )
                existing.update(data)
                return existing
            else:
                data['username'] = username
                data['created_at'] = now
                data['updated_at'] = now
                self.cloud_client.add(collection=self.admin_collection_name, data=data)
                return data
        else:
            if not self.admin_collection:
                raise RuntimeError("数据库未连接")
            
            now_iso = now + "Z"
            data['updated_at'] = now_iso
            
            existing = self.admin_collection.find_one({"username": username})
            if existing:
                self.admin_collection.update_one({"username": username}, {"$set": data})
                existing.update(data)
                return existing
            
            data['username'] = username
            data['created_at'] = now_iso
            self.admin_collection.insert_one(data)
            return data

    def delete_admin_user(self, username: str) -> bool:
        if self._is_cloud():
            where_js = json.dumps({"username": username})
            deleted = self.cloud_client.delete_where(
                collection=self.admin_collection_name,
                where_js=where_js
            )
            return deleted > 0
        else:
            if not self.admin_collection:
                return False
            result = self.admin_collection.delete_one({"username": username})
            return result.deleted_count > 0
            
    def list_admin_users(self) -> List[Dict[str, Any]]:
        if self._is_cloud():
            # Limit 100 for now
            query = f'db.collection("{self.admin_collection_name}").limit(100).get()'
            users = self.cloud_client.query(query)
            for u in users:
                if "_id" in u:
                    u["_id"] = str(u["_id"])
                if "password_hash" in u:
                    del u["password_hash"]
            return users
        else:
            if not self.admin_collection:
                return []
            return list(self.admin_collection.find({}, {"_id": 0, "password_hash": 0}))

    # --- WeChat User Methods ---

    def find_user_by_openid(self, openid: str) -> Optional[Dict[str, Any]]:
        if self._is_cloud():
            query = f'db.collection("{self.user_collection_name}").where({{openid: "{openid}"}}).limit(1).get()'
            users = self.cloud_client.query(query)
            if users:
                u = users[0]
                if "_id" in u:
                    u["_id"] = str(u["_id"])
                return u
            return None
        else:
            if not self.user_collection:
                return None
            u = self.user_collection.find_one({"openid": openid})
            if u:
                u["_id"] = str(u["_id"])
            return u

    def find_user_by_phone(self, phone: str) -> Optional[Dict[str, Any]]:
        if not phone:
            return None
        if self._is_cloud():
            query = f'db.collection("{self.user_collection_name}").where({{phone: "{phone}"}}).limit(1).get()'
            users = self.cloud_client.query(query)
            if users:
                u = users[0]
                if "_id" in u:
                    u["_id"] = str(u["_id"])
                return u
            return None
        else:
            if not self.user_collection:
                return None
            u = self.user_collection.find_one({"phone": phone})
            if u:
                u["_id"] = str(u["_id"])
            return u

    def find_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        if not email:
            return None
        if self._is_cloud():
            query = f'db.collection("{self.user_collection_name}").where({{email: "{email}"}}).limit(1).get()'
            users = self.cloud_client.query(query)
            if users:
                u = users[0]
                if "_id" in u:
                    u["_id"] = str(u["_id"])
                return u
            return None
        else:
            if not self.user_collection:
                return None
            u = self.user_collection.find_one({"email": email})
            if u:
                u["_id"] = str(u["_id"])
            return u

    def create_user(self, data: Dict[str, Any]) -> str:
        now = datetime.utcnow()
        if self._is_cloud():
            data_copy = data.copy()
            if 'created_at' in data_copy and isinstance(data_copy['created_at'], datetime):
                data_copy['created_at'] = data_copy['created_at'].isoformat()
            if 'last_login' in data_copy and isinstance(data_copy['last_login'], datetime):
                data_copy['last_login'] = data_copy['last_login'].isoformat()
            
            ids = self.cloud_client.add(collection=self.user_collection_name, data=data_copy)
            return ids[0] if ids else None
        else:
            if not self.user_collection:
                raise RuntimeError("数据库未连接")
            result = self.user_collection.insert_one(data)
            return str(result.inserted_id)

    def update_user_login_time(self, openid: str):
        now = datetime.utcnow()
        if self._is_cloud():
            where_js = json.dumps({"openid": openid})
            self.cloud_client.update_where(
                collection=self.user_collection_name,
                where_js=where_js,
                data={"last_login": now.isoformat()}
            )
        else:
            if not self.user_collection:
                return
            self.user_collection.update_one(
                {'openid': openid},
                {'$set': {'last_login': now}}
            )

    def update_user_profile(self, openid: str, updates: Dict[str, Any]) -> bool:
        if self._is_cloud():
            where_js = json.dumps({"openid": openid})
            count = self.cloud_client.update_where(
                collection=self.user_collection_name,
                where_js=where_js,
                data=updates
            )
            return count > 0
        else:
            if not self.user_collection:
                return False
            result = self.user_collection.update_one(
                {'openid': openid},
                {'$set': updates}
            )
            return result.modified_count > 0

    # --- Login History Methods ---
    
    def create_login_history(self, user_id: str, login_type: str, ip_address: str,
                             device_info: Dict[str, Any] = None, location: Dict[str, Any] = None,
                             status: str = 'success', user_agent: str = None) -> str:
        """创建登录历史记录"""
        now = datetime.utcnow()
        
        history_data = {
            "user_id": user_id,
            "login_type": login_type,  # wechat, phone, email, admin, guest
            "login_time": now.isoformat() if self._is_cloud() else now,
            "ip_address": ip_address,
            "device_info": device_info or {},
            "location": location or {},
            "status": status,  # success, failed
            "user_agent": user_agent or "",
            "logout_time": None,
            "session_duration": None,
            "created_at": now.isoformat() if self._is_cloud() else now
        }
        
        if self._is_cloud():
            ids = self.cloud_client.add(collection="login_history", data=history_data)
            return ids[0] if ids else None
        else:
            if self.db is not None:
                result = self.db["login_history"].insert_one(history_data)
                return str(result.inserted_id)
            return None
    
    def get_login_history(self, user_id: str, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """获取用户登录历史记录"""
        if self._is_cloud():
            query = f'db.collection("login_history").where({{user_id: "{user_id}"}}).orderBy("login_time", "desc").limit({limit}).skip({offset}).get()'
            history = self.cloud_client.query(query)
            for h in history:
                if "_id" in h:
                    h["_id"] = str(h["_id"])
            return history
        else:
            if self.db is not None:
                history = list(self.db["login_history"].find(
                    {"user_id": user_id}
                ).sort("login_time", -1).skip(offset).limit(limit))
                for h in history:
                    h["_id"] = str(h["_id"])
                return history
            return []
    
    def get_login_history_count(self, user_id: str) -> int:
        """获取用户登录历史记录总数"""
        if self._is_cloud():
            query = f'db.collection("login_history").where({{user_id: "{user_id}"}}).count()'
            return self.cloud_client.query(query) or 0
        else:
            if self.db is not None:
                return self.db["login_history"].count_documents({"user_id": user_id})
            return 0
    
    def update_login_history_logout(self, history_id: str, logout_time: datetime, session_duration: int):
        """更新登录历史记录的登出时间和会话时长"""
        if self._is_cloud():
            where_js = json.dumps({"_id": history_id})
            self.cloud_client.update_where(
                collection="login_history",
                where_js=where_js,
                data={
                    "logout_time": logout_time.isoformat(),
                    "session_duration": session_duration
                }
            )
        else:
            if self.db is not None:
                self.db["login_history"].update_one(
                    {"_id": ObjectId(history_id)},
                    {"$set": {
                        "logout_time": logout_time,
                        "session_duration": session_duration
                    }}
                )
    
    def get_recent_login_stats(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        """获取用户最近登录统计"""
        now = datetime.utcnow()
        start_time = now - timedelta(days=days)
        
        if self._is_cloud():
            query = f'db.collection("login_history").where({{user_id: "{user_id}", login_time: _.gte("{start_time.isoformat()}")}}).get()'
            records = self.cloud_client.query(query)
        else:
            if self.db is not None:
                records = list(self.db["login_history"].find({
                    "user_id": user_id,
                    "login_time": {"$gte": start_time}
                }))
            else:
                records = []
        
        # 统计信息
        total_logins = len(records)
        successful_logins = sum(1 for r in records if r.get('status') == 'success')
        failed_logins = total_logins - successful_logins
        
        # 唯一IP数量
        unique_ips = len(set(r.get('ip_address', '') for r in records))
        
        # 唯一设备数量
        unique_devices = len(set(r.get('device_info', {}).get('name', '') for r in records))
        
        # 最近一次登录
        last_login = records[0] if records else None
        
        # 常用登录方式
        login_types = {}
        for r in records:
            login_type = r.get('login_type', 'unknown')
            login_types[login_type] = login_types.get(login_type, 0) + 1
        most_common_type = max(login_types.items(), key=lambda x: x[1])[0] if login_types else None
        
        return {
            "total_logins": total_logins,
            "successful_logins": successful_logins,
            "failed_logins": failed_logins,
            "unique_ips": unique_ips,
            "unique_devices": unique_devices,
            "last_login": last_login,
            "most_common_login_type": most_common_type,
            "period_days": days
        }

    def update_balance(self, openid: str, amount_change: float) -> float:
        """
        Atomically update balance using cloud database inc operator.
        
        For cloud database, uses _.inc() for atomic increment.
        For local MongoDB, uses $inc operator.
        
        Returns new balance.
        
        Note: Due to cloud DB HTTP API limitations, we cannot atomically 
        check if balance would go negative. We use a two-phase approach:
        1. First check current balance (fast fail for obvious cases)
        2. Use atomic increment
        3. If result is negative, rollback and raise error
        """
        if amount_change == 0:
            user = self.find_user_by_openid(openid)
            return user.get('balance', 0.0) if user else 0.0
            
        # 快速检查：如果是扣款，先检查余额是否充足（非原子，但可以快速失败）
        if amount_change < 0:
            user = self.find_user_by_openid(openid)
            if not user:
                raise ValueError("用户不存在")
            current_balance = user.get('balance', 0.0)
            # 预留一定的缓冲空间，防止竞态
            if current_balance + amount_change < -0.01:  # 允许极小的浮点误差
                raise ValueError("余额不足")
        
        # 使用原子递增操作
        if self._is_cloud() and self.cloud_client:
            try:
                # 微信云数据库使用 _.inc() 进行原子递增
                import json as json_module
                where_js = json_module.dumps({"openid": openid})
                
                # 使用原子递增
                result = self.cloud_client.query(
                    f'db.collection("users").where({where_js}).update({{data: {{balance: _.inc({amount_change})}}}})'
                )
                
                # 获取更新后的余额
                user = self.find_user_by_openid(openid)
                new_balance = user.get('balance', 0.0) if user else 0.0
                
                # 如果扣款后余额为负，回滚并报错
                if new_balance < -0.01:
                    # 回滚
                    self.cloud_client.query(
                        f'db.collection("users").where({where_js}).update({{data: {{balance: _.inc({-amount_change})}}}})'
                    )
                    raise ValueError("余额不足")
                    
                return new_balance
                
            except CloudDbRequestError as e:
                logger.error(f"更新余额失败: {e}")
                raise
        else:
            # 本地 MongoDB 使用 $inc 原子操作
            if self.user_collection is None:
                raise ValueError("数据库未初始化")
                
            result = self.user_collection.find_one_and_update(
                {'openid': openid},
                {'$inc': {'balance': amount_change}},
                return_document=True  # 返回更新后的文档
            )
            
            if not result:
                raise ValueError("用户不存在")
                
            new_balance = result.get('balance', 0.0)
            
            # 如果扣款后余额为负，回滚
            if new_balance < -0.01:
                self.user_collection.update_one(
                    {'openid': openid},
                    {'$inc': {'balance': -amount_change}}
                )
                raise ValueError("余额不足")
                
            return new_balance
