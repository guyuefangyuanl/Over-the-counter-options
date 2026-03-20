import logging
from typing import List, Dict, Any, Tuple, Optional
from flask import current_app
from datetime import datetime
from models.inquiry_status import InquiryStatus, InquiryStatusMachine, INQUIRY_STATUS_VALUES

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

        # 云数据库路径：分别 count（云DB 暂不支持 aggregate）
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
        
        # Update with real-time quotes
        if positions:
            try:
                from services.stock_service import StockService
                for p in positions:
                    # 已平仓持仓不应使用实时行情覆盖已实现盈亏
                    if p.get("status") != "active":
                        continue

                    code = p.get('productCode')
                    if not code:
                        continue
                        
                    # Try to get quote. Fail gracefully.
                    try:
                        quote = StockService.get_stock_realtime_data(code)
                    except:
                        quote = None
                        
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
                            # Calculate return rate
                            if cost_price > 0:
                                p['returnRate'] = (current_price - cost_price) / cost_price
                            
            except Exception as e:
                logger.error(f"Failed to update real-time quotes for positions: {e}")
                
        return positions, total

    def create_position(self, data: Dict[str, Any]) -> str:
        model = self._get_position_model()
        # Basic validation
        if not data.get('customerId') or not data.get('productCode'):
            raise ValueError("缺少必要字段：customerId 或 productCode")
            
        # Ensure numeric types
        data['quantity'] = float(data.get('quantity', 0))
        data['price'] = float(data.get('price', 0))
        data['marketValue'] = data['quantity'] * data['price']
        data['profitLoss'] = 0 # Initial PL is 0
        
        return model.create_position(data)

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

    def get_position_by_id(self, position_id: str) -> Optional[Dict[str, Any]]:
        """根据ID获取单个持仓"""
        model = self._get_position_model()
        return model.get_position_by_id(position_id)

    def close_position(self, position_id: str, close_price: float, close_type: str = 'accounting') -> bool:
        """平仓操作

        Args:
            position_id: 持仓ID
            close_price: 平仓价格
            close_type: 平仓类型 'accounting'(记账) 或 'order'(下单)
        """
        model = self._get_position_model()
        position = model.get_position_by_id(position_id)
        if not position:
            raise ValueError("持仓不存在")

        if position.get('status') != 'active':
            raise ValueError("持仓已平仓或状态异常")

        # 计算平仓盈亏
        quantity = float(position.get('quantity', 0))
        cost_price = float(position.get('price', 0))
        profit_loss = (close_price - cost_price) * quantity if cost_price > 0 else 0

        # 更新持仓状态
        update_data = {
            'status': 'closed',
            'closePrice': close_price,
            'closeType': close_type,
            'profitLoss': profit_loss,
            'closedAt': datetime.utcnow().isoformat() if model._is_cloud() else datetime.utcnow()
        }

        return model.update_position(position_id, update_data)

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

    def withdraw(self, user_id: str, amount: float, remark: str = "提现") -> float:
        user_model = self._get_user_model()
        tx_model = self._get_transaction_model()
        
        # update_balance handles negative check
        new_balance = user_model.update_balance(user_id, -amount)
        
        tx_model.create_transaction({
            "user_id": user_id,
            "type": "withdraw",
            "amount": -amount,
            "balance_after": new_balance,
            "remark": remark
        })
        return new_balance

    def get_transactions(self, user_id: str, page=1, limit=20):
        model = self._get_transaction_model()
        skip = (page - 1) * limit
        items = model.get_transactions(user_id, limit, skip)
        total = model.count_transactions(user_id)
        return items, total
