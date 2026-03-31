from datetime import datetime
import json
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)

class CustomerModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'customers'
        if db is not None:
            self.collection = db[self.collection_name]
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_customer(self, data):
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        customer = {
            'name': data['name'],
            'phone': data['phone'],
            'email': data.get('email', ''),
            'status': data.get('status', 'active'),
            'groupName': data.get('groupName', ''),
            'user_id': data.get('user_id'), # Link to users collection
            'openid': data.get('openid'),   # Link to WeChat
            'totalOrders': 0,
            'createdAt': now,
            'updatedAt': now,
        }
        
        if self._is_cloud():
            # Check existing phone
            existing = self.get_customer_by_phone(data['phone'])
            if existing:
                # If existing but no user_id, we might want to update it later, 
                # but create_customer usually implies new. 
                # For unified auth, we might upsert.
                # For now, keep raising error to force check before create.
                raise ValueError('该手机号已存在')

            try:
                ids = self.cloud_client.add(collection=self.collection_name, data=customer)
                return ids[0] if ids else None
            except CloudDbRequestError as e:
                if "集合不存在" in str(e):
                    raise CloudDbRequestError(f"云数据库中找不到 '{self.collection_name}' 集合，请在云开发控制台中手动创建该集合后再试。")
                raise e
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            
            existing = self.collection.find_one({'phone': data['phone']})
            if existing:
                raise ValueError('该手机号已存在')

            result = self.collection.insert_one(customer)
            return str(result.inserted_id)

    def upsert_customer_from_user(self, user_data: Dict[str, Any]) -> str:
        """
        Ensure a customer record exists for the given user data.
        Matches by phone or openid.
        """
        phone = user_data.get('phone')
        openid = user_data.get('openid')
        user_id = user_data.get('_id') or user_data.get('openid') # Use openid as fallback ID
        
        existing = None
        if phone:
            existing = self.get_customer_by_phone(phone)
        
        # If not found by phone, try openid (if customer model supports it)
        if not existing and openid:
             # We need to implement get_customer_by_openid if not exists
             pass 

        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        
        customer_data = {
            'name': user_data.get('nickname') or f"用户{str(phone)[-4:] if phone else ''}",
            'phone': phone,
            'email': user_data.get('email', ''),
            'user_id': user_id,
            'openid': openid,
            'avatar': user_data.get('avatar', ''),
            'updatedAt': now
        }

        if existing:
            # Update existing
            self.update_customer(existing['_id'], customer_data)
            return existing['_id']
        else:
            # Create new
            # Ensure name is set
            if not customer_data['name']:
                customer_data['name'] = "新用户"
            
            # create_customer expects specific fields
            # We bypass create_customer to avoid phone check race condition if we handled it above
            # But create_customer does logic we need.
            # Let's adapt data for create_customer
            return self.create_customer({
                'name': customer_data['name'],
                'phone': phone,
                'email': customer_data['email'],
                'user_id': user_id,
                'openid': openid,
                'status': 'active'
            })

    def get_customers(self, page=1, page_size=10, status=None, keyword=None):
        if self._is_cloud():
            if not self.cloud_client:
                return [], 0

            try:
                where_parts = []
                if status:
                    where_parts.append(f'status: "{status}"')
                
                if keyword:
                    # Cloud DB regex search for name
                    safe_kw = keyword.replace('"', '\\"').replace("'", "\\'")
                    where_parts.append(f'name: db.RegExp({{regexp: "{safe_kw}", options: "i"}})')

                where_clause = ""
                if where_parts:
                    where_clause = f'.where({{{", ".join(where_parts)}}})'
                
                # Count
                count_query = f'db.collection("{self.collection_name}"){where_clause}.count()'
                total = self.cloud_client.count(count_query)

                # Query
                skip = (page - 1) * page_size
                query = f'db.collection("{self.collection_name}"){where_clause}.orderBy("createdAt", "desc").skip({skip}).limit({page_size}).get()'
                
                customers = self.cloud_client.query(query)
                for c in customers:
                    if "_id" in c:
                        c["_id"] = str(c["_id"])
                return customers, total
            except CloudDbRequestError as e:
                logger.warning(f"云数据库查询失败，返回空数据: {e}")
                return [], 0
        else:
            if not self.collection:
                return [], 0
            
            query = {}
            if status:
                query['status'] = status
            
            if keyword:
                regex = {'$regex': keyword, '$options': 'i'}
                query['$or'] = [
                    {'name': regex},
                    {'phone': regex}
                ]
            
            total = self.collection.count_documents(query)
            customers = list(self.collection.find(query)
                           .sort('createdAt', -1)
                           .skip((page - 1) * page_size)
                           .limit(page_size))
            
            for c in customers:
                c['_id'] = str(c['_id'])
                for key in ['createdAt', 'updatedAt']:
                    if key in c and hasattr(c[key], 'isoformat'):
                        c[key] = c[key].isoformat()
            
            return customers, total

    def get_customer_by_id(self, customer_id):
        if self._is_cloud():
            safe_id = json.dumps(str(customer_id))
            query = f'db.collection("{self.collection_name}").doc({safe_id}).get()'
            customers = self.cloud_client.query(query)
            if customers and isinstance(customers, list):
                c = customers[0]
                if "_id" in c:
                    c["_id"] = str(c["_id"])
                return c
            return None
        else:
            if not self.collection:
                return None
            try:
                c = self.collection.find_one({'_id': ObjectId(customer_id)})
                if c:
                    c['_id'] = str(c['_id'])
                    for key in ['createdAt', 'updatedAt']:
                        if key in c and hasattr(c[key], 'isoformat'):
                            c[key] = c[key].isoformat()
                return c
            except:
                return None

    def get_customer_by_phone(self, phone):
        if self._is_cloud():
            query = f'db.collection("{self.collection_name}").where({{phone: "{phone}"}}).limit(1).get()'
            customers = self.cloud_client.query(query)
            if customers:
                c = customers[0]
                if "_id" in c:
                    c["_id"] = str(c["_id"])
                return c
            return None
        else:
            if not self.collection:
                return None
            return self.collection.find_one({'phone': phone})

    def update_customer(self, customer_id, data):
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        update_data = {
            'updatedAt': now
        }
        allowed_fields = ['name', 'phone', 'email', 'status', 'groupName']
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]

        if self._is_cloud():
            where_js = json.dumps({"_id": customer_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data=update_data
            )
            return updated > 0
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.update_one(
                {'_id': ObjectId(customer_id)},
                {'$set': update_data}
            )
            return result.matched_count > 0

    def delete_customer(self, customer_id):
        if self._is_cloud():
            where_js = json.dumps({"_id": customer_id})
            deleted = self.cloud_client.delete_where(
                collection=self.collection_name,
                where_js=where_js
            )
            return deleted > 0
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.delete_one({'_id': ObjectId(customer_id)})
            return result.deleted_count > 0

    def get_customer_groups(self):
        if self._is_cloud():
            # Cloud DB doesn't support distinct well in one go via HTTP API sometimes, 
            # but we can try aggregate or just fetch all and distinct in memory (bad for large data)
            # Or use a separate collection for groups.
            # Given the constraint, we might just query all groupNames if not too many users.
            # Better: maintain a list of groups?
            # For now, let's try to query distinct via command if possible, or just limit 1000 and extract.
            # To be safe and compliant with requirements, we might need to change how groups are stored.
            # But adhering to "minimal changes", let's try to fetch fields.
            query = f'db.collection("{self.collection_name}").field({{groupName: true}}).limit(1000).get()'
            try:
                res = self.cloud_client.query(query)
                groups = list(set(item.get('groupName') for item in res if item.get('groupName')))
                return groups
            except:
                return []
        else:
            if not self.collection:
                return []
            return self.collection.distinct('groupName', {'groupName': {'$ne': ''}})

    def rename_group(self, old_name, new_name):
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        if self._is_cloud():
            where_js = json.dumps({"groupName": old_name})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data={"groupName": new_name, "updatedAt": now}
            )
            return updated
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.update_many(
                {'groupName': old_name},
                {'$set': {'groupName': new_name, 'updatedAt': now}}
            )
            return result.modified_count
