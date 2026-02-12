import math
# from scipy.stats import norm  # 云托管环境暂不需要
import logging

logger = logging.getLogger(__name__)

# 简单的正态分布近似函数（云托管环境使用）
def _approx_cdf(x):
    """标准正态分布CDF近似（使用误差函数近似）"""
    # 使用简单的sigmoid近似
    return 1.0 / (1.0 + math.exp(-1.702 * x))

def _approx_pdf(x):
    """标准正态分布PDF近似"""
    return math.exp(-0.5 * x * x) / math.sqrt(2 * math.pi)

class RiskService:
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
            
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
        d2 = d1 - sigma * math.sqrt(T)
        
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

    def check_pre_trade_risk(self, user_id, amount, current_balance):
        """
        Check if user has enough balance and risk limit.
        """
        if amount > current_balance:
            return False, "余额不足"
        # Add more checks: daily limit, position limit etc.
        return True, "Passed"
