import logging
from datetime import datetime, timedelta
from flask import current_app
from typing import Dict, Any, List, Tuple, Optional
from services.trade_service import TradeService
from services.stock_service import StockService
from services.notification_service import NotificationService
from models.settlement import SettlementModel

logger = logging.getLogger(__name__)

class SettlementService:
    """
    结算服务
    负责：
    1. 每日持仓结算
    2. 到期自动行权
    3. 资金划转
    4. 结算记录生成
    """
    
    def __init__(self):
        self.trade_service = TradeService()
        self.stock_service = StockService()
        self.notification_service = NotificationService()

    def _get_settlement_model(self):
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return SettlementModel(db, cloud_client=cloud_db)

    def _get_position_model(self):
        from models.position import PositionModel
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_db = getattr(current_app, "cloud_db", None)
        return PositionModel(db, cloud_client=cloud_db)

    def run_daily_settlement(self) -> Dict[str, Any]:
        """
        执行每日结算
        检查所有活跃持仓，处理到期持仓
        
        Returns:
            结算结果统计
        """
        logger.info("Starting daily settlement...")
        
        results = {
            'settled': 0,
            'expired': 0,
            'margin_calls': 0,
            'errors': 0,
            'details': []
        }
        
        try:
            # 1. 获取所有活跃持仓
            positions, _ = self.trade_service.get_positions(limit=1000)
            today = datetime.now().date()
            
            for pos in positions:
                if pos.get('status') != 'active':
                    continue
                
                try:
                    # 2. 检查是否到期
                    expire_time_str = pos.get('expireTime')
                    if expire_time_str:
                        expire_date = self._parse_date(expire_time_str)
                        
                        if expire_date and expire_date <= today:
                            # 执行到期结算
                            settlement_result = self._settle_expired_position(pos)
                            if settlement_result:
                                results['expired'] += 1
                                results['details'].append({
                                    'position_id': str(pos.get('_id')),
                                    'type': 'expired',
                                    'pnl': settlement_result.get('pnl', 0)
                                })
                            continue
                    
                    # 3. 检查保证金
                    margin_result = self._check_margin(pos)
                    if margin_result and margin_result.get('margin_call'):
                        self._send_margin_call_notification(pos, margin_result)
                        results['margin_calls'] += 1
                    
                    # 4. 更新持仓市值和盈亏（每日重算）
                    self._update_position_market_value(pos)
                    
                except Exception as e:
                    logger.error(f"处理持仓 {pos.get('_id')} 失败: {e}")
                    results['errors'] += 1
            
            # 5. 生成结算摘要
            self._generate_settlement_summary(results)
            
            logger.info(f"Daily settlement completed. Results: {results}")
            return results
            
        except Exception as e:
            logger.error(f"每日结算失败: {e}")
            results['errors'] += 1
            return results

    def settle_position(self, position_id: str, settlement_price: float = None) -> Dict[str, Any]:
        """
        手动结算单个持仓
        
        Args:
            position_id: 持仓ID
            settlement_price: 结算价格（可选，默认使用实时价格）
            
        Returns:
            结算结果
        """
        try:
            position = self.trade_service.get_position_by_id(position_id)
            if not position:
                raise ValueError("持仓不存在")
            
            if position.get('status') != 'active':
                raise ValueError("持仓已结算或状态异常")
            
            # 获取结算价格
            if settlement_price is None:
                code = position.get('productCode')
                quote = self.stock_service.get_stock_realtime_data(code)
                if not quote:
                    raise ValueError("无法获取结算价格")
                settlement_price = float(quote.get('price', 0))
            
            # 执行结算
            return self._execute_settlement(position, settlement_price, 'manual')
            
        except Exception as e:
            logger.error(f"手动结算失败: {e}")
            raise

    def auto_exercise(self, position_id: str) -> Dict[str, Any]:
        """
        自动行权
        
        Args:
            position_id: 持仓ID
            
        Returns:
            行权结果
        """
        try:
            position = self.trade_service.get_position_by_id(position_id)
            if not position:
                raise ValueError("持仓不存在")
            
            option_type = position.get('optionType', 'call')
            strike_price = float(position.get('strikePrice', 0))
            quantity = float(position.get('quantity', 0))
            
            # 获取标的价格
            code = position.get('productCode')
            quote = self.stock_service.get_stock_realtime_data(code)
            if not quote:
                raise ValueError("无法获取标的价格")
            
            underlying_price = float(quote.get('price', 0))
            
            # 判断是否应该行权
            should_exercise = self._should_exercise(option_type, strike_price, underlying_price)
            
            if should_exercise:
                # 计算行权收益
                if option_type == 'call':
                    pnl = max(0, underlying_price - strike_price) * quantity
                else:
                    pnl = max(0, strike_price - underlying_price) * quantity
                
                return self._execute_settlement(position, underlying_price, 'exercise', pnl)
            else:
                # 放弃行权
                return self._execute_settlement(position, underlying_price, 'expire', 0)
                
        except Exception as e:
            logger.error(f"自动行权失败: {e}")
            raise

    # --- 私有方法 ---

    def _settle_expired_position(self, position: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        结算到期持仓
        """
        pos_id = position.get('_id')
        user_id = position.get('customerId')
        code = position.get('productCode')
        product_name = position.get('productName', code)
        
        try:
            # 获取结算价格
            quote = self.stock_service.get_stock_realtime_data(code)
            if not quote:
                logger.error(f"无法获取 {code} 的价格，跳过结算")
                return None
            
            settlement_price = float(quote.get('price', 0))
            
            # 执行结算
            result = self._execute_settlement(position, settlement_price, 'expiry')
            
            # 发送通知
            if user_id:
                self.notification_service.notify_settlement(
                    user_id, 
                    str(pos_id), 
                    result.get('pnl', 0),
                    product_name
                )
            
            return result
            
        except Exception as e:
            logger.error(f"结算持仓 {pos_id} 失败: {e}")
            return None

    def _execute_settlement(self, position: Dict[str, Any], settlement_price: float,
                            settlement_type: str, custom_pnl: float = None) -> Dict[str, Any]:
        """
        执行结算逻辑
        """
        pos_id = position.get('_id')
        user_id = position.get('customerId')
        code = position.get('productCode')
        product_name = position.get('productName', code)
        
        quantity = float(position.get('quantity', 0))
        cost_price = float(position.get('price', 0))
        strike_price = float(position.get('strikePrice', 0))
        option_type = position.get('optionType', 'call')
        
        # 计算盈亏
        if custom_pnl is not None:
            pnl = custom_pnl
        elif option_type == 'call':
            pnl = max(0, settlement_price - strike_price) * quantity if strike_price > 0 else 0
        else:
            pnl = max(0, strike_price - settlement_price) * quantity if strike_price > 0 else 0
        
        # 创建结算记录
        model = self._get_settlement_model()
        settlement_id = model.create_settlement({
            "date": datetime.now().strftime("%Y-%m-%d"),
            "position_id": str(pos_id),
            "user_id": user_id,
            "product_code": code,
            "product_name": product_name,
            "type": settlement_type,
            "quantity": quantity,
            "cost_price": cost_price,
            "strike_price": strike_price,
            "settlement_price": settlement_price,
            "pnl": pnl,
            "status": "completed",
            "created_at": datetime.utcnow()
        })
        
        # 更新持仓状态
        position_model = self._get_position_model()
        update_data = {
            'status': 'settled',
            'settlementId': settlement_id,
            'settlementPrice': settlement_price,
            'settlementType': settlement_type,
            'profitLoss': pnl,
            'settledAt': datetime.utcnow().isoformat() if position_model._is_cloud() else datetime.utcnow()
        }
        
        position_model.update_position(str(pos_id), update_data)
        
        # 资金划转
        if pnl > 0 and user_id:
            self.trade_service.deposit(user_id, pnl, remark=f"期权结算收益: {product_name}")
        elif pnl < 0 and user_id:
            # 亏损已在保证金中扣除，此处仅记录
            pass
        
        logger.info(f"Settled position {pos_id}: type={settlement_type}, pnl={pnl}")
        
        return {
            'settlement_id': settlement_id,
            'pnl': pnl,
            'settlement_price': settlement_price,
            'type': settlement_type
        }

    def _update_position_market_value(self, position: Dict[str, Any]) -> bool:
        """
        更新持仓市值
        """
        try:
            pos_id = position.get('_id')
            code = position.get('productCode')
            
            if not code:
                return False
            
            # 获取实时价格
            quote = self.stock_service.get_stock_realtime_data(code)
            if not quote:
                return False
            
            current_price = float(quote.get('price', 0))
            quantity = float(position.get('quantity', 0))
            cost_price = float(position.get('price', 0))
            
            if current_price <= 0 or quantity <= 0:
                return False
            
            # 计算市值和盈亏
            market_value = current_price * quantity
            profit_loss = (current_price - cost_price) * quantity if cost_price > 0 else 0
            return_rate = (current_price - cost_price) / cost_price if cost_price > 0 else 0
            
            # 更新持仓
            position_model = self._get_position_model()
            update_data = {
                'currentPrice': current_price,
                'marketValue': market_value,
                'profitLoss': profit_loss,
                'returnRate': return_rate,
                'lastUpdated': datetime.utcnow().isoformat() if position_model._is_cloud() else datetime.utcnow()
            }
            
            return position_model.update_position(str(pos_id), update_data)
            
        except Exception as e:
            logger.error(f"更新持仓市值失败: {e}")
            return False

    def _check_margin(self, position: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        检查保证金是否充足
        """
        try:
            user_id = position.get('customerId')
            if not user_id:
                return None
            
            summary = self.trade_service.get_account_summary(user_id)
            balance = float(summary.get('balance', 0))
            market_value = float(position.get('marketValue', 0))
            
            # 简化计算：保证金 = 市值 * 20%
            required_margin = market_value * 0.2
            
            if balance < required_margin:
                return {
                    'margin_call': True,
                    'required': required_margin,
                    'available': balance,
                    'shortfall': required_margin - balance
                }
            
            return {'margin_call': False}
            
        except Exception as e:
            logger.error(f"保证金检查失败: {e}")
            return None

    def _send_margin_call_notification(self, position: Dict[str, Any], margin_result: Dict[str, Any]):
        """
        发送追加保证金通知
        """
        user_id = position.get('customerId')
        if user_id:
            self.notification_service.notify_margin_call(
                user_id, 
                margin_result.get('shortfall', 0)
            )

    def _should_exercise(self, option_type: str, strike_price: float, underlying_price: float) -> bool:
        """
        判断是否应该行权
        """
        if option_type == 'call':
            return underlying_price > strike_price
        else:
            return underlying_price < strike_price

    def _parse_date(self, date_str: str) -> Optional[datetime.date]:
        """
        解析日期字符串
        """
        if not date_str:
            return None
        try:
            # 支持多种格式
            for fmt in ['%Y-%m-%d', '%Y/%m/%d', '%Y%m%d']:
                try:
                    return datetime.strptime(date_str[:10], fmt).date()
                except ValueError:
                    continue
            return None
        except Exception:
            return None

    def _generate_settlement_summary(self, results: Dict[str, Any]):
        """
        生成结算摘要日志
        """
        summary = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'settled_count': results['settled'],
            'expired_count': results['expired'],
            'margin_call_count': results['margin_calls'],
            'error_count': results['errors'],
            'generated_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Settlement Summary: {summary}")
        
        # 可选：存储到数据库
        try:
            model = self._get_settlement_model()
            # 如果有专门的结算摘要表
            # model.create_settlement_summary(summary)
        except Exception as e:
            logger.warning(f"存储结算摘要失败: {e}")