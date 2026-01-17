from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from models.group import GroupModel
# from routes.auth import require_auth # Assuming auth is handled or we mock it for now

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

# Mock auth for now if not available, or retrieve user_id from header/token
def get_current_user_id():
    # In a real app, this comes from JWT or session
    # For now, we assume a default user or get from header 'X-User-ID'
    return request.headers.get('X-User-ID', 'default_user')

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
def create_group():
    try:
        data = request.json
        if not data or not data.get('name'):
            return flask_error_response("分组名称不能为空", 400)
        if is_protected_group_name(data.get("name")):
            return flask_error_response("该分组名称为系统保留名称，无法创建", 400)
            
        creator_id = get_current_user_id()
        data['creator_id'] = creator_id
        
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
            
        group_id = model.create_group(data)
        
        return flask_success_response(data={"id": group_id}, message="创建成功")
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups', methods=['GET'])
def get_groups():
    try:
        creator_id = get_current_user_id()
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
        if group['creator_id'] != get_current_user_id():
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
        if group['creator_id'] != get_current_user_id():
            return flask_error_response("无权删除", 403)
        if is_protected_group_name(group.get("name")):
            return flask_error_response("系统保护分组不可删除", 403)

        current_app.logger.info(
            "delete_group user=%s group_id=%s remove_favorites=%s members_count=%s",
            get_current_user_id(),
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
        if group['creator_id'] != get_current_user_id():
            return flask_error_response("无权操作", 403)
            
        success = model.add_member(group_id, data)
        if success:
            return flask_success_response(message="添加成功")
        else:
            return flask_error_response("添加失败或已存在", 400)
    except Exception as e:
        return flask_error_response(str(e), 500)

@group_bp.route('/groups/<group_id>/members/<stock_code>', methods=['DELETE'])
def remove_member(group_id, stock_code):
    try:
        model = get_model()
        if not model.db and not model.cloud_client:
            return flask_error_response("数据库未连接", 503)
        
        # Check permission
        group = model.get_group_by_id(group_id)
        if not group:
            return flask_error_response("分组不存在", 404)
        if group['creator_id'] != get_current_user_id():
            return flask_error_response("无权操作", 403)
            
        success = model.remove_member(group_id, stock_code)
        if success:
            return flask_success_response(message="移除成功")
        else:
            return flask_error_response("移除失败", 500)
    except Exception as e:
        return flask_error_response(str(e), 500)
