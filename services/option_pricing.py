# -*- coding: utf-8 -*-
"""
期权定价引擎
支持多种定价模型：Black-Scholes-Merton, 二叉树, Monte Carlo
"""

import math
import numpy as np
from scipy import stats
from typing import Dict, Tuple, Optional, Literal
from dataclasses import dataclass
from enum import Enum


class OptionType(Enum):
    """期权类型"""
    CALL = 'call'
    PUT = 'put'


class ExerciseStyle(Enum):
    """行权方式"""
    EUROPEAN = 'european'
    AMERICAN = 'american'


@dataclass
class OptionParameters:
    """期权参数"""
    S: float  # 标的价格
    K: float  # 行权价
    T: float  # 到期时间（年）
    r: float  # 无风险利率
    sigma: float  # 波动率
    q: float = 0.0  # 股息率
    option_type: OptionType = OptionType.CALL
    exercise_style: ExerciseStyle = ExerciseStyle.EUROPEAN


@dataclass
class Greeks:
    """Greeks风险指标"""
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


class BlackScholesModel:
    """
    Black-Scholes-Merton 期权定价模型
    
    适用于欧式期权的解析解
    """
    
    @staticmethod
    def _d1(S: float, K: float, T: float, r: float, sigma: float, q: float = 0) -> float:
        """计算 d1"""
        if T <= 0:
            return 0
        d1 = (math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        return d1
    
    @staticmethod
    def _d2(S: float, K: float, T: float, r: float, sigma: float, q: float = 0) -> float:
        """计算 d2"""
        if T <= 0:
            return 0
        d1 = BlackScholesModel._d1(S, K, T, r, sigma, q)
        d2 = d1 - sigma * math.sqrt(T)
        return d2
    
    @staticmethod
    def price(params: OptionParameters) -> float:
        """
        计算期权价格
        
        Args:
            params: 期权参数
            
        Returns:
            期权价格
        """
        S, K, T, r, sigma, q = params.S, params.K, params.T, params.r, params.sigma, params.q
        
        if T <= 0:
            # 到期 payoff
            if params.option_type == OptionType.CALL:
                return max(S - K, 0)
            else:
                return max(K - S, 0)
        
        d1 = BlackScholesModel._d1(S, K, T, r, sigma, q)
        d2 = BlackScholesModel._d2(S, K, T, r, sigma, q)
        
        N = stats.norm.cdf
        
        if params.option_type == OptionType.CALL:
            price = S * math.exp(-q * T) * N(d1) - K * math.exp(-r * T) * N(d2)
        else:
            price = K * math.exp(-r * T) * N(-d2) - S * math.exp(-q * T) * N(-d1)
        
        return max(price, 0)
    
    @staticmethod
    def greeks(params: OptionParameters) -> Greeks:
        """
        计算Greeks风险指标
        
        Args:
            params: 期权参数
            
        Returns:
            Greeks对象
        """
        S, K, T, r, sigma, q = params.S, params.K, params.T, params.r, params.sigma, params.q
        
        if T <= 0:
            return Greeks(delta=0, gamma=0, theta=0, vega=0, rho=0)
        
        d1 = BlackScholesModel._d1(S, K, T, r, sigma, q)
        d2 = BlackScholesModel._d2(S, K, T, r, sigma, q)
        
        N = stats.norm.cdf
        n = stats.norm.pdf
        
        sqrt_T = math.sqrt(T)
        exp_rT = math.exp(-r * T)
        exp_qT = math.exp(-q * T)
        
        # Delta
        if params.option_type == OptionType.CALL:
            delta = exp_qT * N(d1)
        else:
            delta = exp_qT * (N(d1) - 1)
        
        # Gamma
        gamma = exp_qT * n(d1) / (S * sigma * sqrt_T)
        
        # Theta (per day)
        if params.option_type == OptionType.CALL:
            theta = (-S * exp_qT * n(d1) * sigma / (2 * sqrt_T) 
                    - r * K * exp_rT * N(d2)
                    + q * S * exp_qT * N(d1)) / 365
        else:
            theta = (-S * exp_qT * n(d1) * sigma / (2 * sqrt_T) 
                    + r * K * exp_rT * N(-d2)
                    - q * S * exp_qT * N(-d1)) / 365
        
        # Vega (per 1% change in volatility)
        vega = S * exp_qT * n(d1) * sqrt_T / 100
        
        # Rho (per 1% change in rate)
        if params.option_type == OptionType.CALL:
            rho = K * T * exp_rT * N(d2) / 100
        else:
            rho = -K * T * exp_rT * N(-d2) / 100
        
        return Greeks(
            delta=round(delta, 6),
            gamma=round(gamma, 6),
            theta=round(theta, 6),
            vega=round(vega, 6),
            rho=round(rho, 6)
        )
    
    @staticmethod
    def implied_volatility(
        price: float,
        S: float,
        K: float,
        T: float,
        r: float,
        option_type: str = 'call',
        q: float = 0,
        max_iterations: int = 100,
        tolerance: float = 1e-6
    ) -> Optional[float]:
        """
        计算隐含波动率（牛顿迭代法）
        
        Args:
            price: 期权市场价格
            S: 标的价格
            K: 行权价
            T: 到期时间
            r: 无风险利率
            option_type: 期权类型
            q: 股息率
            max_iterations: 最大迭代次数
            tolerance: 容差
            
        Returns:
            隐含波动率
        """
        if T <= 0 or price <= 0:
            return None
        
        # 初始猜测
        sigma = 0.3
        
        opt_type = OptionType.CALL if option_type == 'call' else OptionType.PUT
        
        for _ in range(max_iterations):
            params = OptionParameters(S, K, T, r, sigma, q, opt_type)
            model_price = BlackScholesModel.price(params)
            
            diff = model_price - price
            
            if abs(diff) < tolerance:
                return sigma
            
            # Vega
            greeks = BlackScholesModel.greeks(params)
            vega = greeks.vega * 100  # 转换回原始vega
            
            if vega < 1e-10:
                break
            
            # 牛顿迭代
            sigma = sigma - diff / vega
            
            # 限制范围
            sigma = max(0.001, min(sigma, 5.0))
        
        return sigma


class BinomialTreeModel:
    """
    二叉树期权定价模型
    
    适用于美式期权和奇异期权
    """
    
    @staticmethod
    def price(
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = 'call',
        exercise_style: str = 'american',
        steps: int = 100,
        q: float = 0
    ) -> float:
        """
        二叉树定价
        
        Args:
            S: 标的价格
            K: 行权价
            T: 到期时间
            r: 无风险利率
            sigma: 波动率
            option_type: 期权类型 (call/put)
            exercise_style: 行权方式 (european/american)
            steps: 时间步数
            q: 股息率
            
        Returns:
            期权价格
        """
        if T <= 0:
            if option_type == 'call':
                return max(S - K, 0)
            else:
                return max(K - S, 0)
        
        dt = T / steps
        u = math.exp(sigma * math.sqrt(dt))
        d = 1 / u
        p = (math.exp((r - q) * dt) - d) / (u - d)
        
        # 构建终值
        prices = np.zeros(steps + 1)
        for i in range(steps + 1):
            ST = S * (u ** (steps - i)) * (d ** i)
            if option_type == 'call':
                prices[i] = max(ST - K, 0)
            else:
                prices[i] = max(K - ST, 0)
        
        # 回溯
        discount = math.exp(-r * dt)
        is_american = exercise_style == 'american'
        
        for j in range(steps - 1, -1, -1):
            for i in range(j + 1):
                prices[i] = (p * prices[i] + (1 - p) * prices[i + 1]) * discount
                
                if is_american:
                    ST = S * (u ** (j - i)) * (d ** i)
                    if option_type == 'call':
                        prices[i] = max(prices[i], ST - K)
                    else:
                        prices[i] = max(prices[i], K - ST)
        
        return max(prices[0], 0)


class MonteCarloModel:
    """
    蒙特卡洛模拟定价
    
    适用于路径依赖期权
    """
    
    @staticmethod
    def price(
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = 'call',
        simulations: int = 10000,
        q: float = 0
    ) -> Tuple[float, float]:
        """
        蒙特卡洛定价
        
        Args:
            S: 标的价格
            K: 行权价
            T: 到期时间
            r: 无风险利率
            sigma: 波动率
            option_type: 期权类型
            simulations: 模拟次数
            q: 股息率
            
        Returns:
            (期权价格, 标准误差)
        """
        if T <= 0:
            if option_type == 'call':
                return max(S - K, 0), 0
            else:
                return max(K - S, 0), 0
        
        # 生成随机数
        Z = np.random.standard_normal(simulations)
        
        # 模拟终值
        drift = (r - q - 0.5 * sigma ** 2) * T
        diffusion = sigma * math.sqrt(T)
        ST = S * np.exp(drift + diffusion * Z)
        
        # 计算 payoff
        if option_type == 'call':
            payoffs = np.maximum(ST - K, 0)
        else:
            payoffs = np.maximum(K - ST, 0)
        
        # 折现
        price = math.exp(-r * T) * np.mean(payoffs)
        std_error = math.exp(-r * T) * np.std(payoffs) / math.sqrt(simulations)
        
        return price, std_error


class OptionPricingEngine:
    """
    期权定价引擎
    
    统一接口，自动选择合适的定价模型
    """
    
    @staticmethod
    def price(
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = 'call',
        exercise_style: str = 'european',
        q: float = 0,
        model: str = 'auto'
    ) -> Dict:
        """
        计算期权价格和Greeks
        
        Args:
            S: 标的价格
            K: 行权价
            T: 到期时间（年）
            r: 无风险利率
            sigma: 波动率
            option_type: 期权类型 (call/put)
            exercise_style: 行权方式 (european/american)
            q: 股息率
            model: 定价模型 (auto/bsm/binomial/mc)
            
        Returns:
            包含价格和Greeks的字典
        """
        params = OptionParameters(
            S=S, K=K, T=T, r=r, sigma=sigma, q=q,
            option_type=OptionType.CALL if option_type == 'call' else OptionType.PUT,
            exercise_style=ExerciseStyle.EUROPEAN if exercise_style == 'european' else ExerciseStyle.AMERICAN
        )
        
        # 选择模型
        if model == 'auto':
            if exercise_style == 'american':
                model = 'binomial'
            else:
                model = 'bsm'
        
        # 计算价格
        if model == 'bsm':
            price = BlackScholesModel.price(params)
            greeks = BlackScholesModel.greeks(params)
        elif model == 'binomial':
            price = BinomialTreeModel.price(
                S, K, T, r, sigma, option_type, exercise_style, q=q
            )
            # 对于二叉树，Greeks用BSM近似
            greeks = BlackScholesModel.greeks(params)
        elif model == 'mc':
            price, std_error = MonteCarloModel.price(
                S, K, T, r, sigma, option_type, q=q
            )
            greeks = BlackScholesModel.greeks(params)
        else:
            raise ValueError(f"未知的定价模型: {model}")
        
        return {
            'price': round(price, 4),
            'delta': greeks.delta,
            'gamma': greeks.gamma,
            'theta': greeks.theta,
            'vega': greeks.vega,
            'rho': greeks.rho,
            'model': model
        }
    
    @staticmethod
    def implied_volatility(
        price: float,
        S: float,
        K: float,
        T: float,
        r: float,
        option_type: str = 'call',
        q: float = 0
    ) -> Optional[float]:
        """
        计算隐含波动率
        
        Returns:
            隐含波动率（年化）
        """
        return BlackScholesModel.implied_volatility(
            price, S, K, T, r, option_type, q
        )


# 导出
__all__ = [
    'OptionType',
    'ExerciseStyle', 
    'OptionParameters',
    'Greeks',
    'BlackScholesModel',
    'BinomialTreeModel',
    'MonteCarloModel',
    'OptionPricingEngine'
]