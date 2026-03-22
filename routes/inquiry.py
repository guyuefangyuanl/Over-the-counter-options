from flask import Blueprint, jsonify, request, current_app, g
import logging
import re
from datetime import datetime
from typing import Dict, Any, Optional

from backend_utils.response import flask_success_response, flask_error_response, flask_paginated_response
from routes.auth import require_auth
from services.trade_service import TradeService
from models.inquiry_status import InquiryStatus, InquiryStatusMachine, INQUIRY_STATUS_VALUES

logger = logging.getLogger(__name__)
inquiry_bp = Blueprint('inquiry', __name__)
trade_service = TradeService()


def _get_current_user_id() -> Optional[str]:
    """获取当前用户ID（从认证上下文）"""
    if hasattr(g, 'user') and g.user:
        return g.user.get('sub') or g.user.get('openid')
    if hasattr(g, 'admin') and g.admin:
        return g.admin.get('sub')
    return None


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
    if term and term not in ['1M', '2M', '3M', '6M', '1Y', 'custom']:
        return "期限格式不正确"

    return None


def _sanitize_inquiry_data(data: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    清理和规范化询价数据，由服务端生成关键字段

    Args:
        data: 原始数据
        user_id: 当前用户ID（从认证获取）

    Returns:
        规范化后的数据
    """
    now = datetime.utcnow().isoformat()

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
        "contactName": str(data.get('contactName', '')).strip(),
        "contactPhone": data.get('contactPhone') or data.get('phone', ''),
        "contactEmail": data.get('contactEmail', ''),
        "phone": data.get('contactPhone') or data.get('phone', ''),  # 保持兼容
        "notes": data.get('notes', ''),

        # 状态 - 由服务端设置
        "status": InquiryStatus.PENDING.value,

        # 时间 - 由服务端生成
        "createdAt": now,
        "updatedAt": now,

        # 用户信息 - 优先使用认证获取的用户ID
        "userId": user_id or data.get('userId', ''),
        "openid": user_id or data.get('openid', ''),
        "userName": data.get('userName') or data.get('contactName', '匿名用户'),

        # 来源
        "source": data.get('source', 'miniprogram'),
    }

    # 清理空值
    if not sanitized['strikePrice']:
        del sanitized['strikePrice']
    if not sanitized['contactEmail']:
        del sanitized['contactEmail']
    if not sanitized['notes']:
        del sanitized['notes']

    return sanitized


@inquiry_bp.route('/inquiry', methods=['POST'])
def create_inquiry():
    """
    提交询价

    安全策略：
    - 支持匿名提交（无需登录），但会验证手机号格式
    - 如果用户已登录，会使用认证的用户ID
    - 关键字段（status、createdAt、userId）由服务端生成
    """
    try:
        data = request.json

        # 数据验证
        validation_error = _validate_inquiry_data(data)
        if validation_error:
            return flask_error_response(validation_error, 400)

        # 获取当前用户ID（如果有认证）
        user_id = _get_current_user_id()

        # 规范化数据
        sanitized_data = _sanitize_inquiry_data(data, user_id)

        # 创建询价
        inquiry_id = trade_service.create_inquiry(sanitized_data)

        if inquiry_id:
            logger.info(f"询价创建成功: id={inquiry_id}, userId={user_id or 'anonymous'}, product={sanitized_data.get('productCode')}")
            return flask_success_response(data={"id": inquiry_id}, message="询价提交成功")
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
    """小程序用户：获取自己的询价列表"""
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
    """小程序用户：获取询价详情"""
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