from flask import Blueprint, jsonify, request, current_app, g
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from functools import wraps
import threading

from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
from backend_utils.security import rate_limit
from routes.auth import require_auth
from services.trade_service import TradeService
from models.inquiry_status import InquiryStatus, InquiryStatusMachine, INQUIRY_STATUS_VALUES

logger = logging.getLogger(__name__)
inquiry_bp = Blueprint('inquiry', __name__)
trade_service = TradeService()


# ==================== 简单限流实现 ====================

class SimpleRateLimiter:
    """
    基于内存的简单限流器

    生产环境建议使用 Redis 实现
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._requests = {}
        return cls._instance

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> tuple:
        """
        检查是否允许请求

        Args:
            key: 限流键（如 IP 或 用户ID）
            max_requests: 时间窗口内最大请求数
            window_seconds: 时间窗口（秒）

        Returns:
            (是否允许, 剩余次数, 重置时间)
        """
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=window_seconds)

        # 初始化
        if key not in self._requests:
            self._requests[key] = []

        # 清理过期记录
        self._requests[key] = [t for t in self._requests[key] if t > cutoff]

        current_count = len(self._requests[key])

        if current_count >= max_requests:
            oldest = min(self._requests[key])
            reset_time = int((oldest + timedelta(seconds=window_seconds) - now).total_seconds())
            return False, 0, reset_time

        # 记录本次请求
        self._requests[key].append(now)
        return True, max_requests - current_count - 1, window_seconds


rate_limiter = SimpleRateLimiter()


def rate_limit(max_requests: int = 10, window_seconds: int = 60, key_func=None):
    """
    限流装饰器

    Args:
        max_requests: 时间窗口内最大请求数
        window_seconds: 时间窗口（秒）
        key_func: 生成限流键的函数，默认使用 IP

    Usage:
        @rate_limit(max_requests=5, window_seconds=60)
        def some_route():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # 生成限流键
            if key_func:
                key = key_func()
            else:
                # 默认使用 IP + 路由名
                ip = request.remote_addr or 'unknown'
                key = f"{ip}:{f.__name__}"

            allowed, remaining, reset_time = rate_limiter.is_allowed(
                key, max_requests, window_seconds
            )

            if not allowed:
                logger.warning(f"限流触发: key={key}, limit={max_requests}/{window_seconds}s")
                return flask_error_response(
                    f"请求过于频繁，请{reset_time}秒后重试",
                    429
                )

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def _get_rate_limit_key():
    """生成限流键（基于用户ID或IP）"""
    user_id = _get_current_user_id()
    if user_id:
        return f"user:{user_id}"
    return f"ip:{request.remote_addr or 'unknown'}"


def _get_current_user_id() -> Optional[str]:
    """获取当前用户ID（从认证上下文）"""
    if hasattr(g, 'user') and g.user:
        return g.user.get('sub') or g.user.get('openid')
    if hasattr(g, 'admin') and g.admin:
        return g.admin.get('sub')
    return None


def _get_current_user_info() -> Dict[str, Any]:
    """
    获取当前登录用户的完整信息（用于询价关联）

    Returns:
        包含 openid, userId, nickname, phone 等字段的字典
        如果未登录返回空字典（支持匿名询价）
    """
    user_info = {}

    # 从 g.admin 获取用户信息（JWT 解码后的 payload）
    if hasattr(g, 'admin') and isinstance(g.admin, dict):
        user_info['openid'] = g.admin.get('sub')
        user_info['userId'] = g.admin.get('sub')
        user_info['role'] = g.admin.get('role', 'user')

        # 尝试从数据库获取更详细的用户信息
        try:
            from services.auth_service import AuthService
            auth_service = AuthService()
            db_user = auth_service.get_user_profile(g.admin.get('sub'))
            if db_user:
                user_info['nickname'] = db_user.get('nickname', '微信用户')
                user_info['phone'] = db_user.get('phone', '')
                user_info['avatar'] = db_user.get('avatar', '')
        except Exception as e:
            logger.debug(f"获取用户详细信息失败，使用 JWT 数据: {e}")
            user_info['nickname'] = g.admin.get('nickname', '微信用户')

    return user_info


def _is_guest_mode() -> bool:
    """检查当前是否为游客模式"""
    if hasattr(g, 'admin') and isinstance(g.admin, dict):
        return g.admin.get('role') == 'guest'
    return False


def _validate_inquiry_data(data: Dict[str, Any]) -> Optional[str]:
    """
    验证询价数据

    Returns:
        错误信息，如果验证通过则返回 None
    """
    if not data:
        return "请求数据为空"

    # 产品信息验证
    selected_product = data.get('selectedProduct')
    if not selected_product:
        return "未选择产品"
    if not selected_product.get('name') and not data.get('productName'):
        return "产品名称不能为空"
    if not selected_product.get('code') and not data.get('productCode'):
        return "产品代码不能为空"

    # 名义本金验证
    notional_amount = data.get('notionalAmount')
    if not notional_amount:
        return "名义本金不能为空"
    try:
        amount = float(notional_amount)
        if amount <= 0:
            return "名义本金必须大于0"
        if amount > 100000:  # 10亿限制（单位：万元）
            return "名义本金不能超过10亿元"
    except (ValueError, TypeError):
        return "名义本金格式不正确"

    # 行权价验证
    strike_price = data.get('strikePrice')
    if strike_price is not None:
        try:
            strike = float(strike_price)
            if strike < 50 or strike > 200:
                return "行权价须在50%~200%之间"
        except (ValueError, TypeError):
            return "行权价格式不正确"

    # 联系人验证
    contact_name = data.get('contactName')
    if not contact_name or not str(contact_name).strip():
        return "联系人不能为空"

    # 联系电话验证
    contact_phone = data.get('contactPhone') or data.get('phone')
    if not contact_phone:
        return "联系电话不能为空"
    phone_pattern = re.compile(r'^1[3-9]\d{9}$')
    if not phone_pattern.match(str(contact_phone)):
        return "手机号格式不正确"

    # 邮箱验证（可选）
    contact_email = data.get('contactEmail')
    if contact_email:
        email_pattern = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
        if not email_pattern.match(str(contact_email)):
            return "邮箱格式不正确"

    # 期权类型验证
    option_type = data.get('optionType')
    if option_type and option_type not in ['call', 'put']:
        return "期权类型不正确"

    # 结构类型验证
    structure = data.get('structure')
    if structure and structure not in ['vanilla', 'snowball', 'phoenix']:
        return "结构类型不正确"

    # 期限验证
    term = data.get('term')
    if term and term not in ['2W', '1M', '2M', '3M', '6M', '12M', '1Y', 'custom']:
        return "期限格式不正确"

    return None


def _sanitize_inquiry_data(data: Dict[str, Any], user_info: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    清理和规范化询价数据，由服务端生成关键字段

    Args:
        data: 原始数据
        user_info: 当前用户信息（从 _get_current_user_info() 获取）

    Returns:
        规范化后的数据

    安全策略：
    - userId/openid 由服务端从认证上下文获取，前端传入的值会被忽略
    - 联系人信息优先使用表单输入，登录用户可自动填充账户信息
    - 游客模式允许提交但标记来源
    """
    now = datetime.utcnow().isoformat()

    # 获取用户信息
    user = user_info or {}
    user_id = user.get('userId') or user.get('openid', '')
    is_guest = user.get('role') == 'guest'

    # 联系人信息：优先使用表单输入，其次使用账户信息
    contact_name = str(data.get('contactName', '')).strip()
    contact_phone = data.get('contactPhone') or data.get('phone', '')

    # 如果用户已登录但未填写联系人，使用账户信息
    if user_id and not is_guest:
        if not contact_name and user.get('nickname'):
            contact_name = user.get('nickname')
        if not contact_phone and user.get('phone'):
            contact_phone = user.get('phone')

    # 构建规范化的数据结构
    sanitized = {
        # 产品信息
        "selectedProduct": data.get('selectedProduct', {}),
        "productName": data.get('productName') or data.get('selectedProduct', {}).get('name', ''),
        "productCode": data.get('productCode') or data.get('selectedProduct', {}).get('code', ''),

        # 询价参数
        "optionType": data.get('optionType', 'call'),
        "structure": data.get('structure', 'vanilla'),
        "term": data.get('term', '1M'),
        "notionalAmount": float(data.get('notionalAmount', 0)),
        "strikePrice": float(data.get('strikePrice', 100)) if data.get('strikePrice') else None,
        "selectedDealers": data.get('selectedDealers', []),

        # 联系信息（统一字段名）
        "contactName": contact_name,
        "contactPhone": contact_phone,
        "contactEmail": data.get('contactEmail', ''),
        "phone": contact_phone,  # 保持兼容
        "notes": data.get('notes', ''),

        # 状态 - 由服务端设置
        "status": InquiryStatus.PENDING.value,

        # 时间 - 由服务端生成
        "createdAt": now,
        "updatedAt": now,

        # 用户关联 - 由服务端设置（忽略前端传入的值）
        "userId": user_id,
        "openid": user_id,
        "userName": contact_name or '匿名用户',

        # 来源标记
        "source": _determine_source(data.get('source'), is_guest),
        "isGuest": is_guest,
    }

    # 登录用户补充信息
    if user_id and not is_guest:
        sanitized["userNickname"] = user.get('nickname', '')
        sanitized["userAvatar"] = user.get('avatar', '')

    # 清理空值
    if not sanitized['strikePrice']:
        del sanitized['strikePrice']
    if not sanitized['contactEmail']:
        del sanitized['contactEmail']
    if not sanitized['notes']:
        del sanitized['notes']

    return sanitized


def _determine_source(frontend_source: str, is_guest: bool) -> str:
    """确定询价来源"""
    if is_guest:
        return 'guest_' + (frontend_source or 'miniprogram')
    if frontend_source:
        return frontend_source
    return 'miniprogram'


@inquiry_bp.route('/inquiry', methods=['POST'])
@rate_limit(max_requests=10, window_seconds=60, key_func=_get_rate_limit_key)
def create_inquiry():
    """
    提交询价
    ---
    tags:
      - 询价
    summary: 创建新的期权询价请求
    description: |
      支持匿名提交（无需登录），但会验证手机号格式。
      支持游客模式提交，已登录用户的userId/openid由服务端从认证上下文获取。

      安全策略：
      - 关键字段（status、createdAt、userId）由服务端生成
      - 前端传入的值会被忽略
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          required:
            - productName
            - underlyingCode
            - notionalAmount
            - term
            - optionType
            - phone
          properties:
            productName:
              type: string
              description: 产品名称
              example: "个股看涨期权"
            underlyingCode:
              type: string
              description: 标的代码
              example: "000001.SZ"
            underlyingName:
              type: string
              description: 标的名称
              example: "平安银行"
            notionalAmount:
              type: number
              description: 名义本金（万元）
              example: 100
            strikePrice:
              type: number
              description: 行权价（百分比）
              example: 100
            term:
              type: string
              description: 期限
              enum: ["1M", "2M", "3M", "6M", "12M"]
              example: "3M"
            optionType:
              type: string
              description: 期权类型
              enum: ["call", "put"]
              example: "call"
            phone:
              type: string
              description: 联系电话
              example: "13800138000"
            contactName:
              type: string
              description: 联系人姓名
              example: "张三"
    responses:
      201:
        description: 询价提交成功
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "询价提交成功"
            data:
              type: object
              properties:
                id:
                  type: string
                  description: 询价ID
      400:
        description: 参数验证失败
      429:
        description: 请求过于频繁
      500:
        description: 服务器内部错误
    """
    try:
        data = request.json

        # 数据验证
        validation_error = _validate_inquiry_data(data)
        if validation_error:
            return flask_error_response(validation_error, 400)

        # 获取当前用户完整信息（如果有认证）
        user_info = _get_current_user_info()
        user_id = user_info.get('userId', '')
        is_guest = user_info.get('role') == 'guest'

        # 规范化数据（传入用户信息字典）
        sanitized_data = _sanitize_inquiry_data(data, user_info)

        # 创建询价
        inquiry_id = trade_service.create_inquiry(sanitized_data)

        if inquiry_id:
            # 记录日志时脱敏
            log_user = user_id if user_id else 'anonymous'
            if is_guest:
                log_user = f'guest_{user_id}'
            logger.info(f"询价创建成功: id={inquiry_id}, userId={log_user}, product={sanitized_data.get('productCode')}")

            response_data = {"id": inquiry_id}
            # 游客模式返回提示
            if is_guest:
                response_data["guestNotice"] = "您正在使用游客模式，询价记录将无法在账户中查看。建议登录以获取完整服务。"

            return flask_success_response(data=response_data, message="询价提交成功")
        else:
            logger.error(f"询价创建失败: 数据库返回空ID")
            return flask_error_response("提交失败，请稍后重试", 500)

    except ValueError as e:
        logger.warning(f"询价数据验证失败: {e}")
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"提交询价异常: {e}", exc_info=True)
        return flask_error_response("服务器错误，请稍后重试", 500)


@inquiry_bp.route('/inquiries', methods=['GET'])
@require_auth
def get_my_inquiries():
    """
    获取用户询价列表
    ---
    tags:
      - 询价
    summary: 获取当前用户的询价列表
    description: 小程序用户获取自己的询价记录，支持分页和状态筛选
    security:
      - Bearer: []
    parameters:
      - name: page
        in: query
        type: integer
        default: 1
        description: 页码
      - name: pageSize
        in: query
        type: integer
        default: 20
        description: 每页数量
      - name: status
        in: query
        type: string
        enum: ["pending", "processing", "quoted", "accepted", "rejected", "expired"]
        description: 状态筛选
    responses:
      200:
        description: 查询成功
        schema:
          type: object
          properties:
            success:
              type: boolean
            data:
              type: object
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/definitions/Inquiry'
                total:
                  type: integer
                  description: 总数量
                page:
                  type: integer
                pageSize:
                  type: integer
      401:
        description: 未授权
    """
    try:
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        status = request.args.get('status')

        # 状态过滤验证
        if status and status not in INQUIRY_STATUS_VALUES:
            return flask_error_response(f"无效的状态值: {status}", 400)

        # 获取当前用户ID
        user_id = _get_current_user_id()

        if not user_id:
            return flask_error_response("用户身份验证失败", 401)

        items, total = trade_service.get_inquiries(
            limit=min(page_size, 50),  # 限制最大页大小
            page=max(page, 1),
            status=status,
            user_id=user_id
        )

        return flask_paginated_response(
            data=items,
            page=page,
            per_page=page_size,
            total=total,
        )
    except Exception as e:
        logger.error(f"获取询价列表失败: {e}", exc_info=True)
        return flask_error_response("查询失败，请稍后重试", 500)


@inquiry_bp.route('/inquiries/<id>', methods=['GET'])
@require_auth
def get_inquiry_detail(id):
    """
    获取询价详情
    ---
    tags:
      - 询价
    summary: 获取单个询价详情
    description: 小程序用户获取自己的询价详情，只能查看属于自己的询价记录
    security:
      - Bearer: []
    parameters:
      - name: id
        in: path
        type: string
        required: true
        description: 询价ID
    responses:
      200:
        description: 查询成功
        schema:
          type: object
          properties:
            success:
              type: boolean
            data:
              $ref: '#/definitions/Inquiry'
      403:
        description: 无权访问
      404:
        description: 询价不存在
    """
    try:
        if not id:
            return flask_error_response("询价ID不能为空", 400)

        inquiry = trade_service.get_inquiry_by_id(id)

        if not inquiry:
            return flask_error_response("询价记录不存在", 404)

        # 权限校验：只能查看自己的询价
        user_id = _get_current_user_id()
        inquiry_user_id = inquiry.get('userId') or inquiry.get('openid')

        if user_id and inquiry_user_id and user_id != inquiry_user_id:
            logger.warning(f"用户 {user_id} 尝试访问不属于自己的询价记录 {id}")
            return flask_error_response("无权访问此询价记录", 403)

        return flask_success_response(data=inquiry)
    except Exception as e:
        logger.error(f"获取询价详情失败: {e}", exc_info=True)
        return flask_error_response("查询失败，请稍后重试", 500)


@inquiry_bp.route('/admin/inquiries', methods=['GET'])
@require_auth
def admin_get_inquiries():
    """管理后台：获取询价列表"""
    try:
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        status = request.args.get('status')

        # 状态过滤验证
        if status and status not in INQUIRY_STATUS_VALUES:
            return flask_error_response(f"无效的状态值: {status}", 400)

        items, total = trade_service.get_inquiries(
            limit=min(page_size, 100),  # 管理端允许更大的页大小
            page=max(page, 1),
            status=status
        )

        return flask_paginated_response(
            data=items,
            page=page,
            per_page=page_size,
            total=total,
        )
    except Exception as e:
        logger.error(f"获取询价列表失败: {e}", exc_info=True)
        return flask_error_response("查询失败，请稍后重试", 500)


@inquiry_bp.route('/admin/inquiries/<id>/status', methods=['PUT'])
@require_auth
def admin_update_inquiry_status(id):
    """管理后台：更新询价状态"""
    try:
        if not id:
            return flask_error_response("询价ID不能为空", 400)

        data = request.json
        new_status = data.get('status')
        remark = data.get('remark', '')
        send_notification = data.get('sendNotification', True)  # 默认发送通知

        # 状态验证
        if not new_status:
            return flask_error_response("状态不能为空", 400)
        if new_status not in INQUIRY_STATUS_VALUES:
            return flask_error_response(f"无效的状态值: {new_status}", 400)

        # 获取当前询价记录
        inquiry = trade_service.get_inquiry_by_id(id)
        if not inquiry:
            return flask_error_response("询价记录不存在", 404)

        # 状态流转验证
        current_status = inquiry.get('status', InquiryStatus.PENDING.value)
        transition_error = InquiryStatusMachine.validate_transition(current_status, new_status)
        if transition_error:
            logger.warning(f"状态流转验证失败: inquiry={id}, {current_status} -> {new_status}, error={transition_error}")
            return flask_error_response(transition_error, 400)

        # 获取操作者信息
        operator = "system"
        if hasattr(g, 'admin') and g.admin:
            operator = g.admin.get("sub", "unknown")

        # 更新状态
        success = trade_service.update_inquiry_status(id, new_status, remark, operator)

        if success:
            logger.info(f"询价状态更新成功: id={id}, {current_status} -> {new_status}, operator={operator}")

            # 发送状态变更通知给用户
            if send_notification:
                try:
                    from services.notification_service import notification_service

                    user_id = inquiry.get('userId') or inquiry.get('openid')
                    product_name = inquiry.get('productName') or inquiry.get('selectedProduct', {}).get('name', '')

                    # 只向已登录用户发送通知（有有效 userId 的）
                    if user_id and not inquiry.get('isGuest'):
                        notification_service.notify_inquiry_status_change(
                            user_id=user_id,
                            inquiry_id=id,
                            new_status=new_status,
                            product_name=product_name,
                            remark=remark
                        )
                        logger.info(f"已发送询价状态变更通知给用户: {user_id}")
                except Exception as notify_err:
                    # 通知发送失败不影响状态更新
                    logger.warning(f"发送询价状态通知失败: {notify_err}")

            return flask_success_response(message="状态更新成功")
        else:
            return flask_error_response("状态更新失败", 500)

    except ValueError as e:
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"更新询价状态失败: {e}", exc_info=True)
        return flask_error_response("更新失败，请稍后重试", 500)


@inquiry_bp.route('/admin/inquiries/statistics', methods=['GET'])
@require_auth
def get_inquiry_statistics():
    """获取询价统计信息"""
    try:
        stats = trade_service.get_inquiry_statistics()

        # 确保所有状态都有统计值
        for status in INQUIRY_STATUS_VALUES:
            if status not in stats:
                stats[status] = 0

        return flask_success_response(data=stats, message="统计成功")
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}", exc_info=True)
        return flask_error_response("统计失败，请稍后重试", 500)


@inquiry_bp.route('/admin/inquiries/batch-update', methods=['POST'])
@require_auth
@rate_limit(max_requests=20, window_seconds=60, key_func=_get_rate_limit_key)
def admin_batch_update_inquiries():
    """批量更新询价状态"""
    try:
        data = request.json
        ids = data.get('ids', [])
        new_status = data.get('status')

        # 参数验证
        if not ids or not isinstance(ids, list):
            return flask_error_response("请选择要更新的记录", 400)
        if not new_status:
            return flask_error_response("状态不能为空", 400)
        if new_status not in INQUIRY_STATUS_VALUES:
            return flask_error_response(f"无效的状态值: {new_status}", 400)
        if len(ids) > 100:
            return flask_error_response("单次最多更新100条记录", 400)

        # 获取操作者信息
        operator = "system"
        if hasattr(g, 'admin') and g.admin:
            operator = g.admin.get("sub", "unknown")

        # 批量更新（带状态流转验证）
        success_count = 0
        failed_count = 0
        failed_ids = []

        for inquiry_id in ids:
            inquiry = trade_service.get_inquiry_by_id(inquiry_id)
            if not inquiry:
                failed_count += 1
                failed_ids.append(inquiry_id)
                continue

            current_status = inquiry.get('status', InquiryStatus.PENDING.value)
            transition_error = InquiryStatusMachine.validate_transition(current_status, new_status)
            if transition_error:
                failed_count += 1
                failed_ids.append(inquiry_id)
                continue

            if trade_service.update_inquiry_status(inquiry_id, new_status, operator=operator):
                success_count += 1
            else:
                failed_count += 1
                failed_ids.append(inquiry_id)

        logger.info(f"批量更新询价状态: status={new_status}, success={success_count}, failed={failed_count}, operator={operator}")

        if failed_count > 0:
            return flask_success_response(
                message=f"成功更新 {success_count} 条记录，{failed_count} 条记录更新失败",
                data={"successCount": success_count, "failedCount": failed_count, "failedIds": failed_ids}
            )
        return flask_success_response(message=f"成功更新 {success_count} 条记录")

    except Exception as e:
        logger.error(f"批量更新失败: {e}", exc_info=True)
        return flask_error_response("批量更新失败，请稍后重试", 500)


@inquiry_bp.route('/admin/inquiries/export', methods=['GET'])
@require_auth
@rate_limit(max_requests=10, window_seconds=60)  # 每分钟最多10次导出请求
def admin_export_inquiries():
    """导出询价列表（云托管简化版，返回JSON）"""
    try:
        status = request.args.get('status')

        # 状态过滤验证
        if status and status not in INQUIRY_STATUS_VALUES:
            return flask_error_response(f"无效的状态值: {status}", 400)

        # 导出限制1000条
        items, _ = trade_service.get_inquiries(limit=1000, page=1, status=status)

        if not items:
            return flask_error_response("没有数据可导出", 404)

        # 格式化数据
        export_data = []
        for item in items:
            prod = item.get('selectedProduct', {})
            export_data.append({
                "ID": item.get('_id'),
                "提交时间": item.get('createdAt'),
                "客户姓名": item.get('contactName'),
                "电话": item.get('phone') or item.get('contactPhone'),
                "产品名称": item.get('productName') or prod.get('name'),
                "代码": item.get('productCode') or prod.get('code'),
                "方向": item.get('optionType'),
                "结构": item.get('structure'),
                "期限": item.get('term'),
                "名义本金(万)": item.get('notionalAmount'),
                "行权价(%)": item.get('strikePrice'),
                "状态": InquiryStatus.get_label(item.get('status')),
                "状态码": item.get('status'),
                "备注": item.get('remark')
            })

        return jsonify({
            "success": True,
            "data": export_data,
            "count": len(export_data)
        })
    except Exception as e:
        logger.error(f"导出失败: {e}", exc_info=True)
        return flask_error_response("导出失败，请稍后重试", 500)


# ==================== 文件上传相关API ====================

@inquiry_bp.route('/upload/prepare', methods=['POST'])
@require_auth
def prepare_file_upload():
    """
    准备文件上传
    
    前端在调用微信云存储上传前，先调用此接口验证文件并获取上传参数
    """
    try:
        data = request.json or {}
        filename = data.get('filename', '')
        file_size = int(data.get('fileSize', 0))
        folder = data.get('folder', 'inquiries')
        
        if not filename:
            return flask_error_response("文件名不能为空", 400)
        if file_size <= 0:
            return flask_error_response("文件大小无效", 400)
        
        from services.file_upload_service import file_upload_service
        
        result = file_upload_service.prepare_upload(filename, file_size, folder)
        
        if result.get('success'):
            return flask_success_response(
                data={
                    'cloudPath': result.get('cloudPath'),
                    'uploadParams': result.get('uploadParams'),
                },
                message="上传参数已生成"
            )
        else:
            return flask_error_response(result.get('message', "文件验证失败"), 400)
            
    except Exception as e:
        logger.error(f"准备上传失败: {e}", exc_info=True)
        return flask_error_response("上传准备失败", 500)


@inquiry_bp.route('/upload/confirm', methods=['POST'])
@require_auth
def confirm_file_upload():
    """
    确认文件上传完成
    
    前端在微信云存储上传成功后，调用此接口记录上传信息
    """
    try:
        data = request.json or {}
        cloud_path = data.get('cloudPath', '')
        file_id = data.get('fileId', '')
        
        if not cloud_path:
            return flask_error_response("云存储路径不能为空", 400)
        
        from services.file_upload_service import file_upload_service
        
        result = file_upload_service.confirm_upload(cloud_path, file_id)
        
        if result.get('success'):
            logger.info(f"文件上传确认成功: {cloud_path}")
            return flask_success_response(
                data={
                    'cloudPath': cloud_path,
                    'fileId': file_id,
                    'url': result.get('url', ''),
                },
                message="上传确认成功"
            )
        else:
            return flask_error_response(result.get('message', "确认失败"), 500)
            
    except Exception as e:
        logger.error(f"确认上传失败: {e}", exc_info=True)
        return flask_error_response("确认失败", 500)


@inquiry_bp.route('/upload/download-url', methods=['POST'])
@require_auth
def get_file_download_url():
    """
    获取文件下载链接

    前端调用此接口获取临时下载链接
    """
    try:
        data = request.json or {}
        file_id = data.get('fileId', '')

        if not file_id:
            return flask_error_response("文件ID不能为空", 400)

        from services.file_upload_service import file_upload_service

        result = file_upload_service.get_download_url(file_id)

        return flask_success_response(
            data=result,
            message="请使用微信云开发API获取下载链接"
        )

    except Exception as e:
        logger.error(f"获取下载链接失败: {e}", exc_info=True)
        return flask_error_response("获取失败", 500)


# ==================== 智能推荐API ====================

@inquiry_bp.route('/recommend/strike-price', methods=['POST'])
def recommend_strike_price():
    """
    智能推荐执行价格

    根据当前股价、期权类型和期限推荐合理的执行价格范围
    """
    try:
        data = request.json or {}
        current_price = data.get('currentPrice')
        option_type = data.get('optionType', 'call')
        term = data.get('term', '1M')
        volatility = data.get('volatility')

        if not current_price:
            return flask_error_response("当前价格不能为空", 400)

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.recommend_strike_price(
            current_price=float(current_price),
            option_type=option_type,
            volatility=float(volatility) if volatility else None,
            term=term
        )

        return flask_success_response(data=result, message="推荐成功")

    except ValueError as e:
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"执行价推荐失败: {e}", exc_info=True)
        return flask_error_response("推荐失败", 500)


@inquiry_bp.route('/recommend/term', methods=['POST'])
def recommend_term():
    """
    智能推荐期限

    根据投资期限偏好、市场观点和风险承受能力推荐期限
    """
    try:
        data = request.json or {}
        investment_horizon = data.get('investmentHorizon', 'medium')
        market_view = data.get('marketView', 'neutral')
        risk_tolerance = data.get('riskTolerance', 'medium')

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.recommend_term(
            investment_horizon=investment_horizon,
            market_view=market_view,
            risk_tolerance=risk_tolerance
        )

        return flask_success_response(data=result, message="推荐成功")

    except Exception as e:
        logger.error(f"期限推荐失败: {e}", exc_info=True)
        return flask_error_response("推荐失败", 500)


@inquiry_bp.route('/recommend/strategy', methods=['POST'])
def recommend_strategy():
    """
    智能推荐策略类型

    根据市场观点、波动率预期和风险偏好推荐策略
    """
    try:
        data = request.json or {}
        market_view = data.get('marketView', 'neutral')
        volatility_expectation = data.get('volatilityExpectation', 'medium')
        risk_profile = data.get('riskProfile', 'balanced')

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.recommend_strategy(
            market_view=market_view,
            volatility_expectation=volatility_expectation,
            risk_profile=risk_profile
        )

        return flask_success_response(data=result, message="推荐成功")

    except Exception as e:
        logger.error(f"策略推荐失败: {e}", exc_info=True)
        return flask_error_response("推荐失败", 500)


@inquiry_bp.route('/recommend/dealers', methods=['POST'])
def match_dealers():
    """
    智能匹配交易商

    根据产品类型、名义本金和紧急程度匹配最合适的交易商
    """
    try:
        data = request.json or {}
        product_type = data.get('productType', 'equity')
        notional_amount = data.get('notionalAmount', 100)
        urgency = data.get('urgency', 'normal')
        preferred_dealers = data.get('preferredDealers', [])

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.match_dealers(
            product_type=product_type,
            notional_amount=float(notional_amount),
            urgency=urgency,
            preferred_dealers=preferred_dealers
        )

        return flask_success_response(data=result, message="匹配成功")

    except Exception as e:
        logger.error(f"交易商匹配失败: {e}", exc_info=True)
        return flask_error_response("匹配失败", 500)


@inquiry_bp.route('/market/sentiment', methods=['GET'])
def get_market_sentiment():
    """
    获取市场情绪分析

    返回指定产品的市场情绪指标
    """
    try:
        product_code = request.args.get('productCode', '')

        if not product_code:
            return flask_error_response("产品代码不能为空", 400)

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.analyze_market_sentiment(product_code)

        return flask_success_response(data=result, message="分析成功")

    except Exception as e:
        logger.error(f"市场情绪分析失败: {e}", exc_info=True)
        return flask_error_response("分析失败", 500)


@inquiry_bp.route('/estimate/price', methods=['POST'])
def estimate_price():
    """
    估算期权价格范围

    使用Black-Scholes模型估算期权费范围
    """
    try:
        data = request.json or {}
        product_code = data.get('productCode', '')
        option_type = data.get('optionType', 'call')
        strike_price = data.get('strikePrice', 100)
        term = data.get('term', '1M')
        notional_amount = data.get('notionalAmount', 100)
        structure = data.get('structure', 'vanilla')

        if not product_code:
            return flask_error_response("产品代码不能为空", 400)

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.estimate_price_range(
            product_code=product_code,
            option_type=option_type,
            strike_price=float(strike_price),
            term=term,
            notional_amount=float(notional_amount),
            structure=structure
        )

        return flask_success_response(data=result, message="估算成功")

    except ValueError as e:
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"价格估算失败: {e}", exc_info=True)
        return flask_error_response("估算失败", 500)


@inquiry_bp.route('/greeks', methods=['POST'])
def calculate_greeks():
    """
    计算希腊字母

    返回Delta、Gamma、Theta、Vega、Rho等风险指标
    """
    try:
        data = request.json or {}
        spot_price = data.get('spotPrice')
        strike_price = data.get('strikePrice', 100)
        term = data.get('term', '1M')
        option_type = data.get('optionType', 'call')
        volatility = data.get('volatility', 0.25)

        if not spot_price:
            return flask_error_response("现价不能为空", 400)

        from services.inquiry_recommendation_service import recommendation_service

        result = recommendation_service.calculate_greeks(
            spot_price=float(spot_price),
            strike_price=float(strike_price),
            term=term,
            risk_free_rate=0.03,
            volatility=float(volatility),
            option_type=option_type
        )

        return flask_success_response(data=result, message="计算成功")

    except ValueError as e:
        return flask_error_response(str(e), 400)
    except Exception as e:
        logger.error(f"希腊字母计算失败: {e}", exc_info=True)
        return flask_error_response("计算失败", 500)


@inquiry_bp.route('/cache/stats', methods=['GET'])
@require_auth
def get_cache_stats():
    """
    获取缓存统计信息

    管理员可查看缓存命中率等指标
    """
    try:
        from services.inquiry_cache_service import inquiry_cache_service

        stats = inquiry_cache_service.get_statistics()

        return flask_success_response(data=stats, message="获取成功")

    except Exception as e:
        logger.error(f"获取缓存统计失败: {e}", exc_info=True)
        return flask_error_response("获取失败", 500)


@inquiry_bp.route('/cache/clear', methods=['POST'])
@require_auth
def clear_cache():
    """
    清除缓存

    管理员可手动清除缓存
    """
    try:
        from services.inquiry_cache_service import inquiry_cache_service

        inquiry_cache_service.clear()

        return flask_success_response(message="缓存已清除")

    except Exception as e:
        logger.error(f"清除缓存失败: {e}", exc_info=True)
        return flask_error_response("清除失败", 500)


# ==================== 归档管理API ====================

@inquiry_bp.route('/admin/archive/run', methods=['POST'])
@require_auth
@rate_limit(max_requests=5, window_seconds=3600, key_func=_get_rate_limit_key)
def run_archive():
    """
    执行归档任务

    管理员可手动触发归档，建议配置定时任务自动执行
    """
    try:
        data = request.json or {}
        status = data.get('status')  # completed, rejected, expired
        days_old = data.get('daysOld')  # 归档多少天前的数据
        dry_run = data.get('dryRun', False)  # 仅统计不实际归档

        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_client = getattr(current_app, "cloud_client", None)

        from services.inquiry_archive_service import InquiryArchiveService

        service = InquiryArchiveService(db, cloud_client)
        result = service.archive_inquiries(
            status=status,
            days_old=days_old,
            dry_run=dry_run
        )

        logger.info(f"归档任务执行: status={status}, result={result}")

        return flask_success_response(data=result, message="归档任务执行完成")

    except Exception as e:
        logger.error(f"归档任务失败: {e}", exc_info=True)
        return flask_error_response("归档任务执行失败", 500)


@inquiry_bp.route('/admin/archive/statistics', methods=['GET'])
@require_auth
def get_archive_statistics():
    """获取归档统计信息"""
    try:
        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_client = getattr(current_app, "cloud_client", None)

        from services.inquiry_archive_service import InquiryArchiveService

        service = InquiryArchiveService(db, cloud_client)
        stats = service.get_archive_statistics()

        return flask_success_response(data=stats, message="获取成功")

    except Exception as e:
        logger.error(f"获取归档统计失败: {e}", exc_info=True)
        return flask_error_response("获取失败", 500)


@inquiry_bp.route('/admin/archive/restore/<inquiry_id>', methods=['POST'])
@require_auth
def restore_archived_inquiry(inquiry_id):
    """从归档恢复询价记录"""
    try:
        if not inquiry_id:
            return flask_error_response("询价ID不能为空", 400)

        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_client = getattr(current_app, "cloud_client", None)

        from services.inquiry_archive_service import InquiryArchiveService

        service = InquiryArchiveService(db, cloud_client)
        success = service.restore_inquiry(inquiry_id)

        if success:
            logger.info(f"归档记录已恢复: {inquiry_id}")
            return flask_success_response(message="恢复成功")
        else:
            return flask_error_response("恢复失败，记录可能不存在", 404)

    except Exception as e:
        logger.error(f"恢复归档记录失败: {e}", exc_info=True)
        return flask_error_response("恢复失败", 500)


@inquiry_bp.route('/admin/archive/list', methods=['GET'])
@require_auth
def list_archived_inquiries():
    """查询归档数据列表"""
    try:
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('pageSize', 20, type=int)
        status = request.args.get('status')
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')

        ensure_db = getattr(current_app, "ensure_db", None)
        db = ensure_db() if callable(ensure_db) else getattr(current_app, "db", None)
        cloud_client = getattr(current_app, "cloud_client", None)

        from services.inquiry_archive_service import InquiryArchiveService

        service = InquiryArchiveService(db, cloud_client)
        items, total = service.query_archived(
            page=page,
            page_size=page_size,
            status=status,
            start_date=start_date,
            end_date=end_date
        )

        return flask_paginated_response(
            data=items,
            page=page,
            per_page=page_size,
            total=total
        )

    except Exception as e:
        logger.error(f"查询归档数据失败: {e}", exc_info=True)
        return flask_error_response("查询失败", 500)