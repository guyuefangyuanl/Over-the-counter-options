# -*- coding: utf-8 -*-
"""
批量期权报价服务
提供批量获取期权报价的能力，基于Black-Scholes模型计算
"""

import logging
import time
from typing import List, Dict, Any, Optional
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from services.option_pricing import (
    BlackScholesModel,
    OptionParameters,
    OptionType,
    Greeks
)

logger = logging.getLogger(__name__)


class BatchQuoteService:
    """批量期权报价服务"""
    
    # 缓存配置
    _cache = {}
    _cache_ttl_trading = 300  # 交易时段缓存5分钟
    _cache_ttl_non_trading = 1800  # 非交易时段缓存30分钟
    
    # 默认参数
    DEFAULT_RISK_FREE_RATE = 0.03  # 无风险利率 3%
    DEFAULT_DIVIDEND_YIELD = 0.0   # 股息率 0%
    DEFAULT_VOLATILITY = 0.30      # 默认波动率 30%
    
    # 期限映射（天数）
    TERM_TO_DAYS = {
        '2W': 14,
        '1M': 30,
        '2M': 60,
        '3M': 90,
        '6M': 180,
        '9M': 270,
        '1Y': 365,
        '2Y': 730,
        '12M': 365
    }
    
    def __init__(self):
        self.pricing_model = BlackScholesModel()
    
    def get_batch_quotes(
        self,
        stock_codes: List[str],
        term: str = '1M',
        option_type: str = 'call',
        structure: str = 'vanilla',
        stock_prices: Optional[Dict[str, float]] = None
    ) -> Dict[str, Any]:
        """
        批量获取期权报价
        
        Args:
            stock_codes: 股票代码列表（最多50个）
            term: 期限，如 '1M', '3M', '6M'
            option_type: 期权类型，'call' 或 'put'
            structure: 结构类型，'vanilla', 'snowball' 等
            stock_prices: 股票当前价格映射（可选，如未提供则使用模拟价格）
            
        Returns:
            包含批量报价结果的字典
        """
        start_time = time.time()
        
        # 参数验证
        if not stock_codes:
            return {
                'quotes': [],
                'term': term,
                'optionType': option_type,
                'modelUsed': 'black_scholes',
                'error': '股票代码列表不能为空'
            }
        
        if len(stock_codes) > 50:
            return {
                'quotes': [],
                'term': term,
                'optionType': option_type,
                'modelUsed': 'black_scholes',
                'error': '股票代码数量超过限制（最多50个）'
            }
        
        # 检查缓存
        cache_key = self._build_cache_key(stock_codes, term, option_type)
        cached = self._get_from_cache(cache_key)
        if cached:
            logger.info(f"[批量报价] 缓存命中: {len(stock_codes)} 个股票")
            return cached
        
        # 转换期限
        days = self._term_to_days(term)
        T = days / 365.0  # 年化
        
        # 批量计算期权报价（并发）
        quotes = []
        max_workers = min(10, len(stock_codes))
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # 提交所有计算任务
            future_to_code = {
                executor.submit(
                    self._calculate_single_quote,
                    code,
                    stock_prices.get(code) if stock_prices else None,
                    T,
                    option_type
                ): code
                for code in stock_codes
            }
            
            # 收集结果
            for future in as_completed(future_to_code, timeout=30):
                code = future_to_code[future]
                try:
                    result = future.result(timeout=5)
                    if result:
                        quotes.append(result)
                except Exception as e:
                    logger.warning(f"[批量报价] 计算失败 {code}: {e}")
                    # 添加失败占位
                    quotes.append(self._create_error_quote(code, str(e)))
        
        # 构建响应
        result = {
            'quotes': quotes,
            'term': term,
            'optionType': option_type,
            'modelUsed': 'black_scholes',
            'updateTime': datetime.utcnow().isoformat() + 'Z',
            'totalCount': len(quotes),
            'successCount': sum(1 for q in quotes if 'error' not in q)
        }
        
        # 更新缓存
        self._set_cache(cache_key, result)
        
        elapsed = (time.time() - start_time) * 1000
        logger.info(f"[批量报价] 完成: {len(quotes)}/{len(stock_codes)} 个, 耗时 {elapsed:.2f}ms")
        
        return result
    
    def _calculate_single_quote(
        self,
        stock_code: str,
        spot_price: Optional[float],
        T: float,
        option_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        计算单个股票的期权报价
        
        Args:
            stock_code: 股票代码
            spot_price: 当前价格（如为None则使用模拟价格）
            T: 年化期限
            option_type: 期权类型
            
        Returns:
            单个股票的期权报价字典
        """
        try:
            # 如果没有提供价格，使用模拟价格（100元作为基准）
            if spot_price is None or spot_price <= 0:
                spot_price = self._get_simulated_price(stock_code)
            
            # 获取波动率（实际应从历史数据或数据库获取）
            sigma = self._get_volatility(stock_code)
            
            # 计算三个执行价水平的期权费
            strike_ratios = {
                'atm': 1.00,    # 平值
                'otm105': 1.05,  # 虚值 105%
                'otm110': 1.10   # 虚值 110%
            }
            
            quotes_by_strike = {}
            greeks_result = None
            
            for strike_name, strike_ratio in strike_ratios.items():
                K = spot_price * strike_ratio
                
                # 构建期权参数
                opt_type = OptionType.CALL if option_type == 'call' else OptionType.PUT
                params = OptionParameters(
                    S=spot_price,
                    K=K,
                    T=T,
                    r=self.DEFAULT_RISK_FREE_RATE,
                    sigma=sigma,
                    q=self.DEFAULT_DIVIDEND_YIELD,
                    option_type=opt_type
                )
                
                # 计算期权价格
                premium = self.pricing_model.price(params)
                premium_percent = (premium / spot_price) * 100
                
                quotes_by_strike[strike_name] = {
                    'strikeRatio': round(strike_ratio * 100, 1),
                    'premium': round(premium, 4),
                    'premiumPercent': round(premium_percent, 2)
                }
                
                # 只计算一次 Greeks（使用 ATM）
                if strike_name == 'atm':
                    greeks = self.pricing_model.greeks(params)
                    greeks_result = {
                        'delta': round(greeks.delta, 4),
                        'gamma': round(greeks.gamma, 6),
                        'theta': round(greeks.theta, 4),
                        'vega': round(greeks.vega, 4),
                        'rho': round(greeks.rho, 4)
                    }
            
            # 获取股票名称（简化处理）
            stock_name = self._get_stock_name(stock_code)
            
            return {
                'stockCode': stock_code,
                'stockName': stock_name,
                'price': round(spot_price, 2),
                'atm': quotes_by_strike['atm'],
                'otm105': quotes_by_strike['otm105'],
                'otm110': quotes_by_strike['otm110'],
                'greeks': greeks_result,
                'volatility': round(sigma, 4),
                'updateTime': datetime.utcnow().isoformat() + 'Z'
            }
            
        except Exception as e:
            logger.error(f"[批量报价] 计算失败 {stock_code}: {e}")
            return self._create_error_quote(stock_code, str(e))
    
    def _get_simulated_price(self, stock_code: str) -> float:
        """
        获取模拟价格（当无法获取真实价格时使用）
        
        实际生产环境应替换为真实行情接口
        """
        # 基于股票代码生成一个相对稳定的价格（仅用于演示）
        import hashlib
        hash_val = int(hashlib.md5(stock_code.encode()).hexdigest()[:8], 16)
        # 生成 10-500 之间的价格
        base_price = 10 + (hash_val % 490)
        # 加上一些随机波动
        import random
        fluctuation = random.uniform(-0.05, 0.05)  # ±5% 波动
        return round(base_price * (1 + fluctuation), 2)
    
    def _get_volatility(self, stock_code: str) -> float:
        """
        获取股票波动率
        
        实际生产环境应从历史数据或数据库获取
        当前返回默认波动率
        """
        # 可以根据股票特性返回不同的波动率
        # 例如：科技股波动率较高，蓝筹股波动率较低
        return self.DEFAULT_VOLATILITY
    
    def _get_stock_name(self, stock_code: str) -> str:
        """
        获取股票名称
        
        实际生产环境应从数据库获取
        """
        # 简化处理：返回股票代码作为名称
        return stock_code.split('.')[0]
    
    def _term_to_days(self, term: str) -> int:
        """将期限字符串转换为天数"""
        return self.TERM_TO_DAYS.get(term.upper(), 30)
    
    def _create_error_quote(self, stock_code: str, error_msg: str) -> Dict[str, Any]:
        """创建错误报价占位"""
        return {
            'stockCode': stock_code,
            'stockName': self._get_stock_name(stock_code),
            'error': error_msg,
            'atm': None,
            'otm105': None,
            'otm110': None
        }
    
    def _build_cache_key(self, stock_codes: List[str], term: str, option_type: str) -> str:
        """构建缓存键"""
        sorted_codes = sorted(stock_codes)
        return f"batch_quote:{','.join(sorted_codes[:10])}:{term}:{option_type}"
    
    def _get_from_cache(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """从缓存获取数据"""
        if cache_key in self._cache:
            timestamp, data = self._cache[cache_key]
            ttl = self._get_cache_ttl()
            if time.time() - timestamp < ttl:
                data['cacheHit'] = True
                return data
            else:
                # 缓存过期，删除
                del self._cache[cache_key]
        return None
    
    def _set_cache(self, cache_key: str, data: Dict[str, Any]) -> None:
        """设置缓存"""
        data['cacheHit'] = False
        self._cache[cache_key] = (time.time(), data)
        
        # 清理过期缓存
        self._cleanup_cache()
    
    def _get_cache_ttl(self) -> int:
        """获取当前缓存有效期（秒）"""
        now = datetime.now()
        hour = now.hour
        
        # 简化判断：工作日 9:30-15:00 为交易时段
        if 9 <= hour < 15:
            return self._cache_ttl_trading
        else:
            return self._cache_ttl_non_trading
    
    def _cleanup_cache(self) -> None:
        """清理过期缓存"""
        if len(self._cache) > 100:
            ttl = self._get_cache_ttl()
            now = time.time()
            expired_keys = [
                k for k, (t, _) in self._cache.items()
                if now - t > ttl
            ]
            for k in expired_keys:
                del self._cache[k]
            
            if expired_keys:
                logger.info(f"[批量报价] 清理 {len(expired_keys)} 个过期缓存")


# 单例实例
_batch_quote_service = None

def get_batch_quote_service() -> BatchQuoteService:
    """获取批量报价服务单例"""
    global _batch_quote_service
    if _batch_quote_service is None:
        _batch_quote_service = BatchQuoteService()
    return _batch_quote_service