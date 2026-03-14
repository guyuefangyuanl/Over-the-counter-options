# -*- coding: utf-8 -*-
"""
消息管理路由
提供系统消息的发送、查询等功能
"""
from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime

message_bp = Blueprint('message', __name__)

@message_bp.route('/messages', methods=['GET'])
def get_messages():
    """获取消息列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        page = int(request.args.get('page', 1))
        page_size = int(request.args.get('pageSize', 10))
        
        # 构建查询条件
        query = {}
        msg_type = request.args.get('type')
        if msg_type:
            query['type'] = msg_type
        
        # 执行查询
        collection = db['messages']
        total = collection.count_documents(query)
        
        messages = list(collection.find(query)
                       .sort('createdAt', -1)
                       .skip((page - 1) * page_size)
                       .limit(page_size))
        
        # 格式化响应
        items = []
        for msg in messages:
            items.append({
                '_id': str(msg['_id']),
                'type': msg.get('type', 'system'),
                'title': msg.get('title', ''),
                'content': msg.get('content', ''),
                'targetType': msg.get('targetType', 'all'),
                'targetIds': msg.get('targetIds', []),
                'status': msg.get('status', 'pending'),
                'readCount': msg.get('readCount', 0),
                'totalCount': msg.get('totalCount', 0),
                'createdAt': msg.get('createdAt', datetime.now()).isoformat(),
            })
        
        return flask_success_response(
            data={
                'items': items,
                'pagination': {
                    'page': page,
                    'per_page': page_size,
                    'total': total,
                }
            },
            message='获取消息列表成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取消息列表失败: {e}')
        return flask_error_response(str(e), code=500)

@message_bp.route('/messages', methods=['POST'])
def create_message():
    """创建消息"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['title', 'content', 'targetType']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        # 创建消息记录
        message = {
            'type': data.get('type', 'system'),
            'title': data['title'],
            'content': data['content'],
            'targetType': data['targetType'],  # all, group, user
            'targetIds': data.get('targetIds', []),
            'status': 'pending',
            'readCount': 0,
            'totalCount': 0,
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        
        collection = db['messages']
        result = collection.insert_one(message)
        
        return flask_success_response(
            data={'_id': str(result.inserted_id)},
            message='创建消息成功'
        )
    except Exception as e:
        current_app.logger.error(f'创建消息失败: {e}')
        return flask_error_response(str(e), code=500)

@message_bp.route('/message-templates', methods=['GET'])
def get_message_templates():
    """获取消息模板列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        collection = db['message_templates']
        templates = list(collection.find().sort('createdAt', -1))
        
        items = []
        for tpl in templates:
            items.append({
                '_id': str(tpl['_id']),
                'name': tpl.get('name', ''),
                'type': tpl.get('type', 'system'),
                'title': tpl.get('title', ''),
                'content': tpl.get('content', ''),
                'variables': tpl.get('variables', []),
                'createdAt': tpl.get('createdAt', datetime.now()).isoformat(),
            })
        
        return flask_success_response(
            data={'items': items},
            message='获取消息模板成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取消息模板失败: {e}')
        return flask_error_response(str(e), code=500)

@message_bp.route('/message-templates', methods=['POST'])
def create_message_template():
    """创建消息模板"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['name', 'title', 'content']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        # 创建模板记录
        template = {
            'name': data['name'],
            'type': data.get('type', 'system'),
            'title': data['title'],
            'content': data['content'],
            'variables': data.get('variables', []),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        
        collection = db['message_templates']
        result = collection.insert_one(template)
        
        return flask_success_response(
            data={'_id': str(result.inserted_id)},
            message='创建消息模板成功'
        )
    except Exception as e:
        current_app.logger.error(f'创建消息模板失败: {e}')
        return flask_error_response(str(e), code=500)
