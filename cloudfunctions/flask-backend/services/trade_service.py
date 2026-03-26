import logging
from typing import List, Dict, Any, Tuple, Optional
from flask import current_app
from datetime import datetime
from services.inquiry_status import INQUIRY_STATUS_VALUES

logger = logging.getLogger(__name__)

class TradeService:
    def __init__(self):
        pass

    def _get_inquiry_model(self):
        from models.inquiry import InquiryModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        
        cloud_db = getattr(current_app, "cloud_db", None)
        return InquiryModel(db, cloud_client=cloud_db)

    def _get_order_model(self):
        from models.order import OrderModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        
        cloud_db = getattr(current_app, "cloud_db", None)
        return OrderModel(db, cloud_client=cloud_db)

    # --- Inquiry Methods ---

    def create_inquiry(self, data: Dict[str, Any]) -> str:
        model = self._get_inquiry_model()
        return model.create_inquiry(data)

    def get_inquiries(self, limit: int = 20, page: int = 1, status: str = None, user_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        model = self._get_inquiry_model()
        skip = (page - 1) * limit
        return model.get_inquiries(limit, skip, status, user_id)

    def get_inquiry_by_id(self, inquiry_id: str) -> Optional[Dict[str, Any]]:
        model = self._get_inquiry_model()
        return model.get_inquiry_by_id(inquiry_id)

    def update_inquiry_status(self, inquiry_id: str, status: str, remark: str = None, operator: str = None) -> bool:
        model = self._get_inquiry_model()
        data = {"status": status}
        if remark:
            data["remark"] = remark
        
        # We might want to append history here, but Model usually handles simple updates.
        # Ideally Model should handle history appending if it supports it.
        # Our current InquiryModel.update_inquiry just does $set.
        # Let's add history logic here if possible or update Model to support it.
        # Since we updated Model to support generic update, we can pass the whole structure if needed,
        # but Cloud DB update_where is limited.
        # For now, just update status and remark.
        
        # If we need history, we should fetch, append, and update (for Cloud DB compatibility without complex operators)
        # But for simplicity in this phase, let's just update fields.
        
        return model.update_inquiry(inquiry_id, data)

    def get_inquiry_statistics(self) -> Dict[str, int]:
        """获取询价统计信息（按状态分组计数）"""
        model = self._get_inquiry_model()
        # 使用统一的状态定义
        target_statuses = list(INQUIRY_STATUS_VALUES)
        stats: Dict[str, int] = {s: 0 for s in target_statuses}

        if hasattr(model, 'collection') and model.collection is not None:
            # MongoDB 路径：一次 aggregate 计数，避免 N+1
            try:
                pipeline = [
                    {"$match": {"status": {"$in": target_statuses}}},
                    {"$group": {"_id": "$status", "count": {"$sum": 1}}}
                ]
                for row in model.collection.aggregate(pipeline):
                    s = row.get("_id")
                    if s in stats:
                        stats[s] = row.get("count", 0)
                return stats
            except Exception as e:
                logger.warning(f"统计查询 aggregate 失败，降级单独计数: {e}")

        # 云数据库路径：分别 count
        for status in target_statuses:
            try:
                _, count = model.get_inquiries(limit=1, status=status)
                stats[status] = count
            except Exception as e:
                logger.warning(f"获取 {status} 状态计数失败: {e}")

        return stats

    # --- Order Methods ---

    def create_order(self, data: Dict[str, Any]) -> str:
        model = self._get_order_model()
        return model.create_order(data)

    def get_orders(self, limit: int = 20, page: int = 1, status: str = None, user_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        model = self._get_order_model()
        skip = (page - 1) * limit
        return model.get_orders(limit, skip, status, user_id)

    def update_order_status(self, order_id: str, status: str) -> bool:
        model = self._get_order_model()
        return model.update_order(order_id, {"status": status})

    # --- Position Methods ---
    
    def _get_position_model(self):
        from models.position import PositionModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = None
        if callable(ensure_db):
            db = ensure_db()
        if db is None:
            db = getattr(current_app, "db", None)
        
        cloud_db = getattr(current_app, "cloud_db", None)
        return PositionModel(db, cloud_client=cloud_db)

    def get_positions(self, limit: int = 20, page: int = 1, customer_id: str = None) -> Tuple[List[Dict[str, Any]], int]:
        model = self._get_position_model()
        skip = (page - 1) * limit
        positions, total = model.get_positions(limit, skip, customer_id)

        # Update with real-time quotes (with timeout protection)
        # 仅在有持仓且数量合理时尝试获取实时行情，避免大量请求导致超时
        if positions and len(positions) <= 20:  # 限制最多20个持仓获取行情
            try:
                from services.stock_service import StockService
                import concurrent.futures

                def update_position_quote(p):
                    """更新单个持仓的行情数据"""
                    code = p.get('productCode')
                    if not code:
                        return

                    try:
                        # 设置3秒超时
                        quote = StockService.get_stock_realtime_data(code)
                        if quote and quote.get('price'):
                            current_price = float(quote['price'])
                            p['currentPrice'] = current_price

                            # Calculate PnL
                            cost_price = float(p.get('price', 0))
                            qty = float(p.get('quantity', 0))

                            if cost_price and qty:
                                new_mv = current_price * qty
                                p['marketValue'] = new_mv
                                p['profitLoss'] = new_mv - (cost_price * qty)
                                if cost_price > 0:
                                    p['returnRate'] = (current_price - cost_price) / cost_price
                    except Exception as e:
                        logger.debug(f"获取 {code} 行情失败: {e}")
                        # 行情获取失败不影响持仓展示

                # 使用线程池并发获取行情，总超时10秒
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(update_position_quote, p) for p in positions]
                    try:
                        concurrent.futures.wait(futures, timeout=10)
                    except Exception as e:
                        logger.warning(f"行情查询超时: {e}")

            except Exception as e:
                logger.warning(f"Failed to update real-time quotes: {e}")
                # 行情获取失败不影响持仓列表返回

        return positions, total

    def create_position(self, data: Dict[str, Any]) -> str:
        model = self._get_position_model()

        # Basic validation with detailed error message
        if not data.get('customerId'):
            logger.error(f'[create_position] 缺少 customerId，收到的数据: {list(data.keys())}')
            raise ValueError("缺少必要字段：customerId（用户身份信息）。请确保已正确登录。")
        if not data.get('productCode'):
            logger.error(f'[create_position] 缺少 productCode')
            raise ValueError("缺少必要字段：productCode（标的代码）")

        # Ensure numeric types
        try:
            data['quantity'] = float(data.get('quantity', 0))
            data['price'] = float(data.get('price', 0))
        except (ValueError, TypeError) as e:
            logger.error(f'[create_position] 数值转换失败: {e}')
            raise ValueError(f"数值格式错误: {str(e)}")

        data['marketValue'] = data['quantity'] * data['price']
        data['profitLoss'] = 0  # Initial PL is 0

        logger.info(f'[create_position] 创建持仓: customerId={data.get("customerId")}, productCode={data.get("productCode")}, quantity={data.get("quantity")}')

        try:
            position_id = model.create_position(data)
            logger.info(f'[create_position] 持仓创建成功: id={position_id}')
            return position_id
        except RuntimeError as e:
            # 集合不存在等配置问题，直接抛出友好错误
            err_msg = str(e)
            if '集合' in err_msg and '不存在' in err_msg:
                logger.error(f'[create_position] 数据库配置错误: {err_msg}')
                raise ValueError(err_msg)
            raise
        except Exception as e:
            logger.error(f'[create_position] 数据库写入失败: {e}')
            raise

    def update_position(self, position_id: str, data: Dict[str, Any]) -> bool:
        model = self._get_position_model()
        
        # Recalculate market value if quantity or price changes
        # Note: Ideally we should fetch the position first to merge, but for efficiency we assume 
        # frontend sends what needs change. If Qty changes, we should probably update MV.
        # But MV depends on Current Price (which changes) or Cost Price (at open)?
        # 'price' here usually means Cost Price.
        # So Market Value = Quantity * Current Price. 
        # But stored 'marketValue' is often snapshot.
        # Let's just update fields. Real-time get_positions handles dynamic MV.
        
        if 'quantity' in data:
            data['quantity'] = float(data['quantity'])
        if 'price' in data:
            data['price'] = float(data['price'])
            
        return model.update_position(position_id, data)

    def delete_position(self, position_id: str) -> bool:
        model = self._get_position_model()
        return model.delete_position(position_id)

    def close_position(self, position_id: str, close_price: float, close_type: str = 'accounting', customer_id: str = None) -> Dict[str, Any]:
        """
        平仓操作
        :param position_id: 持仓ID
        :param close_price: 平仓价格
        :param close_type: 平仓类型 'accounting'(平仓记账) 或 'order'(平仓下单)
        :param customer_id: 客户ID（用于权限验证）
        :return: 包含平仓结果的字典
        """
        model = self._get_position_model()
        
        # 1. 获取持仓信息
        position = model.get_position_by_id(position_id)
        if not position:
            raise ValueError("持仓不存在")
        
        # 2. 验证持仓归属（如果提供了customer_id）
        if customer_id and position.get('customerId') != customer_id:
            raise ValueError("无权操作此持仓")
        
        # 3. 检查持仓状态
        if position.get('status') != 'active':
            raise ValueError("该持仓已完结，无法再次平仓")
        
        # 4. 计算盈亏
        quantity = float(position.get('quantity', 0))
        cost_price = float(position.get('price', 0))
        cost_basis = quantity * cost_price
        close_value = quantity * close_price
        profit_loss = close_value - cost_basis
        
        # 5. 更新持仓状态
        update_data = {
            'status': 'closed',
            'closePrice': close_price,
            'closeValue': close_value,
            'profitLoss': profit_loss,
            'closeType': close_type,
            'closedAt': datetime.utcnow().isoformat() if model._is_cloud() else datetime.utcnow()
        }
        
        success = model.update_position(position_id, update_data)
        if not success:
            raise RuntimeError("平仓更新失败")
        
        # 6. 如果是平仓下单，创建订单记录
        if close_type == 'order':
            try:
                order_model = self._get_order_model()
                order_data = {
                    'positionId': position_id,
                    'productCode': position.get('productCode'),
                    'productName': position.get('productName'),
                    'customerId': position.get('customerId'),
                    'customerName': position.get('customerName'),
                    'type': 'close',
                    'quantity': quantity,
                    'price': close_price,
                    'status': 'filled',
                    'filledAt': datetime.utcnow().isoformat()
                }
                order_model.create_order(order_data)
            except Exception as e:
                logger.warning(f"平仓订单创建失败，但持仓已更新: {e}")
        
        return {
            'positionId': position_id,
            'profitLoss': round(profit_loss, 2),
            'closePrice': close_price,
            'closeValue': round(close_value, 2),
            'closeType': close_type
        }

    def get_position_statistics(self, customer_id: str = None) -> Dict[str, Any]:
        model = self._get_position_model()
        return model.get_statistics(customer_id)

    def seed_positions(self, customer_id: str) -> bool:
        import random
        model = self._get_position_model()
        
        products = [
            {'code': '510050', 'name': '上证50ETF'},
            {'code': '510300', 'name': '沪深300ETF'},
            {'code': '000001', 'name': '平安银行'}
        ]
        
        new_positions = []
        for i in range(3):
            prod = products[i]
            qty = random.randint(1, 10) * 1000
            price = round(random.uniform(2.0, 5.0), 3)
            mv = round(qty * price, 2)
            pl = round(mv * random.uniform(-0.1, 0.2), 2)
            
            doc = {
                'productCode': prod['code'],
                'productName': prod['name'],
                'customerId': customer_id,
                'customerName': 'Test User',
                'quantity': qty,
                'price': price,
                'marketValue': mv,
                'profitLoss': pl,
                'status': 'active'
            }
            new_positions.append(doc)
            
        return model.create_positions(new_positions)

    # --- Account & Funds Methods ---

    def _get_user_model(self):
        from models.user import UserModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return UserModel(db, cloud_client=cloud_db)

    def _get_transaction_model(self):
        from models.transaction import TransactionModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return TransactionModel(db, cloud_client=cloud_db)

    def get_account_summary(self, user_id: str) -> Dict[str, Any]:
        """
        Get total assets, balance, and positions summary
        """
        user_model = self._get_user_model()
        user = user_model.find_user_by_openid(user_id)
        if not user:
            # Create default user info if not exists (for robustness)
            return {"balance": 0, "total_asset": 0, "position_value": 0, "total_profit": 0}
            
        balance = user.get('balance', 0.0)
        
        # Calculate position value
        positions, _ = self.get_positions(limit=100, customer_id=user_id)
        position_value = sum(p.get('marketValue', 0) for p in positions)
        total_profit = sum(p.get('profitLoss', 0) for p in positions)
        
        return {
            "balance": balance,
            "total_asset": balance + position_value,
            "position_value": position_value,
            "total_profit": total_profit,
            "margin_used": 0 # Future feature
        }

    def deposit(self, user_id: str, amount: float, remark: str = "充值") -> float:
        user_model = self._get_user_model()
        tx_model = self._get_transaction_model()
        
        new_balance = user_model.update_balance(user_id, amount)
        
        tx_model.create_transaction({
            "user_id": user_id,
            "type": "deposit",
            "amount": amount,
            "balance_after": new_balance,
            "remark": remark
        })
        return new_balance

    def withdraw(self, user_id: str, amount: float) -> float:
        user_model = self._get_user_model()
        tx_model = self._get_transaction_model()
        
        # update_balance handles negative check
        new_balance = user_model.update_balance(user_id, -amount)
        
        tx_model.create_transaction({
            "user_id": user_id,
            "type": "withdraw",
            "amount": -amount,
            "balance_after": new_balance,
            "remark": "提现"
        })
        return new_balance

    def get_transactions(self, user_id: str, page=1, limit=20):
        model = self._get_transaction_model()
        skip = (page - 1) * limit
        items = model.get_transactions(user_id, limit, skip)
        total = model.count_transactions(user_id)
        return items, total
