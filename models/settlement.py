from datetime import datetime
import json
from bson import ObjectId

class SettlementModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'settlements'
        if db is not None:
            self.collection = db[self.collection_name]
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def create_settlement(self, data):
        """
        data: {
            "date": str,
            "position_id": str,
            "user_id": str,
            "type": str, # expiry, exercise
            "strike_price": float,
            "settlement_price": float,
            "pnl": float,
            "status": str
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

    def get_settlements(self, limit=20, skip=0, user_id=None):
        if self._is_cloud():
            query = f'db.collection("{self.collection_name}").orderBy("created_at", "desc").skip({skip}).limit({limit})'
            if user_id:
                query = query.replace('.orderBy', f'.where({{user_id: "{user_id}"}}).orderBy')
            return self.cloud_client.query(query + '.get()')
        else:
            if not self.collection:
                return []
            filter_q = {"user_id": user_id} if user_id else {}
            return list(self.collection.find(filter_q)
                        .sort("created_at", -1)
                        .skip(skip)
                        .limit(limit))
