"""
数据库索引管理脚本

用于创建和管理MongoDB索引，优化查询性能。

使用方式:
    python scripts/init_indexes.py [--check] [--create]

选项:
    --check   仅检查现有索引
    --create  创建缺失的索引
"""

import sys
import os
import logging
from datetime import datetime

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# 索引配置
INDEX_CONFIG = {
    "inquiries": {
        # 单字段索引
        "indexes": [
            {"key": "createdAt", "options": {"name": "idx_createdAt", "expireAfterSeconds": None}},
            {"key": "updatedAt", "options": {"name": "idx_updatedAt"}},
            {"key": "status", "options": {"name": "idx_status"}},
            {"key": "userId", "options": {"name": "idx_userId", "sparse": True}},
            {"key": "openid", "options": {"name": "idx_openid", "sparse": True}},
            {"key": "phone", "options": {"name": "idx_phone", "sparse": True}},
            {"key": "contactPhone", "options": {"name": "idx_contactPhone", "sparse": True}},
            {"key": "isGuest", "options": {"name": "idx_isGuest", "sparse": True}},
            {"key": "underlyingCode", "options": {"name": "idx_underlyingCode", "sparse": True}},
            {"key": "productCode", "options": {"name": "idx_productCode", "sparse": True}},
            {"key": "dealerId", "options": {"name": "idx_dealerId", "sparse": True}},
            {"key": "archived", "options": {"name": "idx_archived", "sparse": True}},
        ],
        # 复合索引
        "compound_indexes": [
            {
                "keys": [("userId", 1), ("status", 1)],
                "options": {"name": "idx_userId_status"}
            },
            {
                "keys": [("openid", 1), ("status", 1)],
                "options": {"name": "idx_openid_status"}
            },
            {
                "keys": [("status", 1), ("createdAt", -1)],
                "options": {"name": "idx_status_createdAt"}
            },
            {
                "keys": [("phone", 1), ("createdAt", -1)],
                "options": {"name": "idx_phone_createdAt"}
            },
            {
                "keys": [("underlyingCode", 1), ("status", 1)],
                "options": {"name": "idx_underlyingCode_status"}
            },
            {
                "keys": [("archived", 1), ("createdAt", -1)],
                "options": {"name": "idx_archived_createdAt"}
            },
        ],
        # TTL索引（可选，用于自动清理过期数据）
        "ttl_indexes": [
            {
                "key": "expiresAt",
                "options": {"name": "idx_ttl_expiresAt", "expireAfterSeconds": 0, "sparse": True}
            }
        ]
    },
    "users": {
        "indexes": [
            {"key": "openid", "options": {"name": "idx_openid", "unique": True}},
            {"key": "phone", "options": {"name": "idx_phone", "sparse": True}},
            {"key": "role", "options": {"name": "idx_role"}},
            {"key": "createdAt", "options": {"name": "idx_createdAt"}},
        ],
        "compound_indexes": [
            {
                "keys": [("phone", 1), ("role", 1)],
                "options": {"name": "idx_phone_role", "sparse": True}
            }
        ]
    },
    "quotes": {
        "indexes": [
            {"key": "inquiryId", "options": {"name": "idx_inquiryId"}},
            {"key": "dealerId", "options": {"name": "idx_dealerId"}},
            {"key": "status", "options": {"name": "idx_status"}},
            {"key": "createdAt", "options": {"name": "idx_createdAt"}},
            {"key": "validUntil", "options": {"name": "idx_validUntil", "sparse": True}},
        ],
        "compound_indexes": [
            {
                "keys": [("inquiryId", 1), ("status", 1)],
                "options": {"name": "idx_inquiryId_status"}
            },
            {
                "keys": [("dealerId", 1), ("status", 1)],
                "options": {"name": "idx_dealerId_status"}
            }
        ]
    },
    "notifications": {
        "indexes": [
            {"key": "openid", "options": {"name": "idx_openid"}},
            {"key": "type", "options": {"name": "idx_type"}},
            {"key": "is_read", "options": {"name": "idx_is_read"}},
            {"key": "createdAt", "options": {"name": "idx_createdAt"}},
        ],
        "compound_indexes": [
            {
                "keys": [("openid", 1), ("is_read", 1)],
                "options": {"name": "idx_openid_isRead"}
            },
            {
                "keys": [("openid", 1), ("createdAt", -1)],
                "options": {"name": "idx_openid_createdAt"}
            }
        ]
    },
    "inquiry_archive": {
        "indexes": [
            {"key": "originalId", "options": {"name": "idx_originalId"}},
            {"key": "originalCreatedAt", "options": {"name": "idx_originalCreatedAt"}},
            {"key": "archivedAt", "options": {"name": "idx_archivedAt"}},
        ],
        "compound_indexes": [
            {
                "keys": [("originalCreatedAt", -1)],
                "options": {"name": "idx_originalCreatedAt_desc"}
            }
        ]
    }
}


def get_db():
    """获取数据库连接"""
    try:
        from pymongo import MongoClient
        from dotenv import load_dotenv

        load_dotenv()

        mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
        db_name = os.getenv('MONGO_DB_NAME', 'options_trading')

        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = client[db_name]

        # 测试连接
        db.list_collection_names()
        return db
    except Exception as e:
        logger.error(f"数据库连接失败: {e}")
        return None


def check_indexes(db):
    """检查现有索引"""
    logger.info("=" * 60)
    logger.info("检查现有索引")
    logger.info("=" * 60)

    for collection_name, config in INDEX_CONFIG.items():
        try:
            collection = db[collection_name]
            existing_indexes = list(collection.list_indexes())

            logger.info(f"\n集合: {collection_name}")
            logger.info(f"现有索引数量: {len(existing_indexes)}")

            for idx in existing_indexes:
                logger.info(f"  - {idx['name']}: {idx.get('key', {})}")

        except Exception as e:
            logger.warning(f"检查集合 {collection_name} 失败: {e}")


def create_indexes(db, dry_run=False):
    """创建索引"""
    logger.info("=" * 60)
    logger.info(f"{'模拟' if dry_run else '实际'}创建索引")
    logger.info("=" * 60)

    results = {
        "created": 0,
        "skipped": 0,
        "failed": 0
    }

    for collection_name, config in INDEX_CONFIG.items():
        try:
            collection = db[collection_name]
            existing_indexes = {idx['name'] for idx in collection.list_indexes()}

            logger.info(f"\n处理集合: {collection_name}")

            # 单字段索引
            for idx_config in config.get("indexes", []):
                idx_name = idx_config["options"]["name"]

                if idx_name in existing_indexes:
                    logger.info(f"  ✓ 索引已存在: {idx_name}")
                    results["skipped"] += 1
                    continue

                if dry_run:
                    logger.info(f"  [模拟] 将创建索引: {idx_name} on {idx_config['key']}")
                    results["created"] += 1
                else:
                    try:
                        collection.create_index(
                            [(idx_config["key"], 1)],
                            **idx_config["options"]
                        )
                        logger.info(f"  ✓ 创建索引: {idx_name}")
                        results["created"] += 1
                    except Exception as e:
                        logger.error(f"  ✗ 创建索引失败 {idx_name}: {e}")
                        results["failed"] += 1

            # 复合索引
            for idx_config in config.get("compound_indexes", []):
                idx_name = idx_config["options"]["name"]

                if idx_name in existing_indexes:
                    logger.info(f"  ✓ 复合索引已存在: {idx_name}")
                    results["skipped"] += 1
                    continue

                if dry_run:
                    logger.info(f"  [模拟] 将创建复合索引: {idx_name} on {idx_config['keys']}")
                    results["created"] += 1
                else:
                    try:
                        collection.create_index(
                            idx_config["keys"],
                            **idx_config["options"]
                        )
                        logger.info(f"  ✓ 创建复合索引: {idx_name}")
                        results["created"] += 1
                    except Exception as e:
                        logger.error(f"  ✗ 创建复合索引失败 {idx_name}: {e}")
                        results["failed"] += 1

            # TTL索引
            for idx_config in config.get("ttl_indexes", []):
                idx_name = idx_config["options"]["name"]

                if idx_name in existing_indexes:
                    logger.info(f"  ✓ TTL索引已存在: {idx_name}")
                    results["skipped"] += 1
                    continue

                if dry_run:
                    logger.info(f"  [模拟] 将创建TTL索引: {idx_name}")
                    results["created"] += 1
                else:
                    try:
                        collection.create_index(
                            [(idx_config["key"], 1)],
                            **idx_config["options"]
                        )
                        logger.info(f"  ✓ 创建TTL索引: {idx_name}")
                        results["created"] += 1
                    except Exception as e:
                        logger.error(f"  ✗ 创建TTL索引失败 {idx_name}: {e}")
                        results["failed"] += 1

        except Exception as e:
            logger.error(f"处理集合 {collection_name} 失败: {e}")

    logger.info("\n" + "=" * 60)
    logger.info("索引创建结果:")
    logger.info(f"  创建: {results['created']}")
    logger.info(f"  跳过: {results['skipped']}")
    logger.info(f"  失败: {results['failed']}")
    logger.info("=" * 60)

    return results


def get_index_stats(db):
    """获取索引统计信息"""
    logger.info("\n" + "=" * 60)
    logger.info("索引统计")
    logger.info("=" * 60)

    for collection_name in INDEX_CONFIG.keys():
        try:
            collection = db[collection_name]

            # 获取集合统计
            stats = db.command("collstats", collection_name)

            logger.info(f"\n{collection_name}:")
            logger.info(f"  文档数: {stats.get('count', 0):,}")
            logger.info(f"  数据大小: {stats.get('size', 0) / 1024 / 1024:.2f} MB")
            logger.info(f"  索引大小: {stats.get('totalIndexSize', 0) / 1024 / 1024:.2f} MB")
            logger.info(f"  索引数量: {stats.get('nindexes', 0)}")

        except Exception as e:
            logger.warning(f"获取 {collection_name} 统计失败: {e}")


def main():
    """主函数"""
    import argparse

    parser = argparse.ArgumentParser(description="数据库索引管理")
    parser.add_argument("--check", action="store_true", help="仅检查现有索引")
    parser.add_argument("--create", action="store_true", help="创建缺失的索引")
    parser.add_argument("--dry-run", action="store_true", help="模拟创建（不实际执行）")
    parser.add_argument("--stats", action="store_true", help="显示索引统计")

    args = parser.parse_args()

    db = get_db()
    if not db:
        logger.error("无法连接数据库，退出")
        sys.exit(1)

    if args.check or not any([args.create, args.stats]):
        check_indexes(db)

    if args.create:
        create_indexes(db, dry_run=args.dry_run)

    if args.stats:
        get_index_stats(db)


if __name__ == "__main__":
    main()