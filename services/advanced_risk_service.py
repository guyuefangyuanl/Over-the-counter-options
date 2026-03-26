# -*- coding: utf-8 -*-
"""
高级风控系统
包括保证金管理、风险指标监控、强制平仓机制
"""

import math
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import numpy as np

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    """风险等级"""
    LOW = 'low'           # 低风险
    MEDIUM = 'medium'     # 中风险
    HIGH = 'high'         # 高风险
    CRITICAL = 'critical' # 极高风险


class MarginType(Enum):
    """保证金类型"""
    INITIAL = 'initial'   # 初始保证金
    MAINTENANCE = 'maintenance'  # 维持保证金


@dataclass
class MarginRequirement:
    """保证金要求"""
    initial_margin: float      # 初始保证金
    maintenance_margin: float  # 维持保证金
    margin_call_level: float   # 追保线
    force_close_level: float   # 强平线


@dataclass
class RiskMetrics:
    """风险指标"""
    var_95: float         # 95% VaR
    var_99: float         # 99% VaR
    max_drawdown: float   # 最大回撤
    sharpe_ratio: float   # 夏普比率
    beta: float           # Beta系数
    delta: float          # 组合Delta
    gamma: float          # 组合Gamma
    vega: float           # 组合Vega
    theta: float          # 组合Theta


class MarginCalculator:
    """
    保证金计算器
    
    支持期权、期货、股票等不同品种的保证金计算
    """
    
    # 默认保证金参数
    DEFAULT_PARAMS = {
        'stock': {
            'initial_rate': 0.5,      # 股票融资保证金率 50%
            'maintenance_rate': 0.3,   # 维持保证金率 30%
        },
        'option_sell': {
            'initial_rate': 0.15,      # 期权卖方保证金率
            'min_margin_per_share': 100,  # 每张最低保证金
        },
        'option_buy': {
            'full_premium': True,      # 期权买方全额权利金
        }
    }
    
    @staticmethod
    def calculate_option_margin(
        option_type: str,
        position_type: str,  # long/short
        S: float,           # 标的价格
        K: float,           # 行权价
        premium: float,     # 权利金
        quantity: int,      # 数量（张）
        sigma: float = 0.3  # 波动率
    ) -> MarginRequirement:
        """
        计算期权保证金
        
        Args:
            option_type: call/put
            position_type: long/short
            S: 标的价格
            K: 行权价
            premium: 权利金
            quantity: 数量
            sigma: 波动率
            
        Returns:
            保证金要求
        """
        if position_type == 'long':
            # 买方只需支付权利金
            total_premium = premium * quantity * 10000  # 假设每张10000份
            return MarginRequirement(
                initial_margin=total_premium,
                maintenance_margin=total_premium,
                margin_call_level=0,
                force_close_level=0
            )
        
        # 卖方保证金计算（SPAN方法简化版）
        # 保证金 = 权利金 + Max(基础保证金, 风险保证金)
        
        contract_multiplier = 10000
        
        # 基础保证金
        base_margin = premium * contract_multiplier * quantity
        
        # 风险保证金（考虑波动率和标的价格）
        if option_type == 'call':
            # Call卖方风险保证金
            risk_margin = S * contract_multiplier * quantity * 0.15
            # OTM调整
            if K > S:
                otm_amount = (K - S) / S
                risk_margin *= max(0.1, 1 - otm_amount)
        else:
            # Put卖方风险保证金
            risk_margin = K * contract_multiplier * quantity * 0.15
            # OTM调整
            if K < S:
                otm_amount = (S - K) / S
                risk_margin *= max(0.1, 1 - otm_amount)
        
        initial_margin = (base_margin + risk_margin) * 1.2  # 加20%缓冲
        maintenance_margin = initial_margin * 0.8
        
        return MarginRequirement(
            initial_margin=round(initial_margin, 2),
            maintenance_margin=round(maintenance_margin, 2),
            margin_call_level=round(maintenance_margin * 1.1, 2),  # 110%
            force_close_level=round(maintenance_margin * 0.9, 2)   # 90%
        )
    
    @staticmethod
    def calculate_portfolio_margin(
        positions: List[Dict],
        prices: Dict[str, float]
    ) -> MarginRequirement:
        """
        计算组合保证金
        
        Args:
            positions: 持仓列表
            prices: 价格字典
            
        Returns:
            组合保证金要求
        """
        total_initial = 0
        total_maintenance = 0
        
        for pos in positions:
            code = pos.get('productCode')
            S = prices.get(code, pos.get('price', 0))
            K = pos.get('strikePrice', S)
            quantity = pos.get('quantity', 0)
            option_type = pos.get('optionType', 'call')
            position_type = pos.get('positionType', 'long')
            premium = pos.get('premium', 0)
            
            margin = MarginCalculator.calculate_option_margin(
                option_type=option_type,
                position_type=position_type,
                S=S,
                K=K,
                premium=premium,
                quantity=quantity
            )
            
            total_initial += margin.initial_margin
            total_maintenance += margin.maintenance_margin
        
        return MarginRequirement(
            initial_margin=total_initial,
            maintenance_margin=total_maintenance,
            margin_call_level=total_maintenance * 1.1,
            force_close_level=total_maintenance * 0.9
        )


class RiskMonitor:
    """
    风险监控器
    """
    
    def __init__(self, db=None, cloud_client=None):
        self.db = db
        self.cloud_client = cloud_client
    
    def calculate_var(
        self,
        returns: List[float],
        confidence: float = 0.95
    ) -> float:
        """
        计算VaR（历史模拟法）
        
        Args:
            returns: 收益率序列
            confidence: 置信水平
            
        Returns:
            VaR值
        """
        if not returns:
            return 0
        
        returns_array = np.array(returns)
        var = np.percentile(returns_array, (1 - confidence) * 100)
        return abs(var)
    
    def calculate_max_drawdown(self, values: List[float]) -> float:
        """
        计算最大回撤
        
        Args:
            values: 净值序列
            
        Returns:
            最大回撤率
        """
        if not values:
            return 0
        
        values_array = np.array(values)
        cummax = np.maximum.accumulate(values_array)
        drawdowns = (cummax - values_array) / cummax
        return np.max(drawdowns)
    
    def calculate_portfolio_risk(
        self,
        positions: List[Dict],
        prices: Dict[str, float],
        returns_history: Dict[str, List[float]]
    ) -> RiskMetrics:
        """
        计算组合风险指标
        
        Args:
            positions: 持仓列表
            prices: 价格字典
            returns_history: 历史收益率
            
        Returns:
            风险指标
        """
        # 计算组合收益率序列
        portfolio_returns = []
        
        # 计算组合Greeks
        total_delta = 0
        total_gamma = 0
        total_vega = 0
        total_theta = 0
        
        for pos in positions:
            code = pos.get('productCode')
            quantity = pos.get('quantity', 0)
            
            # 累加Greeks
            delta = pos.get('delta', 0) * quantity
            gamma = pos.get('gamma', 0) * quantity
            vega = pos.get('vega', 0) * quantity
            theta = pos.get('theta', 0) * quantity
            
            total_delta += delta
            total_gamma += gamma
            total_vega += vega
            total_theta += theta
        
        # 计算VaR
        all_returns = []
        for code, returns in returns_history.items():
            all_returns.extend(returns)
        
        var_95 = self.calculate_var(all_returns, 0.95)
        var_99 = self.calculate_var(all_returns, 0.99)
        
        return RiskMetrics(
            var_95=var_95,
            var_99=var_99,
            max_drawdown=0,  # 需要净值序列
            sharpe_ratio=0,  # 需要无风险利率
            beta=0,
            delta=total_delta,
            gamma=total_gamma,
            vega=total_vega,
            theta=total_theta
        )
    
    def check_margin_call(
        self,
        account_balance: float,
        margin_requirement: MarginRequirement
    ) -> Tuple[bool, RiskLevel]:
        """
        检查是否触发追保
        
        Args:
            account_balance: 账户余额
            margin_requirement: 保证金要求
            
        Returns:
            (是否追保, 风险等级)
        """
        if account_balance <= margin_requirement.force_close_level:
            return True, RiskLevel.CRITICAL
        elif account_balance <= margin_requirement.margin_call_level:
            return True, RiskLevel.HIGH
        elif account_balance <= margin_requirement.maintenance_margin:
            return True, RiskLevel.MEDIUM
        else:
            return False, RiskLevel.LOW
    
    def get_force_close_list(
        self,
        positions: List[Dict],
        account_balance: float,
        prices: Dict[str, float]
    ) -> List[Dict]:
        """
        获取需要强平的持仓列表
        
        Args:
            positions: 持仓列表
            account_balance: 账户余额
            prices: 价格字典
            
        Returns:
            需要平仓的持仓列表
        """
        margin = MarginCalculator.calculate_portfolio_margin(positions, prices)
        
        if account_balance >= margin.force_close_level:
            return []
        
        # 计算需要平仓的金额
        shortfall = margin.force_close_level - account_balance
        
        # 按风险排序（高风险优先平仓）
        sorted_positions = sorted(
            positions,
            key=lambda p: abs(p.get('delta', 0) * p.get('quantity', 0)),
            reverse=True
        )
        
        to_close = []
        closed_value = 0
        
        for pos in sorted_positions:
            if closed_value >= shortfall:
                break
            
            market_value = abs(
                pos.get('quantity', 0) * 
                pos.get('price', 0) * 
                10000  # 合约乘数
            )
            
            to_close.append({
                'position_id': pos.get('_id'),
                'productCode': pos.get('productCode'),
                'quantity': pos.get('quantity'),
                'market_value': market_value,
                'reason': 'margin_call'
            })
            
            closed_value += market_value
        
        return to_close


class ForceCloseEngine:
    """
    强制平仓引擎
    """
    
    def __init__(self, db=None, cloud_client=None, notification_service=None):
        self.db = db
        self.cloud_client = cloud_client
        self.notification_service = notification_service
        self.risk_monitor = RiskMonitor(db, cloud_client)
    
    def check_and_force_close(
        self,
        user_id: str,
        positions: List[Dict],
        account_balance: float,
        prices: Dict[str, float]
    ) -> Dict:
        """
        检查并执行强平
        
        Args:
            user_id: 用户ID
            positions: 持仓列表
            account_balance: 账户余额
            prices: 价格字典
            
        Returns:
            执行结果
        """
        margin = MarginCalculator.calculate_portfolio_margin(positions, prices)
        is_margin_call, risk_level = self.risk_monitor.check_margin_call(
            account_balance, margin
        )
        
        result = {
            'user_id': user_id,
            'risk_level': risk_level.value,
            'margin_call': is_margin_call,
            'force_close_executed': False,
            'closed_positions': [],
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if risk_level == RiskLevel.CRITICAL:
            # 执行强平
            to_close = self.risk_monitor.get_force_close_list(
                positions, account_balance, prices
            )
            
            for pos in to_close:
                close_result = self._execute_close(user_id, pos)
                result['closed_positions'].append(close_result)
            
            result['force_close_executed'] = True
            
            # 发送通知
            if self.notification_service:
                self.notification_service.send_notification(
                    user_id=user_id,
                    title='强制平仓通知',
                    content=f'由于保证金不足，系统已执行强制平仓。平仓数量：{len(result["closed_positions"])}笔',
                    channel='inapp'
                )
        
        elif risk_level == RiskLevel.HIGH:
            # 发送追保通知
            if self.notification_service:
                margin_shortfall = margin.margin_call_level - account_balance
                self.notification_service.send_notification(
                    user_id=user_id,
                    title='追加保证金通知',
                    content=f'您的账户保证金不足，请及时追加保证金。需追加金额：{margin_shortfall:.2f}元',
                    channel='inapp'
                )
        
        return result
    
    def _execute_close(self, user_id: str, position: Dict) -> Dict:
        """执行平仓"""
        # 这里实现实际的平仓逻辑
        logger.warning(f"执行强制平仓: user={user_id}, position={position}")
        
        return {
            'position_id': position.get('position_id'),
            'productCode': position.get('productCode'),
            'quantity': position.get('quantity'),
            'status': 'closed',
            'close_time': datetime.utcnow().isoformat()
        }


class RiskControlService:
    """
    风险控制服务
    
    整合保证金、风控、强平功能
    """
    
    def __init__(self, db=None, cloud_client=None, notification_service=None):
        self.margin_calculator = MarginCalculator()
        self.risk_monitor = RiskMonitor(db, cloud_client)
        self.force_close_engine = ForceCloseEngine(db, cloud_client, notification_service)
    
    def pre_trade_risk_check(
        self,
        user_id: str,
        trade_amount: float,
        account_balance: float,
        existing_positions: List[Dict]
    ) -> Tuple[bool, str]:
        """
        交易前风控检查
        
        Args:
            user_id: 用户ID
            trade_amount: 交易金额
            account_balance: 账户余额
            existing_positions: 现有持仓
            
        Returns:
            (是否通过, 原因)
        """
        # 检查余额
        if account_balance < trade_amount:
            return False, "账户余额不足"
        
        # 检查单笔限额
        max_single_trade = 1000000  # 100万
        if trade_amount > max_single_trade:
            return False, f"单笔交易金额不能超过{max_single_trade}"
        
        # 检查持仓集中度
        # ... 其他风控规则
        
        return True, "风控检查通过"
    
    def get_user_risk_summary(
        self,
        user_id: str,
        positions: List[Dict],
        account_balance: float,
        prices: Dict[str, float]
    ) -> Dict:
        """
        获取用户风险概览
        
        Args:
            user_id: 用户ID
            positions: 持仓列表
            account_balance: 账户余额
            prices: 价格字典
            
        Returns:
            风险概览
        """
        margin = self.margin_calculator.calculate_portfolio_margin(positions, prices)
        
        is_margin_call, risk_level = self.risk_monitor.check_margin_call(
            account_balance, margin
        )
        
        total_market_value = sum(
            abs(p.get('quantity', 0) * prices.get(p.get('productCode', ''), 0) * 10000)
            for p in positions
        )
        
        return {
            'user_id': user_id,
            'account_balance': account_balance,
            'total_market_value': total_market_value,
            'initial_margin': margin.initial_margin,
            'maintenance_margin': margin.maintenance_margin,
            'margin_ratio': account_balance / margin.maintenance_margin if margin.maintenance_margin > 0 else float('inf'),
            'risk_level': risk_level.value,
            'margin_call': is_margin_call,
            'available_margin': account_balance - margin.initial_margin,
            'timestamp': datetime.utcnow().isoformat()
        }


# 导出
__all__ = [
    'RiskLevel',
    'MarginType',
    'MarginRequirement',
    'RiskMetrics',
    'MarginCalculator',
    'RiskMonitor',
    'ForceCloseEngine',
    'RiskControlService'
]