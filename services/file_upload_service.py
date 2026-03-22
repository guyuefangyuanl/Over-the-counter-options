# -*- coding: utf-8 -*-
"""
文件上传服务
支持微信云存储和本地存储
"""
import os
import time
import uuid
import hashlib
import logging
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime

logger = logging.getLogger(__name__)

# 支持的文件类型
ALLOWED_EXTENSIONS = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
    'document': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    'spreadsheet': ['xls', 'xlsx', 'csv'],
}

# 文件大小限制 (字节)
MAX_FILE_SIZE = {
    'image': 10 * 1024 * 1024,      # 10MB
    'document': 50 * 1024 * 1024,   # 50MB
    'default': 20 * 1024 * 1024,    # 20MB
}


def get_file_extension(filename: str) -> str:
    """获取文件扩展名"""
    if not filename:
        return ''
    parts = filename.rsplit('.', 1)
    return parts[1].lower() if len(parts) > 1 else ''


def get_file_type(filename: str) -> str:
    """根据扩展名判断文件类型"""
    ext = get_file_extension(filename)
    for file_type, extensions in ALLOWED_EXTENSIONS.items():
        if ext in extensions:
            return file_type
    return 'default'


def validate_file(filename: str, file_size: int) -> Tuple[bool, str]:
    """
    验证文件
    
    Returns:
        (是否有效, 错误消息)
    """
    if not filename:
        return False, "文件名为空"
    
    ext = get_file_extension(filename)
    if not ext:
        return False, "无法识别文件类型"
    
    # 检查文件类型
    all_extensions = []
    for extensions in ALLOWED_EXTENSIONS.values():
        all_extensions.extend(extensions)
    
    if ext not in all_extensions:
        return False, f"不支持的文件类型: {ext}"
    
    # 检查文件大小
    file_type = get_file_type(filename)
    max_size = MAX_FILE_SIZE.get(file_type, MAX_FILE_SIZE['default'])
    
    if file_size > max_size:
        max_size_mb = max_size / (1024 * 1024)
        return False, f"文件大小超过限制 ({max_size_mb}MB)"
    
    return True, ""


def generate_cloud_path(filename: str, folder: str = "inquiries") -> str:
    """
    生成云存储路径
    
    Args:
        filename: 原始文件名
        folder: 存储文件夹
        
    Returns:
        云存储路径
    """
    # 生成唯一文件名
    timestamp = int(time.time() * 1000)
    random_id = uuid.uuid4().hex[:8]
    ext = get_file_extension(filename)
    
    # 按日期组织目录
    date_folder = datetime.now().strftime('%Y%m%d')
    
    safe_filename = f"{timestamp}_{random_id}.{ext}"
    return f"{folder}/{date_folder}/{safe_filename}"


def generate_upload_signature(cloud_path: str, expire_seconds: int = 3600) -> Dict[str, Any]:
    """
    生成上传签名（用于前端直传）
    
    注意：实际签名由微信云开发SDK在调用时生成
    这里返回必要的参数
    """
    return {
        'cloudPath': cloud_path,
        'expireAt': int(time.time()) + expire_seconds,
    }


class FileUploadService:
    """文件上传服务类"""
    
    def __init__(self):
        self.cloud_bucket = os.getenv('WX_CLOUD_BUCKET', '')
    
    def prepare_upload(self, filename: str, file_size: int, 
                       folder: str = "inquiries") -> Dict[str, Any]:
        """
        准备上传，返回上传参数
        
        Args:
            filename: 文件名
            file_size: 文件大小
            folder: 存储文件夹
            
        Returns:
            上传参数
        """
        # 验证文件
        valid, error_msg = validate_file(filename, file_size)
        if not valid:
            return {
                'success': False,
                'message': error_msg,
            }
        
        # 生成云存储路径
        cloud_path = generate_cloud_path(filename, folder)
        
        # 生成上传签名参数
        upload_params = generate_upload_signature(cloud_path)
        
        return {
            'success': True,
            'cloudPath': cloud_path,
            'uploadParams': upload_params,
            'message': '上传参数已生成',
        }
    
    def confirm_upload(self, cloud_path: str, file_id: str) -> Dict[str, Any]:
        """
        确认上传完成
        
        Args:
            cloud_path: 云存储路径
            file_id: 文件ID
            
        Returns:
            确认结果
        """
        # 这里可以记录上传日志到数据库
        return {
            'success': True,
            'cloudPath': cloud_path,
            'fileId': file_id,
            'url': f"cloud://{self.cloud_bucket}/{cloud_path}",
        }
    
    def get_download_url(self, file_id: str, expire_seconds: int = 3600) -> Dict[str, Any]:
        """
        获取下载链接
        
        Args:
            file_id: 文件ID
            expire_seconds: 链接有效期（秒）
            
        Returns:
            下载链接信息
        """
        # 实际的下载链接需要通过微信云开发SDK获取
        # 这里返回基本信息
        return {
            'success': True,
            'fileId': file_id,
            'expireAt': int(time.time()) + expire_seconds,
            'message': '请使用 wx.cloud.getTempFileURL 获取下载链接',
        }
    
    def delete_file(self, file_id: str) -> Dict[str, Any]:
        """
        删除文件
        
        Args:
            file_id: 文件ID
            
        Returns:
            删除结果
        """
        # 实际删除需要通过微信云开发SDK
        return {
            'success': True,
            'fileId': file_id,
            'message': '文件删除请求已提交',
        }


# 全局实例
file_upload_service = FileUploadService()