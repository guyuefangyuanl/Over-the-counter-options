from datetime import datetime
import json
import re
from bson import ObjectId
import logging
from typing import Optional, List, Dict, Any, Tuple
from services.cloud_db import CloudDbRequestError

logger = logging.getLogger(__name__)


class PositionValidationError(Exception):
    """持仓数据验证错误"""
    def __init__(self, message: str, errors: List[Dict[str, str]] = None):
        self.message = message
        self.errors = errors or []
        super().__init__(self.message)


class PositionValidator:
    """持仓数据验证器"""
    
    # 允许的状态值
    ALLOWED_STATUSES = {'active', 'closed', 'pending', 'settled'}
    
    # 允许的货币代码 (ISO 4217 子集)
    ALLOWED_CURRENCIES = {'CNY', 'USD', 'HKD', 'EUR', 'JPY', 'GBP'}
    
    # 允许的市场代码
    ALLOWED_MARKETS = {'CN', 'HK', 'US', 'JP', 'EU'}
    
    # 最大金额限制（防止溢出）
    MAX_AMOUNT = 10 ** 15  # 1千万亿
    MAX_PRECISION = 2  # 小数精度
    
    @staticmethod
    def validate_customer_id(value: Any) -> Tuple[bool, str]:
        """验证客户ID"""
        if value is None:
            return False, "客户ID不能为空"
        
        value_str = str(value).strip()
        if not value_str:
            return False, "客户ID不能为空"
        
        if len(value_str) > 64:
            return False, "客户ID长度不能超过64字符"
        
        # 允许字母、数字、下划线、横杠
        if not re.match(r'^[a-zA-Z0-9_-]+$', value_str):
            return False, "客户ID只能包含字母、数字、下划线和横杠"
        
        return True, ""
    
    @staticmethod
    def validate_product_code(value: Any) -> Tuple[bool, str]:
        """验证产品代码"""
        if value is None:
            return False, "产品代码不能为空"
        
        value_str = str(value).strip()
        if not value_str:
            return False, "产品代码不能为空"
        
        if len(value_str) > 32:
            return False, "产品代码长度不能超过32字符"
        
        return True, ""
    
    @staticmethod
    def validate_market_value(value: Any) -> Tuple[bool, str]:
        """验证名义本金"""
        if value is None:
            return False, "名义本金不能为空"
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "名义本金必须是数字"
        
        if num_value < 0:
            return False, "名义本金不能为负数"
        
        if num_value > PositionValidator.MAX_AMOUNT:
            return False, f"名义本金超出限额 ({PositionValidator.MAX_AMOUNT})"
        
        # 检查精度
        if not PositionValidator._check_precision(num_value):
            return False, f"名义本金小数位数不能超过{PositionValidator.MAX_PRECISION}位"
        
        return True, ""
    
    @staticmethod
    def validate_profit_loss(value: Any) -> Tuple[bool, str]:
        """验证盈亏金额"""
        if value is None:
            return True, ""  # 盈亏可以为空
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "盈亏金额必须是数字"
        
        if abs(num_value) > PositionValidator.MAX_AMOUNT:
            return False, f"盈亏金额超出限额 ({PositionValidator.MAX_AMOUNT})"
        
        return True, ""
    
    @staticmethod
    def validate_option_fee(value: Any) -> Tuple[bool, str]:
        """验证权利金"""
        if value is None:
            return True, ""  # 权利金可以为空
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "权利金必须是数字"
        
        if num_value < 0:
            return False, "权利金不能为负数"
        
        if num_value > PositionValidator.MAX_AMOUNT:
            return False, f"权利金超出限额 ({PositionValidator.MAX_AMOUNT})"
        
        return True, ""
    
    @staticmethod
    def validate_commission(value: Any) -> Tuple[bool, str]:
        """验证手续费"""
        if value is None:
            return True, ""  # 手续费可以为空
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "手续费必须是数字"
        
        if num_value < 0:
            return False, "手续费不能为负数"
        
        if num_value > PositionValidator.MAX_AMOUNT:
            return False, f"手续费超出限额 ({PositionValidator.MAX_AMOUNT})"
        
        return True, ""
    
    @staticmethod
    def validate_status(value: Any) -> Tuple[bool, str]:
        """验证状态"""
        if value is None:
            return True, ""  # 状态有默认值
        
        value_str = str(value).strip().lower()
        if value_str not in PositionValidator.ALLOWED_STATUSES:
            return False, f"状态必须是: {', '.join(PositionValidator.ALLOWED_STATUSES)}"
        
        return True, ""
    
    @staticmethod
    def validate_currency(value: Any) -> Tuple[bool, str]:
        """验证货币代码"""
        if value is None:
            return True, ""  # 货币有默认值
        
        value_str = str(value).strip().upper()
        if value_str not in PositionValidator.ALLOWED_CURRENCIES:
            return False, f"货币必须是: {', '.join(PositionValidator.ALLOWED_CURRENCIES)}"
        
        return True, ""
    
    @staticmethod
    def validate_market(value: Any) -> Tuple[bool, str]:
        """验证市场代码"""
        if value is None:
            return True, ""  # 市场有默认值
        
        value_str = str(value).strip().upper()
        if value_str not in PositionValidator.ALLOWED_MARKETS:
            return False, f"市场必须是: {', '.join(PositionValidator.ALLOWED_MARKETS)}"
        
        return True, ""
    
    @staticmethod
    def validate_quantity(value: Any) -> Tuple[bool, str]:
        """验证数量"""
        if value is None:
            return True, ""  # 数量可以为空
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "数量必须是数字"
        
        if num_value < 0:
            return False, "数量不能为负数"
        
        if num_value > 10 ** 9:
            return False, "数量超出限额"
        
        return True, ""
    
    @staticmethod
    def validate_strike_price(value: Any) -> Tuple[bool, str]:
        """验证行权价"""
        if value is None:
            return True, ""  # 行权价可以为空
        
        try:
            num_value = float(value)
        except (TypeError, ValueError):
            return False, "行权价必须是数字"
        
        if num_value <= 0:
            return False, "行权价必须大于0"
        
        if num_value > PositionValidator.MAX_AMOUNT:
            return False, f"行权价超出限额 ({PositionValidator.MAX_AMOUNT})"
        
        return True, ""
    
    @staticmethod
    def _check_precision(value: float) -> bool:
        """检查小数精度"""
        # 转换为字符串检查小数位数
        str_value = f"{value:.10f}".rstrip('0')
        if '.' in str_value:
            decimal_places = len(str_value.split('.')[1])
            return decimal_places <= PositionValidator.MAX_PRECISION
        return True
    
    @classmethod
    def validate_create(cls, data: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        验证创建持仓的数据
        
        Args:
            data: 持仓数据字典
            
        Returns:
            错误列表，每项包含 field 和 message
        """
        errors = []
        
        # 必填字段验证
        required_validators = [
            ('customerId', cls.validate_customer_id, True),
            ('productCode', cls.validate_product_code, True),
            ('marketValue', cls.validate_market_value, True),
        ]
        
        # 可选字段验证
        optional_validators = [
            ('profitLoss', cls.validate_profit_loss, False),
            ('optionFee', cls.validate_option_fee, False),
            ('commission', cls.validate_commission, False),
            ('status', cls.validate_status, False),
            ('currency', cls.validate_currency, False),
            ('market', cls.validate_market, False),
            ('quantity', cls.validate_quantity, False),
            ('strikePrice', cls.validate_strike_price, False),
        ]
        
        # 验证必填字段
        for field, validator, required in required_validators:
            if field in data:
                valid, msg = validator(data[field])
                if not valid:
                    errors.append({'field': field, 'message': msg})
            elif required:
                errors.append({'field': field, 'message': f'{field} 是必填字段'})
        
        # 验证可选字段
        for field, validator, _ in optional_validators:
            if field in data and data[field] is not None:
                valid, msg = validator(data[field])
                if not valid:
                    errors.append({'field': field, 'message': msg})
        
        return errors
    
    @classmethod
    def validate_update(cls, data: Dict[str, Any]) -> List[Dict[str, str]]:
        """
        验证更新持仓的数据
        
        Args:
            data: 更新数据字典
            
        Returns:
            错误列表
        """
        errors = []
        
        # 允许更新的字段及其验证器
        update_validators = {
            'marketValue': cls.validate_market_value,
            'profitLoss': cls.validate_profit_loss,
            'optionFee': cls.validate_option_fee,
            'commission': cls.validate_commission,
            'status': cls.validate_status,
            'quantity': cls.validate_quantity,
            'strikePrice': cls.validate_strike_price,
        }
        
        # 不允许直接更新的字段
        protected_fields = {'_id', 'customerId', 'createdAt', 'productCode'}
        
        for field in protected_fields:
            if field in data:
                errors.append({'field': field, 'message': f'{field} 不允许直接更新'})
        
        # 验证允许更新的字段
        for field, validator in update_validators.items():
            if field in data and data[field] is not None:
                valid, msg = validator(data[field])
                if not valid:
                    errors.append({'field': field, 'message': msg})
        
        return errors

class PositionModel:
    def __init__(self, db, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
        self.collection_name = 'positions'
        if db is not None:
            self.collection = db[self.collection_name]
            try:
                self.collection.create_index("customerId")
                self.collection.create_index("productCode")
            except:
                pass
        else:
            self.collection = None

    def _is_cloud(self):
        return self.cloud_client is not None

    def get_positions(self, limit: int = 20, skip: int = 0, customer_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        if self._is_cloud():
            if not self.cloud_client:
                return [], 0
            
            where_clause = ""
            if customer_id:
                where_clause = f'.where({{customerId: "{customer_id}"}})'  
            
            try:
                count_query = f'db.collection("{self.collection_name}"){where_clause}.count()'
                total = self.cloud_client.count(count_query)
                
                query = f'db.collection("{self.collection_name}"){where_clause}.orderBy("createdAt", "desc").skip({skip}).limit({limit}).get()'
                items = self.cloud_client.query(query)
                for item in items:
                    if "_id" in item:
                        item["_id"] = str(item["_id"])
                return items, total
            except Exception as e:
                logger.warning(f"[get_positions] 云数据库查询失败，返回空数据: {e}")
                return [], 0
        else:
            if not self.collection:
                return [], 0
            
            query = {}
            if customer_id:
                query["customerId"] = customer_id
                
            total = self.collection.count_documents(query)
            cursor = self.collection.find(query).sort("createdAt", -1).skip(skip).limit(limit)
            items = []
            for item in cursor:
                item["_id"] = str(item["_id"])
                for k in ["createdAt", "updatedAt"]:
                    if k in item and hasattr(item[k], "isoformat"):
                        item[k] = item[k].isoformat()
                items.append(item)
            return items, total

    def get_position_by_id(self, position_id: str) -> Optional[Dict[str, Any]]:
        """根据ID获取单个持仓"""
        if self._is_cloud():
            if not self.cloud_client:
                return None
            try:
                query = f'db.collection("{self.collection_name}").where({{_id: "{position_id}"}}).limit(1).get()'
                items = self.cloud_client.query(query)
                if items:
                    item = items[0]
                    if "_id" in item:
                        item["_id"] = str(item["_id"])
                    return item
                return None
            except Exception as e:
                logger.warning(f"[get_position_by_id] 云数据库查询失败: {e}")
                return None
        else:
            if not self.collection:
                return None
            try:
                item = self.collection.find_one({'_id': ObjectId(position_id)})
                if item:
                    item["_id"] = str(item["_id"])
                    for k in ["createdAt", "updatedAt"]:
                        if k in item and hasattr(item[k], "isoformat"):
                            item[k] = item[k].isoformat()
                return item
            except Exception as e:
                logger.warning(f"[get_position_by_id] MongoDB查询失败: {e}")
                return None

    def get_statistics(self, customer_id: str = None) -> Dict[str, Any]:
        """获取持仓统计数据，包括存续和已完结的统计"""
        stats = {
            "totalMarketValue": 0,      # 存续名义本金
            "totalProfitLoss": 0,       # 存续净收益
            "completedProfit": 0,       # 完结净收益
            "optionFee": 0,             # 权利金总额
            "commission": 0,            # 手续费总额
            "totalCount": 0
        }

        if self._is_cloud():
            if not self.cloud_client:
                return stats

            # 查询存续持仓
            active_where = '.where({status: "active"})'
            if customer_id:
                active_where = f'.where({{status: "active", customerId: "{customer_id}"}})'

            active_query = f'db.collection("{self.collection_name}"){active_where}.limit(1000).get()'
            try:
                active_items = self.cloud_client.query(active_query)
            except Exception as e:
                logger.warning(f"[get_statistics] 云数据库查询存续持仓失败: {e}")
                active_items = []

            # 查询已完结持仓
            closed_where = '.where({status: "closed"})'
            if customer_id:
                closed_where = f'.where({{status: "closed", customerId: "{customer_id}"}})'

            closed_query = f'db.collection("{self.collection_name}"){closed_where}.limit(1000).get()'
            try:
                closed_items = self.cloud_client.query(closed_query)
            except Exception as e:
                logger.warning(f"[get_statistics] 云数据库查询已完结持仓失败: {e}")
                closed_items = []

            # 统计存续持仓
            stats["totalCount"] = len(active_items)
            for item in active_items:
                stats["totalMarketValue"] += float(item.get("marketValue", 0))
                stats["totalProfitLoss"] += float(item.get("profitLoss", 0))
                stats["optionFee"] += float(item.get("optionFee", 0))
                stats["commission"] += float(item.get("commission", 0))

            # 统计已完结持仓盈亏
            for item in closed_items:
                stats["completedProfit"] += float(item.get("profitLoss", 0))
                stats["optionFee"] += float(item.get("optionFee", 0))
                stats["commission"] += float(item.get("commission", 0))

        else:
            if not self.collection:
                return stats

            # 存续持仓统计
            active_match = {"status": "active"}
            if customer_id:
                active_match["customerId"] = customer_id

            active_pipeline = [
                {"$match": active_match},
                {"$group": {
                    "_id": None,
                    "totalMarketValue": {"$sum": "$marketValue"},
                    "totalProfitLoss": {"$sum": "$profitLoss"},
                    "optionFee": {"$sum": {"$ifNull": ["$optionFee", 0]}},
                    "commission": {"$sum": {"$ifNull": ["$commission", 0]}},
                    "count": {"$sum": 1}
                }}
            ]
            active_result = list(self.collection.aggregate(active_pipeline))
            if active_result:
                stats["totalMarketValue"] = active_result[0]["totalMarketValue"]
                stats["totalProfitLoss"] = active_result[0]["totalProfitLoss"]
                stats["optionFee"] = active_result[0]["optionFee"]
                stats["commission"] = active_result[0]["commission"]
                stats["totalCount"] = active_result[0]["count"]

            # 已完结持仓统计
            closed_match = {"status": "closed"}
            if customer_id:
                closed_match["customerId"] = customer_id

            closed_pipeline = [
                {"$match": closed_match},
                {"$group": {
                    "_id": None,
                    "completedProfit": {"$sum": "$profitLoss"},
                    "optionFee": {"$sum": {"$ifNull": ["$optionFee", 0]}},
                    "commission": {"$sum": {"$ifNull": ["$commission", 0]}}
                }}
            ]
            closed_result = list(self.collection.aggregate(closed_pipeline))
            if closed_result:
                stats["completedProfit"] = closed_result[0]["completedProfit"]
                stats["optionFee"] += closed_result[0]["optionFee"]
                stats["commission"] += closed_result[0]["commission"]

        return stats

    def create_positions(self, positions: List[Dict[str, Any]]) -> bool:
        if not positions:
            return False
        
        # 验证每条数据
        all_errors = []
        for idx, p in enumerate(positions):
            errors = PositionValidator.validate_create(p)
            for err in errors:
                err['index'] = idx
                all_errors.append(err)
        
        if all_errors:
            logger.warning(f"[create_positions] 数据验证失败: {all_errors}")
            raise PositionValidationError(
                f"批量创建持仓数据验证失败，共{len(all_errors)}个错误",
                errors=all_errors
            )
        
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        for p in positions:
            p["createdAt"] = now
            p["updatedAt"] = now
            # Default fields if missing
            if "status" not in p:
                p["status"] = "active"
            if "currency" not in p:
                p["currency"] = "CNY"
            if "market" not in p:
                p["market"] = "CN"
            
        if self._is_cloud():
            # Cloud DB usually supports add one by one
            success_count = 0
            for p in positions:
                try:
                    self.cloud_client.add(collection=self.collection_name, data=p)
                    success_count += 1
                except Exception as e:
                    logger.warning(f"[create_positions] 创建持仓失败: {e}")
            return success_count > 0
        else:
            if not self.collection:
                return False
            result = self.collection.insert_many(positions)
            return len(result.inserted_ids) > 0

    def create_position(self, data: Dict[str, Any]) -> str:
        # 输入验证
        errors = PositionValidator.validate_create(data)
        if errors:
            logger.warning(f"[create_position] 数据验证失败: {errors}")
            raise PositionValidationError(
                "持仓数据验证失败",
                errors=errors
            )
        
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["createdAt"] = now
        data["updatedAt"] = now
        if "status" not in data:
            data["status"] = "active"
        if "currency" not in data:
            data["currency"] = "CNY"
        if "market" not in data:
            data["market"] = "CN"

        if self._is_cloud():
            try:
                ids = self.cloud_client.add(collection=self.collection_name, data=data)
                logger.info(f"[create_position] 持仓创建成功: customerId={data.get('customerId')}, productCode={data.get('productCode')}")
                return ids[0] if ids else None
            except CloudDbRequestError as e:
                err_msg = str(e)
                if 'ResourceNotFound' in err_msg or 'Db or Table not exist' in err_msg or '集合不存在' in err_msg:
                    logger.error(f"[create_position] 数据库集合 '{self.collection_name}' 不存在，请在微信云开发控制台创建该集合")
                    raise RuntimeError(
                        f"数据库集合 '{self.collection_name}' 不存在。"
                        "请在微信云开发控制台 → 数据库 → 集合管理中创建该集合。"
                    )
                raise
        else:
            if not self.collection:
                raise RuntimeError("数据库未连接")
            result = self.collection.insert_one(data)
            logger.info(f"[create_position] 持仓创建成功: _id={result.inserted_id}")
            return str(result.inserted_id)

    def update_position(self, position_id: str, data: Dict[str, Any]) -> bool:
        # 输入验证
        errors = PositionValidator.validate_update(data)
        if errors:
            logger.warning(f"[update_position] 数据验证失败: {errors}")
            raise PositionValidationError(
                "持仓更新数据验证失败",
                errors=errors
            )
        
        now = datetime.utcnow().isoformat() if self._is_cloud() else datetime.utcnow()
        data["updatedAt"] = now
        
        if self._is_cloud():
            where_js = json.dumps({"_id": position_id})
            updated = self.cloud_client.update_where(
                collection=self.collection_name,
                where_js=where_js,
                data=data
            )
            if updated > 0:
                logger.info(f"[update_position] 持仓更新成功: position_id={position_id}")
            return updated > 0
        else:
            if not self.collection:
                return False
            result = self.collection.update_one(
                {'_id': ObjectId(position_id)},
                {'$set': data}
            )
            if result.matched_count > 0:
                logger.info(f"[update_position] 持仓更新成功: position_id={position_id}")
            return result.matched_count > 0

    def delete_position(self, position_id: str) -> bool:
        if self._is_cloud():
            where_js = json.dumps({"_id": position_id})
            deleted = self.cloud_client.delete_where(
                collection=self.collection_name,
                where_js=where_js
            )
            return deleted > 0
        else:
            if not self.collection:
                return False
            result = self.collection.delete_one({'_id': ObjectId(position_id)})
            return result.deleted_count > 0
