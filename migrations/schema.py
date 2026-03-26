# -*- coding: utf-8 -*-
"""
数据库Schema版本管理
适用于微信云开发的数据库版本控制

功能：
1. 跟踪Schema版本
2. 执行增量迁移
3. 索引管理
4. 数据完整性检查
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# 当前Schema版本
SCHEMA_VERSION = "1.1.0"

# Schema版本历史
SCHEMA_HISTORY = [
    {"version": "1.0.0", "date": "2025-12-01", "description": "初始版本"},
    {"version": "1.0.1", "date": "2026-01-15", "description": "添加询价状态历史"},
    {"version": "1.1.0", "date": "2026-03-22", "description": "添加Redis限流器和类型定义"},
]


# ============================================
# 集合定义
# ============================================

COLLECTION_SCHEMAS = {
    # 用户集合
    "users": {
        "indexes": [
            {"keys": [("openid", 1)], "unique": True},
            {"keys": [("phone", 1)], "sparse": True},
            {"keys": [("createdAt", -1)]},
        ],
        "required_fields": ["openid", "role"],
        "description": "用户信息集合"
    },
    
    # 管理员用户集合
    "admin_users": {
        "indexes": [
            {"keys": [("username", 1)], "unique": True},
        ],
        "required_fields": ["username", "password_hash", "role"],
        "description": "管理员用户集合"
    },
    
    # 询价集合
    "inquiries": {
        "indexes": [
            {"keys": [("userId", 1)]},
            {"keys": [("openid", 1)]},
            {"keys": [("status", 1)]},
            {"keys": [("createdAt", -1)]},
            {"keys": [("userId", 1), ("status", 1)]},
            {"keys": [("contactPhone", 1)]},
            {"keys": [("isGuest", 1)]},
        ],
        "required_fields": ["productCode", "contactPhone", "status"],
        "description": "询价记录集合"
    },
    
    # 行情集合
    "quotes": {
        "indexes": [
            {"keys": [("code", 1)], "unique": True},
            {"keys": [("type", 1)]},
            {"keys": [("updateTime", -1)]},
        ],
        "required_fields": ["code", "name", "price"],
        "description": "行情数据集合"
    },
    
    # 期权集合
    "options": {
        "indexes": [
            {"keys": [("underlying", 1)]},
            {"keys": [("expiry", 1)]},
            {"keys": [("type", 1)]},
        ],
        "required_fields": ["underlying", "type", "strike", "expiry"],
        "description": "期权数据集合"
    },
    
    # 持仓集合
    "positions": {
        "indexes": [
            {"keys": [("customerId", 1)]},
            {"keys": [("productCode", 1)]},
            {"keys": [("status", 1)]},
            {"keys": [("customerId", 1), ("status", 1)]},
        ],
        "required_fields": ["customerId", "productCode", "quantity", "price"],
        "description": "持仓记录集合"
    },
    
    # 订单集合
    "orders": {
        "indexes": [
            {"keys": [("customerId", 1)]},
            {"keys": [("status", 1)]},
            {"keys": [("createdAt", -1)]},
        ],
        "required_fields": ["customerId", "productCode", "orderType", "quantity"],
        "description": "订单记录集合"
    },
    
    # 分组集合
    "groups": {
        "indexes": [
            {"keys": [("code", 1)], "unique": True},
            {"keys": [("sort", 1)]},
        ],
        "required_fields": ["name", "code"],
        "description": "分组配置集合"
    },
    
    # 系统设置集合
    "settings": {
        "indexes": [
            {"keys": [("_id", 1)]},
        ],
        "required_fields": [],
        "description": "系统配置集合"
    },
    
    # 消息集合
    "messages": {
        "indexes": [
            {"keys": [("userId", 1)]},
            {"keys": [("isRead", 1)]},
            {"keys": [("createdAt", -1)]},
        ],
        "required_fields": ["userId", "title", "content"],
        "description": "消息通知集合"
    },
    
    # Schema版本记录集合
    "_schema_versions": {
        "indexes": [
            {"keys": [("version", 1)], "unique": True},
        ],
        "required_fields": ["version", "appliedAt"],
        "description": "Schema版本记录"
    }
}


# ============================================
# 迁移脚本
# ============================================

MIGRATIONS = {
    "1.0.0": {
        "description": "初始Schema创建",
        "collections": ["users", "admin_users", "inquiries", "quotes", "positions", "orders", "groups", "settings"],
        "up": None,  # 初始化时执行创建集合
        "down": None
    },
    
    "1.0.1": {
        "description": "添加询价状态历史字段",
        "updates": [
            {
                "collection": "inquiries",
                "update": {"$set": {"history": []}},
                "filter": {"history": {"$exists": False}}
            }
        ],
        "up": "db.inquiries.updateMany({history: {$exists: false}}, {$set: {history: []}})",
        "down": "db.inquiries.updateMany({}, {$unset: {history: ''}})"
    },
    
    "1.1.0": {
        "description": "添加消息集合和类型定义",
        "collections": ["messages"],
        "up": None,
        "down": None
    }
}


class SchemaManager:
    """Schema管理器"""
    
    def __init__(self, db=None, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self._is_cloud = cloud_client is not None
    
    def get_current_version(self) -> Optional[str]:
        """获取当前Schema版本"""
        try:
            if self._is_cloud:
                query = 'db.collection("_schema_versions").orderBy("appliedAt", "desc").limit(1).get()'
                results = self.cloud_client.query(query)
                if results:
                    return results[0].get("version")
            else:
                if self.db is not None:
                    record = self.db["_schema_versions"].find_one(
                        sort=[("appliedAt", -1)]
                    )
                    if record:
                        return record.get("version")
        except Exception as e:
            logger.warning(f"获取Schema版本失败: {e}")
        return None
    
    def record_version(self, version: str, description: str = "") -> bool:
        """记录Schema版本"""
        record = {
            "version": version,
            "description": description,
            "appliedAt": datetime.utcnow().isoformat() if self._is_cloud else datetime.utcnow()
        }
        
        try:
            if self._is_cloud:
                self.cloud_client.add(collection="_schema_versions", data=record)
            else:
                if self.db is not None:
                    self.db["_schema_versions"].insert_one(record)
            logger.info(f"Schema版本已记录: {version}")
            return True
        except Exception as e:
            logger.error(f"记录Schema版本失败: {e}")
            return False
    
    def create_indexes(self, collection_name: str) -> bool:
        """创建集合索引"""
        schema = COLLECTION_SCHEMAS.get(collection_name)
        if not schema:
            logger.warning(f"未找到集合Schema: {collection_name}")
            return False
        
        indexes = schema.get("indexes", [])
        
        try:
            if self._is_cloud:
                # 云数据库索引需要通过控制台创建
                logger.info(f"云数据库索引需在控制台创建: {collection_name}, 索引数: {len(indexes)}")
            else:
                if self.db is not None:
                    collection = self.db[collection_name]
                    for idx_spec in indexes:
                        keys = idx_spec.get("keys", [])
                        options = {}
                        if idx_spec.get("unique"):
                            options["unique"] = True
                        if idx_spec.get("sparse"):
                            options["sparse"] = True
                        
                        collection.create_index(keys, **options)
                    logger.info(f"索引创建完成: {collection_name}")
            return True
        except Exception as e:
            logger.error(f"创建索引失败: {e}")
            return False
    
    def validate_collection(self, collection_name: str) -> Tuple[bool, List[str]]:
        """验证集合结构"""
        errors = []
        schema = COLLECTION_SCHEMAS.get(collection_name)
        
        if not schema:
            return False, [f"未找到集合Schema: {collection_name}"]
        
        required_fields = schema.get("required_fields", [])
        
        try:
            if self._is_cloud:
                query = f'db.collection("{collection_name}").limit(10).get()'
                samples = self.cloud_client.query(query)
            else:
                if self.db is None:
                    return False, ["数据库未连接"]
                samples = list(self.db[collection_name].find().limit(10))
            
            # 检查必填字段
            for doc in samples:
                for field in required_fields:
                    if field not in doc:
                        errors.append(f"文档缺少必填字段: {field}")
            
            return len(errors) == 0, errors
        except Exception as e:
            return False, [str(e)]
    
    def run_migration(self, target_version: str = None) -> bool:
        """执行迁移"""
        current = self.get_current_version()
        target = target_version or SCHEMA_VERSION
        
        logger.info(f"当前版本: {current}, 目标版本: {target}")
        
        # 确定需要执行的迁移
        versions = list(MIGRATIONS.keys())
        
        if current:
            start_idx = versions.index(current) + 1 if current in versions else 0
        else:
            start_idx = 0
        
        target_idx = versions.index(target) + 1 if target in versions else len(versions)
        
        to_run = versions[start_idx:target_idx]
        
        if not to_run:
            logger.info("无需执行迁移")
            return True
        
        # 执行迁移
        for version in to_run:
            migration = MIGRATIONS.get(version, {})
            logger.info(f"执行迁移: {version} - {migration.get('description', '')}")
            
            # 创建新集合
            for coll in migration.get("collections", []):
                self.create_indexes(coll)
            
            # 执行数据更新
            updates = migration.get("updates", [])
            for update_spec in updates:
                try:
                    if self._is_cloud:
                        # 云数据库更新逻辑
                        logger.info(f"云数据库更新: {update_spec['collection']}")
                    else:
                        if self.db is not None:
                            self.db[update_spec["collection"]].update_many(
                                update_spec.get("filter", {}),
                                update_spec["update"]
                            )
                except Exception as e:
                    logger.error(f"迁移更新失败: {e}")
            
            # 记录版本
            self.record_version(version, migration.get("description", ""))
        
        logger.info(f"迁移完成: {target}")
        return True
    
    def get_schema_info(self) -> Dict[str, Any]:
        """获取Schema信息"""
        return {
            "current_version": SCHEMA_VERSION,
            "applied_version": self.get_current_version(),
            "collections": list(COLLECTION_SCHEMAS.keys()),
            "history": SCHEMA_HISTORY
        }


def init_schema(db=None, cloud_client=None) -> bool:
    """初始化Schema"""
    manager = SchemaManager(db, cloud_client)
    
    current = manager.get_current_version()
    if current:
        logger.info(f"Schema已初始化，当前版本: {current}")
        return True
    
    # 首次初始化
    logger.info("开始初始化Schema...")
    
    for collection_name, schema in COLLECTION_SCHEMAS.items():
        logger.info(f"创建集合: {collection_name}")
        manager.create_indexes(collection_name)
    
    manager.record_version(SCHEMA_VERSION, "初始化Schema")
    
    logger.info("Schema初始化完成")
    return True


# 导出
__all__ = [
    'SCHEMA_VERSION',
    'SCHEMA_HISTORY',
    'COLLECTION_SCHEMAS',
    'MIGRATIONS',
    'SchemaManager',
    'init_schema'
]