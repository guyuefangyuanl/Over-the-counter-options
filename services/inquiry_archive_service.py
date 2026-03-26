"""
询价数据归档服务

提供数据归档功能：
- 自动归档已完成的询价
- 支持按时间范围归档
- 归档数据存储到单独集合
- 提供归档数据查询接口
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional
import json

logger = logging.getLogger(__name__)


class InquiryArchiveService:
    """
    询价归档服务

    归档策略：
    - 已完成(completed)或已拒绝(rejected)状态
    - 超过指定天数的记录
    - 保留必要字段用于统计
    """

    # 归档配置
    ARCHIVE_CONFIG = {
        'completed': {'retention_days': 90, 'archive_after_days': 30},
        'rejected': {'retention_days': 60, 'archive_after_days': 14},
        'expired': {'retention_days': 30, 'archive_after_days': 7}
    }

    # 归档时保留的字段
    ARCHIVE_FIELDS = [
        '_id', 'productCode', 'productName', 'optionType', 'structure',
        'term', 'notionalAmount', 'strikePrice', 'status', 'source',
        'createdAt', 'completedAt', 'userId', 'openid', 'isGuest',
        'contactPhone'  # 脱敏后保留
    ]

    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.inquiry_collection = 'inquiries'
        self.archive_collection = 'inquiries_archive'
        self.stats_collection = 'inquiries_stats'

    def _is_cloud(self):
        return self.cloud_client is not None

    def archive_inquiries(
        self,
        status: str = None,
        days_old: int = None,
        batch_size: int = 100,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        归档询价数据

        Args:
            status: 要归档的状态（completed/rejected/expired）
            days_old: 归档多少天前的数据
            batch_size: 每批处理数量
            dry_run: 仅统计不实际归档

        Returns:
            归档结果统计
        """
        # 确定归档参数
        if status and status in self.ARCHIVE_CONFIG:
            config = self.ARCHIVE_CONFIG[status]
            retention_days = days_old or config['archive_after_days']
        else:
            retention_days = days_old or 30
            status = None  # 归档所有符合条件的记录

        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        cutoff_str = cutoff_date.isoformat()

        logger.info(f"开始归档询价: status={status}, days_old={retention_days}, cutoff={cutoff_str}")

        result = {
            'status': status or 'all',
            'cutoff_date': cutoff_str,
            'archived_count': 0,
            'error_count': 0,
            'dry_run': dry_run
        }

        if self._is_cloud():
            return self._archive_cloud(status, cutoff_str, batch_size, dry_run, result)
        else:
            return self._archive_mongo(status, cutoff_str, batch_size, dry_run, result)

    def _archive_mongo(
        self,
        status: str,
        cutoff_str: str,
        batch_size: int,
        dry_run: bool,
        result: Dict
    ) -> Dict[str, Any]:
        """MongoDB 归档实现"""
        if not self.db:
            result['error'] = '数据库未连接'
            return result

        # 构建查询条件
        query = {
            'createdAt': {'$lt': cutoff_str}
        }
        if status:
            query['status'] = status
        else:
            # 默认只归档终态记录
            query['status'] = {'$in': ['completed', 'rejected', 'expired']}

        archive_collection = self.db[self.archive_collection]
        inquiry_collection = self.db[self.inquiry_collection]

        # 查询符合条件的记录
        cursor = inquiry_collection.find(query).limit(batch_size * 10)  # 限制处理数量

        archived = 0
        errors = 0

        for doc in cursor:
            if dry_run:
                archived += 1
                continue

            try:
                # 准备归档数据
                archive_doc = self._prepare_archive_doc(doc)

                # 写入归档集合
                archive_collection.insert_one(archive_doc)

                # 删除原记录
                inquiry_collection.delete_one({'_id': doc['_id']})

                archived += 1
            except Exception as e:
                logger.error(f"归档记录失败: {doc.get('_id')}, error: {e}")
                errors += 1

        result['archived_count'] = archived
        result['error_count'] = errors

        logger.info(f"归档完成: archived={archived}, errors={errors}")
        return result

    def _archive_cloud(
        self,
        status: str,
        cutoff_str: str,
        batch_size: int,
        dry_run: bool,
        result: Dict
    ) -> Dict[str, Any]:
        """云数据库归档实现"""
        try:
            # 构建查询
            where_parts = [f'createdAt: "{cutoff_str}"']
            if status:
                where_parts.append(f'status: "{status}"')
            else:
                where_parts.append('status: {$in: ["completed", "rejected", "expired"]}')

            where_clause = '{' + ', '.join(where_parts).replace('$in', 'in') + '}'

            # 查询
            query = f'db.collection("{self.inquiry_collection}").where({where_clause}).limit({batch_size * 10}).get()'
            items = self.cloud_client.query(query)

            archived = 0
            errors = 0

            for doc in items:
                if dry_run:
                    archived += 1
                    continue

                try:
                    # 准备归档数据
                    archive_doc = self._prepare_archive_doc(doc)
                    archive_doc['_id'] = doc.get('_id')

                    # 写入归档集合
                    self.cloud_client.add(
                        collection=self.archive_collection,
                        data=archive_doc
                    )

                    # 删除原记录
                    self.cloud_client.delete(
                        collection=self.inquiry_collection,
                        query=f'{{"_id": "{doc.get("_id")}"}}'
                    )

                    archived += 1
                except Exception as e:
                    logger.error(f"归档记录失败: {doc.get('_id')}, error: {e}")
                    errors += 1

            result['archived_count'] = archived
            result['error_count'] = errors

            return result

        except Exception as e:
            logger.error(f"云数据库归档失败: {e}")
            result['error'] = str(e)
            return result

    def _prepare_archive_doc(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """准备归档文档"""
        archive_doc = {
            'archivedAt': datetime.utcnow().isoformat(),
            'originalCreatedAt': doc.get('createdAt'),
        }

        # 只保留指定字段
        for field in self.ARCHIVE_FIELDS:
            if field in doc:
                archive_doc[field] = doc[field]

        # 手机号脱敏
        if 'contactPhone' in archive_doc:
            phone = str(archive_doc['contactPhone'])
            if len(phone) == 11:
                archive_doc['contactPhone'] = phone[:3] + '****' + phone[-4:]

        # 添加归档标记
        archive_doc['isArchived'] = True

        return archive_doc

    def get_archive_statistics(self) -> Dict[str, Any]:
        """获取归档统计信息"""
        stats = {
            'active_count': 0,
            'archived_count': 0,
            'by_status': {}
        }

        if self._is_cloud():
            try:
                # 活跃记录统计
                stats['active_count'] = self.cloud_client.count(
                    f'db.collection("{self.inquiry_collection}").count()'
                )
                # 归档记录统计
                stats['archived_count'] = self.cloud_client.count(
                    f'db.collection("{self.archive_collection}").count()'
                )
            except Exception as e:
                logger.error(f"获取归档统计失败: {e}")
        else:
            if self.db:
                stats['active_count'] = self.db[self.inquiry_collection].count_documents({})
                stats['archived_count'] = self.db[self.archive_collection].count_documents({})

        return stats

    def restore_inquiry(self, inquiry_id: str) -> bool:
        """
        从归档恢复询价记录

        Args:
            inquiry_id: 询价ID

        Returns:
            是否恢复成功
        """
        if self._is_cloud():
            try:
                # 从归档集合获取
                query = f'db.collection("{self.archive_collection}").doc("{inquiry_id}").get()'
                items = self.cloud_client.query(query)

                if not items:
                    logger.warning(f"归档记录不存在: {inquiry_id}")
                    return False

                doc = items[0]

                # 移除归档标记
                doc.pop('isArchived', None)
                doc.pop('archivedAt', None)

                # 写回主集合
                self.cloud_client.add(
                    collection=self.inquiry_collection,
                    data=doc
                )

                # 从归档集合删除
                self.cloud_client.delete(
                    collection=self.archive_collection,
                    query=f'{{"_id": "{inquiry_id}"}}'
                )

                logger.info(f"恢复归档记录成功: {inquiry_id}")
                return True

            except Exception as e:
                logger.error(f"恢复归档记录失败: {inquiry_id}, error: {e}")
                return False
        else:
            if not self.db:
                return False

            try:
                doc = self.db[self.archive_collection].find_one({'_id': inquiry_id})
                if not doc:
                    return False

                doc.pop('isArchived', None)
                doc.pop('archivedAt', None)

                self.db[self.inquiry_collection].insert_one(doc)
                self.db[self.archive_collection].delete_one({'_id': inquiry_id})

                logger.info(f"恢复归档记录成功: {inquiry_id}")
                return True

            except Exception as e:
                logger.error(f"恢复归档记录失败: {inquiry_id}, error: {e}")
                return False

    def query_archived(
        self,
        page: int = 1,
        page_size: int = 20,
        status: str = None,
        start_date: str = None,
        end_date: str = None
    ) -> Tuple[List[Dict], int]:
        """
        查询归档数据

        Args:
            page: 页码
            page_size: 每页数量
            status: 状态过滤
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            (记录列表, 总数)
        """
        if self._is_cloud():
            try:
                where_parts = []
                if status:
                    where_parts.append(f'status: "{status}"')
                if start_date:
                    where_parts.append(f'originalCreatedAt: {{"$gte": "{start_date}"}}')
                if end_date:
                    where_parts.append(f'originalCreatedAt: {{"$lte": "{end_date}"}}')

                where_clause = '{' + ', '.join(where_parts).replace('$gte', 'gte').replace('$lte', 'lte') + '}' if where_parts else '{}'

                # 计数
                count_query = f'db.collection("{self.archive_collection}").where({where_clause}).count()'
                total = self.cloud_client.count(count_query)

                # 查询
                skip = (page - 1) * page_size
                query = f'db.collection("{self.archive_collection}").where({where_clause}).orderBy("originalCreatedAt", "desc").skip({skip}).limit({page_size}).get()'
                items = self.cloud_client.query(query)

                return items, total

            except Exception as e:
                logger.error(f"查询归档数据失败: {e}")
                return [], 0
        else:
            if not self.db:
                return [], 0

            query = {}
            if status:
                query['status'] = status
            if start_date or end_date:
                query['originalCreatedAt'] = {}
                if start_date:
                    query['originalCreatedAt']['$gte'] = start_date
                if end_date:
                    query['originalCreatedAt']['$lte'] = end_date

            total = self.db[self.archive_collection].count_documents(query)
            cursor = self.db[self.archive_collection].find(query).sort('originalCreatedAt', -1)
            items = list(cursor.skip((page - 1) * page_size).limit(page_size))

            return items, total


# 定时任务函数（可被外部调度器调用）
def run_archive_task(db, cloud_client=None):
    """
    执行归档定时任务

    建议配置：每天凌晨执行
    """
    service = InquiryArchiveService(db, cloud_client)

    # 归档已完成超过30天的记录
    result1 = service.archive_inquiries(status='completed', days_old=30)

    # 归档已拒绝超过14天的记录
    result2 = service.archive_inquiries(status='rejected', days_old=14)

    logger.info(f"归档任务完成: completed={result1['archived_count']}, rejected={result2['archived_count']}")

    return {
        'completed': result1,
        'rejected': result2
    }