from datetime import datetime
import json
from bson import ObjectId
from services.cloud_db import CloudDbRequestError

class TransactionModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'transactions'
        if db is not None:
            self.collection = db[self.collection_name]
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_transaction(self, data):
        """
        data: {
            "user_id": str,
            "type": str (deposit, withdraw, buy, sell, fee),
            "amount": float,
            "balance_after": float,
            "remark": str
        }
        """
        now = datetime.utcnow().isoformat()
        data['created_at'] = now
        
        if self._is_cloud():
            ids = self.cloud_client.add(collection=self.collection_name, data=data)
            return ids[0] if ids else None
        else:
            if not self.collection:
                return None
            result = self.collection.insert_one(data)
            return str(result.inserted_id)

    def get_transactions(self, user_id, limit=20, skip=0):
        if self._is_cloud():
            query = f'db.collection("{self.collection_name}").where({{user_id: "{user_id}"}}).orderBy("created_at", "desc").skip({skip}).limit({limit}).get()'
            return self.cloud_client.query(query)
        else:
            if not self.collection:
                return []
            return list(self.collection.find({"user_id": user_id})
                        .sort("created_at", -1)
                        .skip(skip)
                        .limit(limit))

    def count_transactions(self, user_id):
        if self._is_cloud():
            query = f'db.collection("{self.collection_name}").where({{user_id: "{user_id}"}}).count()'
            return self.cloud_client.count(query)
        else:
            if not self.collection:
                return 0
            return self.collection.count_documents({"user_id": user_id})
