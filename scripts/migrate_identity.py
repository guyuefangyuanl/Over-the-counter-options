import os
import sys
import logging
from typing import Dict, Any

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from services.auth_service import AuthService
from models.user import UserModel
from models.customer import CustomerModel

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_app():
    app = Flask(__name__)
    # Load basic config from environment
    from config import Config
    app.config.from_object(Config)
    
    # Initialize DB (Cloud or Local)
    # We reuse the logic from app.py essentially, or simpler just connect.
    # For migration script, we rely on the service classes which check app context or cloud client
    
    # Initialize Cloud DB if needed
    if os.environ.get('WX_CLOUD_ENV'):
        try:
            from services.cloud_db import WxCloudClient
            app.cloud_db = WxCloudClient()
            logger.info("Connected to WeChat Cloud DB")
        except Exception as e:
            logger.error(f"Failed to connect to Cloud DB: {e}")
            sys.exit(1)
    else:
        # Local MongoDB logic if needed (omitted for brevity as we focus on cloud usually)
        from flask_pymongo import PyMongo
        mongo = PyMongo(app)
        app.db = mongo.db
        logger.info("Connected to Local MongoDB")

    return app

def migrate_users_to_customers():
    """
    Iterate over all users and ensure a corresponding customer record exists.
    """
    app = create_app()
    with app.app_context():
        auth_service = AuthService()
        user_model = auth_service._get_model()
        customer_model = auth_service._get_customer_model()
        
        # 1. Fetch all users
        # UserModel needs a method to list all users, which might not exist efficiently.
        # For Cloud DB, we can query in batches.
        
        logger.info("Starting migration: Users -> Customers")
        
        page = 1
        page_size = 100
        total_synced = 0
        total_failed = 0
        
        while True:
            # We need a way to scan users. 
            # Assuming we can use cloud_client directly or add list_users to UserModel.
            # Let's add a raw query here for simplicity.
            if user_model._is_cloud():
                skip = (page - 1) * page_size
                query = f'db.collection("users").skip({skip}).limit({page_size}).get()'
                users = user_model.cloud_client.query(query)
            else:
                users = list(user_model.user_collection.find().skip((page - 1) * page_size).limit(page_size))
            
            if not users:
                break
                
            for user in users:
                try:
                    # Fix ID format
                    if "_id" in user and not isinstance(user["_id"], str):
                        user["_id"] = str(user["_id"])
                        
                    customer_id = customer_model.upsert_customer_from_user(user)
                    logger.info(f"Synced User {user.get('openid', 'unknown')} -> Customer {customer_id}")
                    total_synced += 1
                except Exception as e:
                    logger.error(f"Failed to sync user {user.get('_id')}: {e}")
                    total_failed += 1
            
            if len(users) < page_size:
                break
            page += 1
            
        logger.info(f"Migration completed. Synced: {total_synced}, Failed: {total_failed}")

if __name__ == "__main__":
    migrate_users_to_customers()
