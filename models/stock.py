# -*- coding: utf-8 -*-
"""
股票数据模型模块
提供股票数据的存储、查询 and 管理功能
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
import json
import os
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError
import logging

# 配置日志
logger = logging.getLogger(__name__)


class StockModel:
    """
    股票数据模型类
    提供股票数据的增删改查操作
    """
    
    def __init__(self, db: Optional[Database]):
        """
        初始化股票数据模型
        
        Args:
            db (Database): MongoDB数据库实例
        """
        self.db = db
        self.collection: Optional[Collection] = None
        if self.db is not None:
            self.collection = self.db.stocks
            self.collection.create_index("stock_code", unique=True)
            self.collection.create_index("created_at")
            self.collection.create_index("updated_at")

        repo_root = Path(__file__).resolve().parents[1]
        self._file_db_path = Path(os.getenv("FILE_DB_PATH", str(repo_root / "mock_db.json")))

    def _load_file_db(self) -> Dict[str, Any]:
        if not self._file_db_path.exists():
            return {"stocks": []}
        try:
            with self._file_db_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return {"stocks": []}
            if "stocks" not in data or not isinstance(data.get("stocks"), list):
                data["stocks"] = []
            return data
        except Exception as e:
            logger.error(f"读取本地行情存储失败: {e}")
            return {"stocks": []}

    def _atomic_write_json(self, path: Path, data: Dict[str, Any]) -> bool:
        tmp_path = path.with_suffix(path.suffix + ".tmp")
        try:
            tmp_path.parent.mkdir(parents=True, exist_ok=True)
            with tmp_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(str(tmp_path), str(path))
            return True
        except Exception as e:
            logger.error(f"写入本地行情存储失败: {e}")
            try:
                if tmp_path.exists():
                    tmp_path.unlink()
            except Exception:
                pass
            return False

    def _ensure_datetime_strings(self, item: Dict[str, Any]) -> Dict[str, Any]:
        normalized = dict(item)
        for k in ("created_at", "updated_at"):
            v = normalized.get(k)
            if isinstance(v, datetime):
                normalized[k] = v.isoformat()
        return normalized

    def _parse_dt_for_sort(self, v: Any) -> Tuple[int, float]:
        if v is None:
            return (0, 0.0)
        if isinstance(v, datetime):
            return (1, v.timestamp())
        if isinstance(v, (int, float)):
            return (1, float(v))
        if isinstance(v, str):
            try:
                return (1, datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp())
            except Exception:
                return (0, 0.0)
        return (0, 0.0)
    
    def save_stock_data(self, stock_code: str, data: Dict[str, Any]) -> bool:
        """
        保存或更新股票数据到MongoDB
        
        Args:
            stock_code (str): 股票代码
            data (Dict[str, Any]): 股票数据
            
        Returns:
            bool: 保存成功返回True，失败返回False
        """
        try:
            # 添加时间戳
            current_time = datetime.utcnow()
            data["stock_code"] = stock_code
            data["updated_at"] = current_time

            if self.collection is not None:
                self.collection.update_one(
                    {"stock_code": stock_code},
                    {"$set": data, "$setOnInsert": {"created_at": current_time}},
                    upsert=True,
                )
                logger.info(f"股票数据保存成功: {stock_code}")
                return True

            file_db = self._load_file_db()
            stocks = file_db.get("stocks", [])
            existing = None
            for s in stocks:
                if isinstance(s, dict) and s.get("stock_code") == stock_code:
                    existing = s
                    break

            if existing is None:
                new_item = dict(data)
                new_item["created_at"] = current_time
                stocks.append(self._ensure_datetime_strings(new_item))
            else:
                if "created_at" not in existing:
                    existing["created_at"] = current_time.isoformat()
                for k, v in data.items():
                    existing[k] = v
                existing["updated_at"] = current_time.isoformat()
                existing.update(self._ensure_datetime_strings(existing))

            file_db["stocks"] = stocks
            ok = self._atomic_write_json(self._file_db_path, file_db)
            if ok:
                logger.info(f"股票数据保存成功(本地存储): {stock_code}")
            return ok
            
        except PyMongoError as e:
            logger.error(f"保存股票数据时数据库错误: {stock_code}, 错误: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"保存股票数据时发生未知错误: {stock_code}, 错误: {str(e)}")
            return False

    def bulk_save_stock_data(self, stock_list: List[Dict[str, Any]]) -> int:
        """
        批量保存或更新股票数据
        
        Args:
            stock_list (List[Dict[str, Any]]): 包含多个股票数据的列表，每个数据必须包含 stock_code
            
        Returns:
            int: 成功处理的数量
        """
        if not stock_list:
            return 0
            
        try:
            current_time = datetime.utcnow()

            if self.collection is not None:
                from pymongo import UpdateOne

                operations = []
                for item in stock_list:
                    code = item.get("stock_code")
                    if not code:
                        continue

                    item["updated_at"] = current_time
                    update_data = {"$set": item, "$setOnInsert": {"created_at": current_time}}
                    operations.append(UpdateOne({"stock_code": code}, update_data, upsert=True))

                if not operations:
                    return 0
                result = self.collection.bulk_write(operations)
                return result.upserted_count + result.modified_count

            file_db = self._load_file_db()
            stocks = file_db.get("stocks", [])
            stock_index: Dict[str, Dict[str, Any]] = {}
            for s in stocks:
                if isinstance(s, dict) and s.get("stock_code"):
                    stock_index[str(s.get("stock_code"))] = s

            processed_codes = set()
            for item in stock_list:
                code = item.get("stock_code")
                if not code:
                    continue
                code = str(code)
                processed_codes.add(code)

                existing = stock_index.get(code)
                if existing is None:
                    new_item = dict(item)
                    new_item["created_at"] = current_time
                    new_item["updated_at"] = current_time
                    normalized = self._ensure_datetime_strings(new_item)
                    stocks.append(normalized)
                    stock_index[code] = normalized
                else:
                    if "created_at" not in existing:
                        existing["created_at"] = current_time.isoformat()
                    for k, v in item.items():
                        existing[k] = v
                    existing["updated_at"] = current_time.isoformat()
                    existing.update(self._ensure_datetime_strings(existing))

            file_db["stocks"] = stocks
            ok = self._atomic_write_json(self._file_db_path, file_db)
            return len(processed_codes) if ok else 0
        except Exception as e:
            logger.error(f"批量保存股票数据失败: {e}")
            return 0

    def get_stock_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        根据股票代码获取数据
        
        Args:
            stock_code (str): 股票代码
            
        Returns:
            Optional[Dict[str, Any]]: 股票数据，如果不存在返回None
        """
        try:
            if self.collection is not None:
                return self.collection.find_one({"stock_code": stock_code}, {"_id": 0})
            file_db = self._load_file_db()
            for s in file_db.get("stocks", []):
                if isinstance(s, dict) and str(s.get("stock_code")) == str(stock_code):
                    return dict(s)
            return None
        except Exception as e:
            logger.error(f"查询股票数据失败: {stock_code}, {e}")
            return None

    def get_all_stocks(self, skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
        """
        分页获取所有股票数据
        
        Args:
            skip (int): 跳过的记录数，默认为0
            limit (int): 返回的记录数，默认为100
            
        Returns:
            List[Dict[str, Any]]: 股票数据列表
        """
        try:
            if self.collection is not None:
                cursor = (
                    self.collection.find({}, {"_id": 0})
                    .sort("updated_at", -1)
                    .skip(skip)
                    .limit(limit)
                )
                return list(cursor)

            file_db = self._load_file_db()
            items = [dict(s) for s in file_db.get("stocks", []) if isinstance(s, dict)]
            items.sort(key=lambda x: self._parse_dt_for_sort(x.get("updated_at")), reverse=True)
            if skip < 0:
                skip = 0
            if limit < 0:
                limit = 0
            return items[skip : skip + limit]
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

    def count_stocks(self) -> int:
        """
        获取股票总数
        """
        try:
            if self.collection is not None:
                return self.collection.count_documents({})
            file_db = self._load_file_db()
            return len([s for s in file_db.get("stocks", []) if isinstance(s, dict) and s.get("stock_code")])
        except Exception as e:
            logger.error(f"获取股票总数失败: {e}")
            return 0
