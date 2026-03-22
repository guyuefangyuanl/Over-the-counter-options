import math
import logging
from typing import Dict, Any, Tuple, List, Optional
from flask import current_app
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# 简单的正态分布近似函数（云托管环境使用）
def _approx_cdf(x):
    """标准正态分布CDF近似（使用误差函数近似）"""
    return 1.0 / (1.0 + math.exp(-1.702 * x))

def _approx_pdf(x):
    """标准正态分布PDF近似"""
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)

class RiskService:
    # 风险等级定义
    RISK_LEVELS = {
        'low': {'max_position_ratio': 0.3, 'daily_limit': 1000000, 'margin_requirement': 1.0},
        'medium': {'max_position_ratio': 0.5, 'daily_limit': 500000, 'margin_requirement': 1.2},
        'high': {'max_position_ratio': 0.7, 'daily_limit': 200000, 'margin_requirement': 1.5},
        'very_high': {'max_position_ratio': 1.0, 'daily_limit': 50000, 'margin_requirement': 2.0},
    }
    
    def __init__(self):
        pass

    def calculate_bs_greeks(self, S, K, T, r, sigma, option_type='call'):
        """
        Calculate Black-Scholes Greeks (云托管简化版).
        S: Spot Price
        K: Strike Price
        T: Time to Expiry (years)
        r: Risk-free rate
        sigma: Volatility
        """
        if T <= 0:
            return {
                "delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0
            }
            
        try:
            d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
            d2 = d1 - sigma * math.sqrt(T)
        except (ValueError, ZeroDivisionError):
            return {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0}
        
        # 使用近似函数替代 scipy
        nd1 = _approx_pdf(d1)
        Nd1 = _approx_cdf(d1)
        Nd2 = _approx_cdf(d2)
        
        if option_type == 'call':
            delta = Nd1
            rho = K * T * math.exp(-r * T) * Nd2
            theta = (-S * nd1 * sigma / (2 * math.sqrt(T)) - r * K * math.exp(-r * T) * Nd2) / 365.0
        else:
            delta = Nd1 - 1
            rho = -K * T * math.exp(-r * T) * _approx_cdf(-d2)
            theta = (-S * nd1 * sigma / (2 * math.sqrt(T)) + r * K * math.exp(-r * T) * _approx_cdf(-d2)) / 365.0

        gamma = nd1 / (S * sigma * math.sqrt(T))
        vega = S * math.sqrt(T) * nd1 / 100.0 
        
        return {
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "rho": round(rho, 4)
        }

    def check_pre_trade_risk(self, user_id: str, amount: float, current_balance: float) -> Tuple[bool, str]:
        """
        交易前风控检查
        
        Args:
            user_id: 用户ID
            amount: 交易金额
            current_balance: 当前余额
            
        Returns:
            (是否通过, 错误消息)
        """
        errors = []
        
        # 1. 余额检查
        if amount > current_balance:
            errors.append(f"余额不足: 需要 ¥{amount:,.2f}，可用 ¥{current_balance:,.2f}")
        
        # 2. 单笔限额检查
        single_limit = self._get_single_order_limit(user_id)
        if amount > single_limit:
            errors.append(f"单笔限额: 最大 ¥{single_limit:,.2f}，当前 ¥{amount:,.2f}")
        
        # 3. 日交易限额检查
        daily_used = self._get_daily_traded_amount(user_id)
        daily_limit = self._get_daily_limit(user_id)
        if daily_used + amount > daily_limit:
            remaining = max(0, daily_limit - daily_used)
            errors.append(f"日交易限额: 剩余 ¥{remaining:,.2f}，当前交易 ¥{amount:,.2f}")
        
        # 4. 持仓集中度检查
        position_check = self._check_position_concentration(user_id, amount)
        if not position_check['passed']:
            errors.append(position_check['message'])
        
        if errors:
            return False, '; '.join(errors)
        return True, "风控检查通过"

    def check_post_trade_risk(self, user_id: str) -> Dict[str, Any]:
        """
        交易后风险评估
        
        Returns:
            风险评估结果
        """
        try:
            from services.trade_service import TradeService
            trade_service = TradeService()
            
            # 获取账户信息
            summary = trade_service.get_account_summary(user_id)
            
            # 获取持仓
            positions, _ = trade_service.get_positions(limit=100, customer_id=user_id)
            
            # 计算风险指标
            total_exposure = sum(p.get('marketValue', 0) for p in positions)
            total_pnl = sum(p.get('profitLoss', 0) for p in positions)
            position_count = len([p for p in positions if p.get('status') == 'active'])
            
            # 计算集中度风险
            concentration_risk = self._calculate_concentration_risk(positions)
            
            # 计算风险等级
            risk_level = self._calculate_risk_level(
                balance=summary.get('balance', 0),
                total_exposure=total_exposure,
                total_pnl=total_pnl,
                concentration_risk=concentration_risk
            )
            
            return {
                'risk_level': risk_level,
                'total_exposure': total_exposure,
                'total_pnl': total_pnl,
                'position_count': position_count,
                'concentration_risk': concentration_risk,
                'margin_usage': summary.get('margin_used', 0),
                'available_balance': summary.get('balance', 0),
                'warnings': self._generate_risk_warnings(risk_level, concentration_risk, total_pnl)
            }
        except Exception as e:
            logger.error(f"风险评估失败: {e}")
            return {
                'risk_level': 'unknown',
                'error': str(e)
            }

    def calculate_portfolio_greeks(self, positions: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        计算投资组合的Greeks汇总
        
        Args:
            positions: 持仓列表
            
        Returns:
            汇总的Greeks
        """
        total_delta = 0.0
        total_gamma = 0.0
        total_theta = 0.0
        total_vega = 0.0
        
        for pos in positions:
            if pos.get('status') != 'active':
                continue
                
            greeks = pos.get('greeks', {})
            quantity = float(pos.get('quantity', 0))
            
            # 考虑方向（买入为正，卖出为负）
            direction = 1 if pos.get('direction', 'buy') == 'buy' else -1
            
            total_delta += greeks.get('delta', 0) * quantity * direction
            total_gamma += greeks.get('gamma', 0) * quantity
            total_theta += greeks.get('theta', 0) * quantity
            total_vega += greeks.get('vega', 0) * quantity
        
        return {
            'delta': round(total_delta, 4),
            'gamma': round(total_gamma, 6),
            'theta': round(total_theta, 4),
            'vega': round(total_vega, 4)
        }

    def check_margin_call(self, user_id: str) -> Tuple[bool, float]:
        """
        检查是否需要追加保证金
        
        Returns:
            (是否需要追加, 需要追加的金额)
        """
        try:
            from services.trade_service import TradeService
            trade_service = TradeService()
            
            summary = trade_service.get_account_summary(user_id)
            balance = summary.get('balance', 0)
            position_value = summary.get('position_value', 0)
            
            # 简化的保证金计算：持仓价值的20%
            required_margin = position_value * 0.2
            
            if balance < required_margin:
                return True, required_margin - balance
            
            return False, 0.0
        except Exception as e:
            logger.error(f"保证金检查失败: {e}")
            return False, 0.0

    # --- 私有方法 ---

    def _get_single_order_limit(self, user_id: str) -> float:
        """获取单笔交易限额"""
        # 从配置或用户等级获取
        try:
            limit = float(current_app.config.get('SINGLE_ORDER_LIMIT', 1000000))
        except:
            limit = 1000000.0
        return limit

    def _get_daily_limit(self, user_id: str) -> float:
        """获取日交易限额"""
        # 从用户等级或配置获取
        risk_level = self._get_user_risk_level(user_id)
        return self.RISK_LEVELS.get(risk_level, {}).get('daily_limit', 1000000)

    def _get_daily_traded_amount(self, user_id: str) -> float:
        """获取今日已交易金额"""
        try:
            from services.trade_service import TradeService
            trade_service = TradeService()
            
            # 获取今日订单
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            orders, _ = trade_service.get_orders(limit=1000, user_id=user_id)
            
            total = 0.0
            for order in orders:
                created_at = order.get('createdAt')
                if created_at:
                    if isinstance(created_at, str):
                        created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    if created_at >= today_start:
                        total += float(order.get('amount', 0))
            
            return total
        except Exception as e:
            logger.warning(f"获取日交易金额失败: {e}")
            return 0.0

    def _check_position_concentration(self, user_id: str, new_amount: float) -> Dict[str, Any]:
        """检查持仓集中度"""
        try:
            from services.trade_service import TradeService
            trade_service = TradeService()
            
            positions, _ = trade_service.get_positions(limit=100, customer_id=user_id)
            
            # 计算单一标的最大持仓比例
            position_values = {}
            total_value = 0.0
            
            for pos in positions:
                if pos.get('status') != 'active':
                    continue
                code = pos.get('productCode')
                value = float(pos.get('marketValue', 0))
                position_values[code] = position_values.get(code, 0) + value
                total_value += value
            
            # 加入新交易
            total_value += new_amount
            
            # 检查集中度（单一标的不超过50%）
            max_ratio = 0.5
            for code, value in position_values.items():
                ratio = value / total_value if total_value > 0 else 0
                if ratio > max_ratio:
                    return {
                        'passed': False,
                        'message': f"持仓过于集中: {code} 占比 {ratio*100:.1f}%，超过 {max_ratio*100}% 限制"
                    }
            
            return {'passed': True, 'message': ''}
        except Exception as e:
            logger.warning(f"持仓集中度检查失败: {e}")
            return {'passed': True, 'message': ''}

    def _calculate_concentration_risk(self, positions: List[Dict]) -> float:
        """计算持仓集中度风险指数 (0-1)"""
        if not positions:
            return 0.0
        
        position_values = {}
        total_value = 0.0
        
        for pos in positions:
            if pos.get('status') != 'active':
                continue
            code = pos.get('productCode')
            value = float(pos.get('marketValue', 0))
            position_values[code] = position_values.get(code, 0) + value
            total_value += value
        
        if total_value == 0:
            return 0.0
        
        # 计算Herfindahl指数
        hhi = sum((v / total_value) ** 2 for v in position_values.values())
        
        # 归一化到0-1
        n = len(position_values)
        if n <= 1:
            return 1.0
        
        # HHI范围: 1/n 到 1
        normalized = (hhi - 1/n) / (1 - 1/n)
        return round(normalized, 3)

    def _get_user_risk_level(self, user_id: str) -> str:
        """获取用户风险等级"""
        # TODO: 从用户表或配置中获取
        return 'medium'

    def _calculate_risk_level(self, balance: float, total_exposure: float, 
                              total_pnl: float, concentration_risk: float) -> str:
        """计算综合风险等级"""
        risk_score = 0
        
        # 余额风险
        if balance < 0:
            risk_score += 30
        elif balance < total_exposure * 0.1:
            risk_score += 20
        elif balance < total_exposure * 0.2:
            risk_score += 10
        
        # 盈亏风险
        pnl_ratio = total_pnl / total_exposure if total_exposure > 0 else 0
        if pnl_ratio < -0.3:
            risk_score += 30
        elif pnl_ratio < -0.1:
            risk_score += 20
        elif pnl_ratio < 0:
            risk_score += 10
        
        # 集中度风险
        risk_score += int(concentration_risk * 30)
        
        # 划分等级
        if risk_score >= 60:
            return 'very_high'
        elif risk_score >= 40:
            return 'high'
        elif risk_score >= 20:
            return 'medium'
        else:
            return 'low'

    def _generate_risk_warnings(self, risk_level: str, concentration_risk: float, 
                                total_pnl: float) -> List[str]:
        """生成风险警告"""
        warnings = []
        
        if risk_level in ['high', 'very_high']:
            warnings.append(f"当前风险等级较高 ({risk_level})，建议控制仓位")
        
        if concentration_risk > 0.6:
            warnings.append("持仓过于集中，建议分散投资")
        
        if total_pnl < 0:
            warnings.append(f"当前持仓亏损 ¥{abs(total_pnl):,.2f}")
        
        return warnings