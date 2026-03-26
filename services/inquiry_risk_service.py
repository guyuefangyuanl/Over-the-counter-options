"""
询价风险控制服务

提供多层次的风险控制和验证：
- 多层次表单验证
- 价格合理性检查
- 数量限制管理
- 敏感操作二次确认
- 操作日志记录
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional
from flask import g

logger = logging.getLogger(__name__)


class InquiryRiskService:
    """询价风险控制服务"""

    # 名义本金限制（万元）
    NOTIONAL_LIMITS = {
        'warning': 5000,    # 5000万预警
        'limit': 10000,     # 1亿限制
        'super_limit': 50000  # 5亿超级限制（需特殊审批）
    }

    # 敏感操作列表
    SENSITIVE_OPERATIONS = [
        'cancel_inquiry',
        'delete_inquiry',
        'batch_update',
        'priority_upgrade',
        'export_data'
    ]

    # 风险等级定义
    RISK_LEVELS = {
        'low': {
            'level': 1,
            'color': 'green',
            'description': '低风险'
        },
        'medium': {
            'level': 2,
            'color': 'yellow',
            'description': '中风险'
        },
        'high': {
            'level': 3,
            'color': 'orange',
            'description': '高风险'
        },
        'critical': {
            'level': 4,
            'color': 'red',
            'description': '极高风险'
        }
    }

    def __init__(self):
        self._operation_logs = []  # 操作日志缓存

    def validate_inquiry_data(
        self,
        data: Dict[str, Any],
        user_info: Dict[str, Any] = None
    ) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        多层次表单验证

        Args:
            data: 询价数据
            user_info: 用户信息

        Returns:
            (是否通过, 错误列表, 风险评估)
        """
        errors = []
        warnings = []
        risk_assessment = {
            'level': 'low',
            'factors': [],
            'recommendations': []
        }

        # 第一层：必填字段验证
        required_fields = {
            'selectedProduct': '标的',
            'contactName': '联系人',
            'contactPhone': '联系电话',
            'notionalAmount': '名义本金'
        }

        for field, label in required_fields.items():
            if not data.get(field):
                errors.append(f'{label}不能为空')

        if errors:
            return False, errors, risk_assessment

        # 第二层：格式验证
        format_errors = self._validate_format(data)
        errors.extend(format_errors)

        if errors:
            return False, errors, risk_assessment

        # 第三层：业务逻辑验证
        logic_errors, logic_warnings = self._validate_business_logic(data)
        errors.extend(logic_errors)
        warnings.extend(logic_warnings)

        # 第四层：风险评估
        risk_assessment = self._assess_risk(data, user_info)

        return len(errors) == 0, errors + warnings, risk_assessment

    def _validate_format(self, data: Dict[str, Any]) -> List[str]:
        """格式验证"""
        errors = []

        # 手机号格式
        phone = data.get('contactPhone', '')
        if phone and not re.match(r'^1[3-9]\d{9}$', str(phone)):
            errors.append('手机号格式不正确')

        # 邮箱格式（可选）
        email = data.get('contactEmail', '')
        if email and not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', str(email)):
            errors.append('邮箱格式不正确')

        # 名义本金
        try:
            amount = float(data.get('notionalAmount', 0))
            if amount <= 0:
                errors.append('名义本金必须大于0')
        except (ValueError, TypeError):
            errors.append('名义本金格式不正确')

        # 执行价
        strike = data.get('strikePrice')
        if strike:
            try:
                strike_val = float(strike)
                if strike_val < 50 or strike_val > 200:
                    errors.append('执行价需在50%-200%之间')
            except (ValueError, TypeError):
                errors.append('执行价格式不正确')

        # 期权类型
        option_type = data.get('optionType', '')
        if option_type and option_type not in ['call', 'put']:
            errors.append('期权类型不正确')

        # 结构类型
        structure = data.get('structure', '')
        if structure and structure not in ['vanilla', 'snowball', 'barrier', 'phoenix']:
            errors.append('结构类型不正确')

        # 期限
        term = data.get('term', '')
        valid_terms = ['1M', '2M', '3M', '6M', '9M', '1Y']
        if term and term not in valid_terms:
            errors.append('期限格式不正确')

        return errors

    def _validate_business_logic(self, data: Dict[str, Any]) -> Tuple[List[str], List[str]]:
        """业务逻辑验证"""
        errors = []
        warnings = []

        # 名义本金限制检查
        try:
            amount = float(data.get('notionalAmount', 0))
            if amount > self.NOTIONAL_LIMITS['limit']:
                errors.append(f'名义本金超过限制（{self.NOTIONAL_LIMITS["limit"]}万元）')
            elif amount > self.NOTIONAL_LIMITS['warning']:
                warnings.append(f'名义本金较大（{amount}万元），请确认金额正确')
        except:
            pass

        # 检查产品类型与结构类型的匹配
        structure = data.get('structure', 'vanilla')
        product_type = data.get('selectedProduct', {}).get('type', '')

        if structure == 'snowball' and product_type == 'index':
            warnings.append('指数类产品的雪球结构可能有特殊限制，建议咨询交易商')

        # 检查紧急程度与期限的匹配
        urgency = data.get('urgency', 'normal')
        term = data.get('term', '1M')

        if urgency == 'urgent' and term in ['6M', '9M', '1Y']:
            warnings.append('长期限的紧急询价可能影响报价质量')

        return errors, warnings

    def _assess_risk(
        self,
        data: Dict[str, Any],
        user_info: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """风险评估"""
        risk_factors = []
        risk_level = 'low'
        recommendations = []

        try:
            amount = float(data.get('notionalAmount', 0))

            # 大额风险评估
            if amount > self.NOTIONAL_LIMITS['super_limit']:
                risk_level = 'critical'
                risk_factors.append('超大额交易')
                recommendations.append('建议分批询价或联系专属客户经理')
            elif amount > self.NOTIONAL_LIMITS['limit']:
                risk_level = 'high'
                risk_factors.append('大额交易')
                recommendations.append('建议提前与交易商沟通')
            elif amount > self.NOTIONAL_LIMITS['warning']:
                if risk_level == 'low':
                    risk_level = 'medium'
                risk_factors.append('较大额交易')

        except:
            pass

        # 用户风险
        if user_info:
            if user_info.get('isGuest'):
                if risk_level == 'low':
                    risk_level = 'medium'
                risk_factors.append('游客用户')
                recommendations.append('建议登录后询价，可享受更多服务')

        # 结构风险
        structure = data.get('structure', 'vanilla')
        if structure in ['snowball', 'phoenix']:
            if risk_level in ['low', 'medium']:
                risk_level = 'medium'
            risk_factors.append('复杂结构')
            recommendations.append('请确保了解产品风险特征')

        return {
            'level': risk_level,
            'level_info': self.RISK_LEVELS.get(risk_level, self.RISK_LEVELS['low']),
            'factors': risk_factors,
            'recommendations': recommendations
        }

    def check_price_reasonability(
        self,
        estimated_price: float,
        quoted_prices: List[float],
        tolerance: float = 0.3
    ) -> Dict[str, Any]:
        """
        检查价格合理性

        Args:
            estimated_price: 估算价格
            quoted_prices: 报价列表
            tolerance: 容差范围

        Returns:
            合理性检查结果
        """
        if not quoted_prices:
            return {
                'reasonable': True,
                'reason': '无历史报价参考'
            }

        avg_price = sum(quoted_prices) / len(quoted_prices)
        min_price = min(quoted_prices)
        max_price = max(quoted_prices)

        # 计算偏差
        deviation = abs(estimated_price - avg_price) / avg_price

        reasonable = deviation <= tolerance

        return {
            'reasonable': reasonable,
            'estimated_price': estimated_price,
            'avg_market_price': round(avg_price, 4),
            'price_range': {
                'min': min_price,
                'max': max_price
            },
            'deviation': round(deviation * 100, 2),
            'reason': f'估算价格与市场均价偏差{round(deviation*100, 1)}%' if not reasonable else '价格在合理范围内'
        }

    def check_operation_permission(
        self,
        operation: str,
        user_info: Dict[str, Any],
        inquiry_data: Dict[str, Any] = None
    ) -> Tuple[bool, str, bool]:
        """
        检查操作权限

        Args:
            operation: 操作类型
            user_info: 用户信息
            inquiry_data: 询价数据

        Returns:
            (是否允许, 原因, 是否需要二次确认)
        """
        # 管理员拥有所有权限
        if user_info.get('role') == 'admin':
            need_confirm = operation in self.SENSITIVE_OPERATIONS
            return True, '管理员权限', need_confirm

        # 用户只能操作自己的询价
        if inquiry_data:
            inquiry_user_id = inquiry_data.get('userId') or inquiry_data.get('openid')
            current_user_id = user_info.get('userId') or user_info.get('openid')

            if inquiry_user_id and current_user_id and inquiry_user_id != current_user_id:
                return False, '无权操作他人的询价', False

        # 游客用户限制
        if user_info.get('isGuest'):
            allowed_operations = ['create_inquiry', 'view_inquiry']
            if operation not in allowed_operations:
                return False, '游客权限受限，请登录后操作', False

        # 检查操作是否需要二次确认
        need_confirm = operation in self.SENSITIVE_OPERATIONS

        return True, '权限验证通过', need_confirm

    def log_operation(
        self,
        operation: str,
        user_id: str,
        inquiry_id: str = None,
        details: Dict[str, Any] = None
    ) -> None:
        """
        记录操作日志

        Args:
            operation: 操作类型
            user_id: 用户ID
            inquiry_id: 询价ID
            details: 详细信息
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'operation': operation,
            'user_id': user_id,
            'inquiry_id': inquiry_id,
            'details': details or {},
            'ip': getattr(g, 'client_ip', 'unknown')
        }

        self._operation_logs.append(log_entry)

        # 持久化日志（实际应写入数据库）
        logger.info(f"[OPERATION_LOG] {log_entry}")

    def get_operation_logs(
        self,
        user_id: str = None,
        inquiry_id: str = None,
        operation: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        获取操作日志

        Args:
            user_id: 用户ID过滤
            inquiry_id: 询价ID过滤
            operation: 操作类型过滤
            limit: 返回数量限制

        Returns:
            操作日志列表
        """
        logs = self._operation_logs

        if user_id:
            logs = [l for l in logs if l.get('user_id') == user_id]
        if inquiry_id:
            logs = [l for l in logs if l.get('inquiry_id') == inquiry_id]
        if operation:
            logs = [l for l in logs if l.get('operation') == operation]

        return logs[-limit:]

    def generate_confirmation_token(
        self,
        operation: str,
        user_id: str,
        inquiry_id: str
    ) -> str:
        """
        生成二次确认令牌

        用于敏感操作的二次验证
        """
        import hashlib
        import time

        data = f"{operation}:{user_id}:{inquiry_id}:{time.time()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def verify_confirmation_token(
        self,
        token: str,
        operation: str,
        user_id: str,
        inquiry_id: str,
        max_age: int = 300
    ) -> bool:
        """
        验证二次确认令牌

        Args:
            token: 令牌
            operation: 操作类型
            user_id: 用户ID
            inquiry_id: 询价ID
            max_age: 最大有效期（秒）

        Returns:
            是否有效
        """
        # 简化实现：实际应使用带时间戳的签名验证
        expected = self.generate_confirmation_token(operation, user_id, inquiry_id)
        return token == expected


class InquiryRateLimiter:
    """询价频率限制器"""

    # 限制配置
    LIMITS = {
        'create_inquiry': {
            'window': 60,  # 时间窗口（秒）
            'max_count': 5  # 最大次数
        },
        'batch_update': {
            'window': 60,
            'max_count': 10
        },
        'export': {
            'window': 3600,
            'max_count': 10
        }
    }

    def __init__(self):
        self._request_counts = {}  # user_id -> {operation -> [(timestamp, count)]}

    def check_rate_limit(
        self,
        user_id: str,
        operation: str
    ) -> Tuple[bool, int, int]:
        """
        检查频率限制

        Args:
            user_id: 用户ID
            operation: 操作类型

        Returns:
            (是否允许, 剩余次数, 重置时间)
        """
        if operation not in self.LIMITS:
            return True, -1, 0

        limit_config = self.LIMITS[operation]
        window = limit_config['window']
        max_count = limit_config['max_count']

        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=window)

        # 初始化用户记录
        if user_id not in self._request_counts:
            self._request_counts[user_id] = {}

        if operation not in self._request_counts[user_id]:
            self._request_counts[user_id][operation] = []

        # 清理过期记录
        self._request_counts[user_id][operation] = [
            t for t in self._request_counts[user_id][operation]
            if t > cutoff
        ]

        current_count = len(self._request_counts[user_id][operation])

        if current_count >= max_count:
            oldest = min(self._request_counts[user_id][operation])
            reset_time = int((oldest + timedelta(seconds=window) - now).total_seconds())
            return False, 0, reset_time

        # 记录本次请求
        self._request_counts[user_id][operation].append(now)

        return True, max_count - current_count - 1, window


# 单例实例
risk_service = InquiryRiskService()
rate_limiter = InquiryRateLimiter()