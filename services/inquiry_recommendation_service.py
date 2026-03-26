"""
询价智能推荐服务

提供智能化的询价参数推荐，包括：
- 智能执行价推荐
- 期限智能建议
- 策略类型推荐
- 交易商智能匹配
- 市场情绪分析
- 价格范围估算
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple
from flask import current_app

logger = logging.getLogger(__name__)


class InquiryRecommendationService:
    """询价智能推荐服务"""

    # 默认期限选项
    DEFAULT_TERMS = ['1M', '2M', '3M', '6M', '9M', '1Y']

    # 策略类型配置
    STRATEGY_TYPES = {
        'vanilla': {
            'name': '香草期权',
            'description': '传统看涨看跌期权',
            'risk_level': 'low',
            'complexity': 1,
            'suitable_for': ['hedging', 'speculation']
        },
        'snowball': {
            'name': '雪球期权',
            'description': '收益增强型结构化产品',
            'risk_level': 'medium',
            'complexity': 3,
            'suitable_for': ['yield_enhancement', 'range_bound']
        },
        'barrier': {
            'name': '障碍期权',
            'description': '成本优化的对冲工具',
            'risk_level': 'medium',
            'complexity': 2,
            'suitable_for': ['cost_reduction', 'hedging']
        },
        'phoenix': {
            'name': '凤凰期权',
            'description': '多观察期的收益增强产品',
            'risk_level': 'medium',
            'complexity': 3,
            'suitable_for': ['yield_enhancement']
        }
    }

    # 交易商评级
    DEALER_RATINGS = {
        'CICC': {'rating': 5, 'specialty': ['equity', 'commodity'], 'response_time': 30},
        'CITIC': {'rating': 5, 'specialty': ['equity', 'index'], 'response_time': 25},
        'HUATAI': {'rating': 4, 'specialty': ['equity'], 'response_time': 35},
        'GALAXY': {'rating': 4, 'specialty': ['futures'], 'response_time': 40},
        'GUOTAI': {'rating': 4, 'specialty': ['equity', 'index'], 'response_time': 30},
    }

    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 5分钟缓存

    def recommend_strike_price(
        self,
        current_price: float,
        option_type: str = 'call',
        volatility: float = None,
        term: str = '1M'
    ) -> Dict[str, Any]:
        """
        智能推荐执行价格范围

        Args:
            current_price: 当前股价
            option_type: 期权类型 (call/put)
            volatility: 波动率（可选）
            term: 期限

        Returns:
            推荐的执行价格信息
        """
        # 默认波动率假设
        if volatility is None:
            volatility = 0.25  # 25% 年化波动率

        # 根据期限调整时间因子
        term_days = self._parse_term_to_days(term)
        time_factor = math.sqrt(term_days / 365)

        # 基于波动率计算合理范围
        price_range = current_price * volatility * time_factor

        if option_type == 'call':
            # 看涨期权：推荐执行价略高于现价
            atm_strike = round(current_price / current_price * 100, 1)  # 100%
            otm_low = round((current_price - price_range * 0.5) / current_price * 100, 1)
            otm_high = round((current_price + price_range) / current_price * 100, 1)
            recommended = round((current_price + price_range * 0.3) / current_price * 100, 1)
        else:
            # 看跌期权：推荐执行价略低于现价
            atm_strike = round(current_price / current_price * 100, 1)
            otm_low = round((current_price - price_range) / current_price * 100, 1)
            otm_high = round((current_price + price_range * 0.5) / current_price * 100, 1)
            recommended = round((current_price - price_range * 0.3) / current_price * 100, 1)

        return {
            'currentPrice': current_price,
            'atmStrike': atm_strike,  # 平值
            'recommendedStrike': max(50, min(200, recommended)),  # 推荐值
            'range': {
                'low': max(50, otm_low),
                'high': min(200, otm_high)
            },
            'suggestions': [
                {'value': max(50, otm_low), 'label': '虚值', 'type': 'otm'},
                {'value': atm_strike, 'label': '平值', 'type': 'atm'},
                {'value': min(200, otm_high), 'label': '实值', 'type': 'itm'},
            ],
            'reason': f'基于{volatility*100:.0f}%年化波动率和{term}期限计算'
        }

    def recommend_term(
        self,
        investment_horizon: str = 'medium',
        market_view: str = 'neutral',
        risk_tolerance: str = 'medium'
    ) -> Dict[str, Any]:
        """
        智能推荐期限

        Args:
            investment_horizon: 投资期限偏好 (short/medium/long)
            market_view: 市场观点 (bullish/bearish/neutral)
            risk_tolerance: 风险承受能力 (low/medium/high)

        Returns:
            推荐的期限信息
        """
        # 期限与投资期限的映射
        horizon_terms = {
            'short': ['1M', '2M'],
            'medium': ['2M', '3M', '6M'],
            'long': ['6M', '9M', '1Y']
        }

        # 获取基础推荐
        base_terms = horizon_terms.get(investment_horizon, horizon_terms['medium'])

        # 根据市场观点调整
        if market_view == 'bullish':
            # 看涨倾向较长期限
            recommended = base_terms[-1] if len(base_terms) > 1 else base_terms[0]
        elif market_view == 'bearish':
            # 看跌倾向较短期限
            recommended = base_terms[0]
        else:
            # 中性选择中间值
            recommended = base_terms[len(base_terms) // 2]

        return {
            'recommendedTerm': recommended,
            'availableTerms': self.DEFAULT_TERMS,
            'reason': self._get_term_reason(investment_horizon, market_view),
            'riskNote': self._get_term_risk_note(recommended, risk_tolerance)
        }

    def recommend_strategy(
        self,
        market_view: str,
        volatility_expectation: str,
        risk_profile: str = 'balanced'
    ) -> Dict[str, Any]:
        """
        智能推荐策略类型

        Args:
            market_view: 市场观点 (bullish/bearish/neutral/range_bound)
            volatility_expectation: 波动率预期 (high/medium/low)
            risk_profile: 风险偏好 (conservative/balanced/aggressive)

        Returns:
            推荐的策略类型
        """
        # 策略推荐矩阵
        strategy_matrix = {
            ('bullish', 'high', 'aggressive'): 'vanilla',
            ('bullish', 'medium', 'balanced'): 'vanilla',
            ('bullish', 'low', 'conservative'): 'barrier',
            ('bearish', 'high', 'aggressive'): 'vanilla',
            ('bearish', 'medium', 'balanced'): 'vanilla',
            ('bearish', 'low', 'conservative'): 'barrier',
            ('neutral', 'high', 'aggressive'): 'snowball',
            ('neutral', 'medium', 'balanced'): 'phoenix',
            ('neutral', 'low', 'conservative'): 'snowball',
            ('range_bound', 'medium', 'balanced'): 'snowball',
            ('range_bound', 'low', 'conservative'): 'snowball',
        }

        # 查找最佳匹配
        key = (market_view, volatility_expectation, risk_profile)
        recommended_strategy = strategy_matrix.get(key, 'vanilla')

        strategy_info = self.STRATEGY_TYPES.get(recommended_strategy, {})

        return {
            'recommendedStrategy': recommended_strategy,
            'strategyName': strategy_info.get('name', '香草期权'),
            'description': strategy_info.get('description', ''),
            'riskLevel': strategy_info.get('risk_level', 'low'),
            'complexity': strategy_info.get('complexity', 1),
            'reason': self._get_strategy_reason(market_view, volatility_expectation, risk_profile),
            'alternatives': self._get_alternative_strategies(market_view)
        }

    def match_dealers(
        self,
        product_type: str,
        notional_amount: float,
        urgency: str = 'normal',
        preferred_dealers: List[str] = None
    ) -> Dict[str, Any]:
        """
        智能匹配交易商

        Args:
            product_type: 产品类型 (equity/index/commodity/futures)
            notional_amount: 名义本金（万元）
            urgency: 紧急程度 (urgent/normal/relaxed)
            preferred_dealers: 首选交易商列表

        Returns:
            匹配的交易商信息
        """
        matched_dealers = []

        for dealer_name, dealer_info in self.DEALER_RATINGS.items():
            # 检查产品类型是否匹配
            specialty_match = product_type in dealer_info.get('specialty', [])

            # 计算匹配分数
            score = dealer_info.get('rating', 3) * 20  # 基础分

            if specialty_match:
                score += 20  # 专业匹配加分

            # 根据紧急程度调整响应时间权重
            if urgency == 'urgent':
                if dealer_info.get('response_time', 60) <= 30:
                    score += 15
            elif urgency == 'relaxed':
                score += 5  # 宽松条件下所有交易商都合适

            # 大额资金优先选择高评级交易商
            if notional_amount >= 5000:  # 5000万以上
                if dealer_info.get('rating', 3) >= 4:
                    score += 10

            matched_dealers.append({
                'name': dealer_name,
                'score': min(100, score),
                'rating': dealer_info.get('rating', 3),
                'specialty': dealer_info.get('specialty', []),
                'expectedResponseTime': dealer_info.get('response_time', 60),
                'recommended': score >= 80
            })

        # 按分数排序
        matched_dealers.sort(key=lambda x: x['score'], reverse=True)

        # 标记前3个为推荐
        for i, dealer in enumerate(matched_dealers[:3]):
            dealer['rank'] = i + 1

        return {
            'matchedDealers': matched_dealers[:5],  # 返回前5个
            'topRecommendation': matched_dealers[0] if matched_dealers else None,
            'reason': self._get_matching_reason(product_type, urgency, notional_amount)
        }

    def analyze_market_sentiment(
        self,
        product_code: str,
        historical_data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        分析市场情绪

        Args:
            product_code: 产品代码
            historical_data: 历史数据（可选）

        Returns:
            市场情绪分析结果
        """
        # 简化版情绪分析（实际应接入行情数据）
        # 这里使用模拟数据，实际应用中应接入真实数据源

        sentiment_score = 50  # 默认中性
        trend = 'neutral'
        confidence = 0.6

        if historical_data:
            # 基于历史数据计算简单情绪
            recent_change = historical_data.get('recent_change', 0)
            volume_ratio = historical_data.get('volume_ratio', 1)

            if recent_change > 0.02:
                sentiment_score = min(80, 50 + recent_change * 500)
                trend = 'bullish'
            elif recent_change < -0.02:
                sentiment_score = max(20, 50 + recent_change * 500)
                trend = 'bearish'

            if volume_ratio > 1.5:
                confidence = min(0.9, confidence + 0.1)

        # 情绪标签映射
        if sentiment_score >= 70:
            sentiment_label = '看涨'
        elif sentiment_score >= 55:
            sentiment_label = '偏多'
        elif sentiment_score >= 45:
            sentiment_label = '中性'
        elif sentiment_score >= 30:
            sentiment_label = '偏空'
        else:
            sentiment_label = '看跌'

        return {
            'sentimentScore': sentiment_score,
            'sentimentLabel': sentiment_label,
            'trend': trend,
            'confidence': confidence,
            'indicators': {
                'price_trend': trend,
                'volume_trend': 'normal',
                'volatility_level': 'medium'
            },
            'recommendation': self._get_sentiment_recommendation(sentiment_score, trend)
        }

    def estimate_price_range(
        self,
        product_code: str,
        option_type: str,
        strike_price: float,
        term: str,
        notional_amount: float,
        structure: str = 'vanilla'
    ) -> Dict[str, Any]:
        """
        估算期权价格范围

        使用简化的Black-Scholes模型进行估算

        Args:
            product_code: 产品代码
            option_type: 期权类型
            strike_price: 执行价
            term: 期限
            notional_amount: 名义本金
            structure: 结构类型

        Returns:
            价格估算结果
        """
        # 简化参数（实际应使用市场数据）
        spot_price = 100  # 假设现价
        risk_free_rate = 0.03  # 无风险利率
        dividend_yield = 0.02  # 股息率
        volatility = 0.25  # 波动率

        # 期限转换为年
        T = self._parse_term_to_days(term) / 365

        # 简化BS模型计算
        from scipy.stats import norm
        import math

        d1 = (math.log(spot_price / (strike_price * spot_price / 100)) +
              (risk_free_rate - dividend_yield + 0.5 * volatility ** 2) * T) / \
             (volatility * math.sqrt(T))
        d2 = d1 - volatility * math.sqrt(T)

        if option_type == 'call':
            price = spot_price * math.exp(-dividend_yield * T) * norm.cdf(d1) - \
                    (strike_price * spot_price / 100) * math.exp(-risk_free_rate * T) * norm.cdf(d2)
        else:
            price = (strike_price * spot_price / 100) * math.exp(-risk_free_rate * T) * norm.cdf(-d2) - \
                    spot_price * math.exp(-dividend_yield * T) * norm.cdf(-d1)

        # 调整名义本金
        total_premium = price * notional_amount * 100  # 期权费总额（元）

        # 根据结构类型调整
        structure_multipliers = {
            'vanilla': 1.0,
            'snowball': 0.7,  # 雪球通常期权费较低
            'barrier': 0.8,
            'phoenix': 0.75
        }
        multiplier = structure_multipliers.get(structure, 1.0)
        adjusted_premium = total_premium * multiplier

        return {
            'estimatedPremium': round(adjusted_premium, 2),
            'premiumRate': round(adjusted_premium / (notional_amount * 10000) * 100, 4),  # 期权费率%
            'priceRange': {
                'low': round(adjusted_premium * 0.85, 2),
                'mid': round(adjusted_premium, 2),
                'high': round(adjusted_premium * 1.15, 2)
            },
            'greeks': self._calculate_greeks(spot_price, strike_price, T, risk_free_rate, volatility, option_type),
            'disclaimer': '以上价格为参考估算，实际价格以交易商报价为准'
        }

    def calculate_greeks(
        self,
        spot_price: float,
        strike_price: float,
        term: str,
        risk_free_rate: float,
        volatility: float,
        option_type: str = 'call',
        dividend_yield: float = 0.02
    ) -> Dict[str, float]:
        """
        计算希腊字母

        Args:
            spot_price: 现价
            strike_price: 执行价（百分比）
            term: 期限
            risk_free_rate: 无风险利率
            volatility: 波动率
            option_type: 期权类型
            dividend_yield: 股息率

        Returns:
            希腊字母值
        """
        T = self._parse_term_to_days(term) / 365
        actual_strike = spot_price * strike_price / 100

        return self._calculate_greeks(spot_price, actual_strike, T, risk_free_rate, volatility, option_type, dividend_yield)

    def _calculate_greeks(
        self,
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = 'call',
        q: float = 0
    ) -> Dict[str, float]:
        """内部希腊字母计算"""
        try:
            from scipy.stats import norm
            import math

            if T <= 0:
                T = 1 / 365  # 最小1天

            d1 = (math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
            d2 = d1 - sigma * math.sqrt(T)

            # Delta
            if option_type == 'call':
                delta = math.exp(-q * T) * norm.cdf(d1)
            else:
                delta = -math.exp(-q * T) * norm.cdf(-d1)

            # Gamma
            gamma = math.exp(-q * T) * norm.pdf(d1) / (S * sigma * math.sqrt(T))

            # Theta (per day)
            theta_part1 = -S * math.exp(-q * T) * norm.pdf(d1) * sigma / (2 * math.sqrt(T))
            if option_type == 'call':
                theta_part2 = -r * K * math.exp(-r * T) * norm.cdf(d2)
                theta_part3 = q * S * math.exp(-q * T) * norm.cdf(d1)
            else:
                theta_part2 = r * K * math.exp(-r * T) * norm.cdf(-d2)
                theta_part3 = -q * S * math.exp(-q * T) * norm.cdf(-d1)
            theta = (theta_part1 + theta_part2 + theta_part3) / 365

            # Vega (per 1% volatility change)
            vega = S * math.exp(-q * T) * norm.pdf(d1) * math.sqrt(T) / 100

            # Rho (per 1% rate change)
            if option_type == 'call':
                rho = K * T * math.exp(-r * T) * norm.cdf(d2) / 100
            else:
                rho = -K * T * math.exp(-r * T) * norm.cdf(-d2) / 100

            return {
                'delta': round(delta, 4),
                'gamma': round(gamma, 4),
                'theta': round(theta, 2),
                'vega': round(vega, 2),
                'rho': round(rho, 2)
            }
        except Exception as e:
            logger.warning(f"希腊字母计算失败: {e}")
            return {
                'delta': 0.0,
                'gamma': 0.0,
                'theta': 0.0,
                'vega': 0.0,
                'rho': 0.0
            }

    def _parse_term_to_days(self, term: str) -> int:
        """将期限字符串转换为天数"""
        term_map = {
            '1M': 30,
            '2M': 60,
            '3M': 90,
            '6M': 180,
            '9M': 270,
            '1Y': 365,
            '2Y': 730
        }
        return term_map.get(term, 30)

    def _get_term_reason(self, horizon: str, view: str) -> str:
        """获取期限推荐原因"""
        reasons = {
            ('short', 'bullish'): '短期看涨，建议选择较短期限以降低时间价值损耗',
            ('short', 'bearish'): '短期看跌，建议短期对冲后及时调整',
            ('medium', 'neutral'): '中性观点，中期期限提供较好的灵活性',
            ('long', 'bullish'): '长期看涨，长期限可充分参与上涨行情',
        }
        return reasons.get((horizon, view), f'根据您的{horizon}期投资偏好推荐')

    def _get_term_risk_note(self, term: str, risk: str) -> str:
        """获取期限风险提示"""
        if term in ['6M', '9M', '1Y']:
            return '长期限意味着更高的时间价值损耗，请关注市场变化'
        return ''

    def _get_strategy_reason(self, view: str, vol: str, risk: str) -> str:
        """获取策略推荐原因"""
        if view == 'range_bound':
            return '震荡行情适合收益增强型产品'
        elif view == 'bullish' and vol == 'low':
            return '低波动环境下可考虑成本优化的策略'
        elif vol == 'high':
            return '高波动环境下传统期权可提供较好的收益空间'
        return '根据您的市场观点和风险偏好推荐'

    def _get_alternative_strategies(self, view: str) -> List[Dict[str, str]]:
        """获取备选策略"""
        alternatives = {
            'bullish': [
                {'strategy': 'vanilla', 'reason': '直接参与上涨'},
                {'strategy': 'barrier', 'reason': '降低期权费成本'}
            ],
            'bearish': [
                {'strategy': 'vanilla', 'reason': '直接对冲下跌风险'},
                {'strategy': 'barrier', 'reason': '成本更低的保护'}
            ],
            'neutral': [
                {'strategy': 'snowball', 'reason': '震荡市增强收益'},
                {'strategy': 'phoenix', 'reason': '多观察期机会'}
            ]
        }
        return alternatives.get(view, [])

    def _get_matching_reason(self, product: str, urgency: str, amount: float) -> str:
        """获取匹配原因"""
        reasons = []
        if product == 'equity':
            reasons.append('擅长股票类期权')
        if urgency == 'urgent':
            reasons.append('响应速度快')
        if amount >= 5000:
            reasons.append('大额交易经验丰富')
        return '、'.join(reasons) if reasons else '综合评分最优'

    def _get_sentiment_recommendation(self, score: float, trend: str) -> str:
        """获取情绪建议"""
        if score >= 70:
            return '市场情绪偏多，可考虑看涨策略'
        elif score >= 55:
            return '市场情绪中性偏多，建议适度参与'
        elif score >= 45:
            return '市场情绪中性，可考虑收益增强型产品'
        elif score >= 30:
            return '市场情绪偏空，建议谨慎操作或考虑对冲'
        else:
            return '市场情绪看跌，建议观望或买入保护性看跌期权'


# 单例实例
recommendation_service = InquiryRecommendationService()