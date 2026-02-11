from flask import Blueprint, request, jsonify, current_app, g
from backend_utils.response import flask_success_response, flask_error_response
from models.group import GroupModel
from routes.auth import require_auth

group_bp = Blueprint('group', __name__)

PROTECTED_GROUP_NAMES = {
    "全部",
    "系统分组",
    "持仓",
    "我的持仓",
    "沪深",
    "指数",
}

def is_protected_group_name(name: str) -> bool:
    if not name:
        return False
    return str(name).strip() in PROTECTED_GROUP_NAMES

def get_current_user_id():
    """获取当前登录用户ID"""
    # 从 g.admin 中获取，由 require_auth 注入
    if hasattr(g, 'admin') and g.admin:
        return g.admin.get('sub')
    # 如果未通过 require_auth (理论上不应发生)，尝试从 header 获取 (仅供调试，生产环境应禁用)
    # return request.headers.get('X-User-ID', 'default_user')
    return None

def get_model():
    ensure_db = getattr(current_app, "ensure_db", None)
    db = None
    if callable(ensure_db):
        db = ensure_db()
    if db is None:
        db = getattr(current_app, "db", None)
    
    cloud_db = getattr(current_app, "cloud_db", None)
    return GroupModel(db, cloud_client=cloud_db)

@group_bp.route('/groups', methods=['POST'])
@require_auth
def create_group():
    try:
        creator_id = get_current_user_id()
        if not creator_id:
            return flask_error_response("未授权", 401)

        data = request.json
        if not data or not data.get('name'):
            return flask_error_response("分组名称不能为空", 400)
        if is_protected_group_name(data.get("name")):
            return flask_error_response("该分组名称为系统保留名称，无法创建", 400)
            
        data['creator_id'] = creator_id
        
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
            
        group_id = model.create_group(data)
        
        return flask_success_response(data={"id": group_id}, message="创建成功")
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups', methods=['GET'])
@require_auth
def get_groups():
    try:
        creator_id = get_current_user_id()
        if not creator_id:
            return flask_error_response("未授权", 401)

        model = get_model()
        
        # 记录请求
        current_app.logger.info(f"获取分组列表请求: user={creator_id}")
        
        if not model.db and not model.cloud_client:
            current_app.logger.warning("数据库连接均不可用（本地和云端），返回空分组列表")
            return flask_success_response(data=[], message="数据库未连接，返回空数据")
            
        groups = model.get_groups(creator_id)
        
        # 检查是否因为集合不存在导致的空列表，提供更明确的消息
        message = "获取成功"
        if not groups:
            # 如果没有数据，可能是真的没数据，也可能是集合不存在
            # 模型层已经处理了异常并返回空列表，这里可以根据日志判断
            current_app.logger.info(f"用户 {creator_id} 的分组列表为空")
        
        return flask_success_response(data=groups, message=message)
    except Exception as e:
        import traceback
        error_msg = str(e)
        full_traceback = traceback.format_exc()
        current_app.logger.error(f"获取分组列表接口异常: {error_msg}")
        current_app.logger.error(full_traceback)
        # 临时将 traceback 返回给前端以便调试
        return flask_error_response(
            message=f"接口调用失败: {error_msg}",
            code=500,
            data={"traceback": full_traceback}
        )

@group_bp.route('/groups/<group_id>', methods=['PUT'])
@require_auth
def update_group(group_id):
    try:
        data = request.json
        if data and "name" in data and is_protected_group_name(data.get("name")):
            return flask_error_response("该分组名称为系统保留名称，无法使用", 400)
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
        
        # Check permission
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
        
        creator_id = get_current_user_id()
        if group['creator_id'] != creator_id:
            # 允许管理员修改任何分组（可选）
            if g.admin.get('role') != 'admin':
                return flask_error_response("无权修改", 403)
                
        if is_protected_group_name(group.get("name")):
            return flask_error_response("系统保护分组不可重命名", 403)
            
        success = model.update_group(group_id, data)
        if success:
            return flask_success_response(message="更新成功")
        else:
            return flask_error_response("更新失败", 500)
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups/<group_id>', methods=['DELETE'])
@require_auth
def delete_group(group_id):
    try:
        remove_favorites_raw = request.args.get('remove_favorites')
        if remove_favorites_raw is None and request.is_json:
            body = request.get_json(silent=True) or {}
            remove_favorites_raw = body.get('remove_favorites')
            if remove_favorites_raw is None:
                remove_favorites_raw = body.get('removeFavorites')
        remove_favorites = str(remove_favorites_raw).strip().lower() in ("1", "true", "yes", "y", "on")

        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
        
        # Check permission
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
            
        creator_id = get_current_user_id()
        if group['creator_id'] != creator_id:
            if g.admin.get('role') != 'admin':
                return flask_error_response("无权删除", 403)
                
        if is_protected_group_name(group.get("name")):
            return flask_error_response("系统保护分组不可删除", 403)

        current_app.logger.info(
            "delete_group user=%s group_id=%s remove_favorites=%s members_count=%s",
            creator_id,
            group_id,
            remove_favorites,
            len(group.get("members") or []),
        )

        success = model.delete_group(group_id)
        if success:
            return flask_success_response(message="删除成功")
        else:
            return flask_error_response("删除失败", 500)
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups/<group_id>/members', methods=['POST'])
@require_auth
def add_member(group_id):
    try:
        data = request.json
        if not data or not data.get('stock_code'):
            return flask_error_response("股票代码不能为空", 400)
            
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
        
        # Check permission
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
            
        creator_id = get_current_user_id()
        if group['creator_id'] != creator_id:
            if g.admin.get('role') != 'admin':
                return flask_error_response("无权操作", 403)
            
        success = model.add_member(group_id, data)
        if success:
            return flask_success_response(message="添加成功")
        else:
            return flask_error_response("添加失败或已存在", 400)
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups/<group_id>/members/<stock_code>', methods=['DELETE'])
@require_auth
def remove_member(group_id, stock_code):
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
        
        # Check permission
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
            
        creator_id = get_current_user_id()
        if group['creator_id'] != creator_id:
            if g.admin.get('role') != 'admin':
                return flask_error_response("无权操作", 403)
            
        success = model.remove_member(group_id, stock_code)
        if success:
            return flask_success_response(message="移除成功")
        else:
            return flask_error_response("移除失败", 500)
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups/<group_id>/quotes', methods=['GET'])
@require_auth
def get_group_quotes(group_id):
    """获取分组内股票的实时行情"""
    try:
        from services.quote_service import QuoteService
        service = QuoteService()
        
        # 权限检查已经在 Service 中隐含（获取分组需要权限吗？通常需要）
        # 这里我们在 Route 层做权限检查更明确
        model = get_model()
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
            
        creator_id = get_current_user_id()
        # 允许查看自己的或者系统分组
        if group['creator_id'] != creator_id and not is_protected_group_name(group.get("name")):
             # 如果不是自己的且不是系统分组，检查是否是管理员
            if g.admin.get('role') != 'admin':
                return flask_error_response("无权查看", 403)

        quotes = service.get_group_quotes(group_id)
        return flask_success_response(data=quotes, message="获取成功")
    except Exception as e:
        current_app.logger.error(f"获取分组行情失败: {e}")
        return flask_error_response(str(e), 500)
