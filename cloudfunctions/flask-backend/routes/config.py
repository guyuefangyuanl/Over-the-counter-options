# -*- coding: utf-8 -*-
"""
配置管理路由
提供系统配置的查询和管理功能
"""
from flask import Blueprint, request, jsonify, current_app
from backend_utils.response import flask_success_response, flask_error_response
from bson import ObjectId
from datetime import datetime

config_bp = Blueprint('config', __name__)

@config_bp.route('/configs', methods=['GET'])
def get_configs():
    """获取系统配置列表"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        category = request.args.get('category', 'system')
        
        collection = db['system_configs']
        configs = list(collection.find({'category': category}))
        
        items = []
        for cfg in configs:
            items.append({
                '_id': str(cfg['_id']),
                'key': cfg.get('key', ''),
                'value': cfg.get('value', ''),
                'category': cfg.get('category', 'system'),
                'description': cfg.get('description', ''),
                'updatedAt': cfg.get('updatedAt', datetime.now()).isoformat(),
            })
        
        return flask_success_response(
            data={'items': items},
            message='获取系统配置成功'
        )
    except Exception as e:
        current_app.logger.error(f'获取系统配置失败: {e}')
        return flask_error_response(str(e), code=500)

@config_bp.route('/configs/<config_id>', methods=['PUT'])
def update_config(config_id):
    """更新系统配置"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        if 'value' not in data:
            return flask_error_response('缺少必填字段: value', code=400)
        
        update_data = {
            'value': data['value'],
            'updatedAt': datetime.now()
        }
        
        collection = db['system_configs']
        result = collection.update_one(
            {'_id': ObjectId(config_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return flask_error_response('配置不存在', code=404)
        
        return flask_success_response(message='更新系统配置成功')
    except Exception as e:
        current_app.logger.error(f'更新系统配置失败: {e}')
        return flask_error_response(str(e), code=500)

@config_bp.route('/configs', methods=['POST'])
def create_config():
    """创建系统配置"""
    try:
        db = current_app.db
        if not db:
            return flask_error_response('数据库未连接', code=503)
        
        data = request.json
        
        # 验证必填字段
        required_fields = ['key', 'value', 'category']
        for field in required_fields:
            if field not in data:
                return flask_error_response(f'缺少必填字段: {field}', code=400)
        
        # 检查配置键是否已存在
        collection = db['system_configs']
        existing = collection.find_one({'key': data['key'], 'category': data['category']})
        if existing:
            return flask_error_response('该配置键已存在', code=400)
        
        # 创建配置记录
        config = {
            'key': data['key'],
            'value': data['value'],
            'category': data['category'],
            'description': data.get('description', ''),
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        }
        
        result = collection.insert_one(config)
        
        return flask_success_response(
            data={'_id': str(result.inserted_id)},
            message='创建系统配置成功'
        )
    except Exception as e:
        current_app.logger.error(f'创建系统配置失败: {e}')
        return flask_error_response(str(e), code=500)
