#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简单的静态文件服务器
用于临时提供图片和静态资源服务
"""

import http.server
import socketserver
import os
import mimetypes
import json
import uuid
from urllib.parse import urlparse
from pathlib import Path

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)
    
    def do_GET(self):
        path = urlparse(self.path).path
        
        # 处理CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        # 处理图片请求
        if path.startswith('/images/'):
            self.handle_image_request(path)
        elif path == '/health':
            self.handle_health_check()
        elif path == '/':
            self.handle_root()
        else:
            super().do_GET()
    
    def do_POST(self):
        path = urlparse(self.path).path
        
        # 处理CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        if path == '/api/auth/wechat/login':
            self.handle_wechat_login()
        elif path == '/api/user/update':
            self.handle_user_update()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "message": "接口不存在"}).encode('utf-8'))
    
    def do_OPTIONS(self):
        # 处理预检请求
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def handle_wechat_login(self):
        """处理微信登录请求"""
        try:
            # 读取请求体
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # 模拟登录逻辑
            code = data.get('code')
            user_info = data.get('userInfo', {})
            
            if not code:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "message": "缺少登录凭证(code)"
                }).encode('utf-8'))
                return
            
            # 生成模拟数据
            token = f"token_{uuid.uuid4().hex}"
            user_id = str(uuid.uuid4().int)[:8]
            openid = f"openid_{uuid.uuid4().hex[:20]}"
            
            response_data = {
                "success": True,
                "data": {
                    "token": token,
                    "userId": user_id,
                    "openid": openid,
                    "userInfo": {
                        "nickName": user_info.get('nickName', '匿名用户'),
                        "avatarUrl": user_info.get('avatarUrl', ''),
                        "gender": user_info.get('gender', 0)
                    }
                }
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
            print(f"📱 微信登录成功: {user_info.get('nickName', '匿名用户')} ({openid})")
            
        except Exception as e:
            print(f"微信登录错误: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": "服务器内部错误"
            }).encode('utf-8'))
    
    def handle_user_update(self):
        """处理用户信息更新请求"""
        try:
            # 检查 Authorization 头
            auth_header = self.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "message": "未提供访问令牌"
                }).encode('utf-8'))
                return
            
            # 读取请求体
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            user_info = data.get('userInfo', {})
            
            response_data = {
                "success": True,
                "message": "更新成功"
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            
            print(f"✏️ 用户信息更新成功")
            
        except Exception as e:
            print(f"用户信息更新错误: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": False,
                "message": "服务器内部错误"
            }).encode('utf-8'))
    
    def handle_image_request(self, path):
        """处理图片请求"""
        filename = path.split('/')[-1]
        
        # 搜索图片的位置
        search_paths = [
            f'images/{filename}',
            f'images/首页/{filename}',
            f'images/我的/{filename}',
            f'images/工作台/{filename}',
            f'images/询价/{filename}',
            f'images/账户/{filename}',
            f'images/个股期权报价/{filename}',
            f'images/持仓列表/{filename}',
            f'images/结构_期限/{filename}',
            f'images/计算器/{filename}'
        ]
        
        # 查找文件
        for search_path in search_paths:
            if os.path.exists(search_path):
                self.serve_file(search_path)
                return
        
        # 如果找不到文件，返回默认SVG
        print(f"图片文件不存在: {filename}，返回默认图片")
        self.serve_default_image(filename)
    
    def serve_file(self, file_path):
        """提供文件服务"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            # 确定MIME类型
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'application/octet-stream'
            
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()
            self.wfile.write(content)
            
        except Exception as e:
            print(f"提供文件服务时出错: {e}")
            self.send_error(500, f"Internal server error: {e}")
    
    def serve_default_image(self, filename):
        """提供默认图片"""
        # 根据文件名返回不同的默认SVG
        default_images = {
            'default-avatar.svg': self.create_default_avatar(),
            'signal1.png': self.create_signal_icon(),
            'signal2.png': self.create_signal_icon(),
            'battery.png': self.create_battery_icon(),
            'back.png': self.create_arrow_icon(),
            'dropdown-down.png': self.create_arrow_icon(),
            'info.png': self.create_info_icon(),
            'arrow-right.png': self.create_arrow_icon(),
            'home.png': self.create_home_icon(),
            'inquiry.png': self.create_inquiry_icon(),
            'account-active.png': self.create_account_icon(),
            'profile.png': self.create_profile_icon()
        }
        
        if filename == 'default-avatar.png':
            # 为PNG头像返回SVG内容，但设置正确的MIME类型
            svg_content = self.create_default_avatar()
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Content-Length', str(len(svg_content)))
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()
            self.wfile.write(svg_content.encode('utf-8'))
        else:
            svg_content = default_images.get(filename, self.create_default_icon())
            
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Content-Length', str(len(svg_content)))
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()
            self.wfile.write(svg_content.encode('utf-8'))
    
    def handle_health_check(self):
        """健康检查"""
        health_data = {
            "status": "healthy",
            "service": "Static File Server",
            "timestamp": "2025-01-28T12:00:00Z"
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(health_data).encode('utf-8'))
    
    def handle_root(self):
        """根路径"""
        info_data = {
            "message": "简单静态文件服务器",
            "status": "running",
            "endpoints": {
                "images": "/images/",
                "health": "/health",
                "api": {
                    "wechat_login": "POST /api/auth/wechat/login",
                    "user_update": "POST /api/user/update"
                }
            }
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(info_data, ensure_ascii=False).encode('utf-8'))
    
    # SVG图标生成函数
    def create_default_icon(self):
        return '''<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" fill="#f0f0f0" rx="4"/>
            <circle cx="12" cy="12" r="4" fill="#ccc"/>
        </svg>'''
    
    def create_default_avatar(self):
        return '''<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="32" r="32" fill="#e0e0e0"/>
            <circle cx="32" cy="24" r="8" fill="#bbb"/>
            <path d="M16 52c0-8.837 7.163-16 16-16s16 7.163 16 16v4H16v-4z" fill="#bbb"/>
        </svg>'''
    
    def create_signal_icon(self):
        return '''<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="12" width="2" height="3" fill="#333"/>
            <rect x="4" y="10" width="2" height="5" fill="#333"/>
            <rect x="7" y="8" width="2" height="7" fill="#333"/>
            <rect x="10" y="6" width="2" height="9" fill="#333"/>
            <rect x="13" y="4" width="2" height="11" fill="#333"/>
        </svg>'''
    
    def create_battery_icon(self):
        return '''<svg width="24" height="12" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="2" width="20" height="8" stroke="#333" stroke-width="1" fill="none" rx="1"/>
            <rect x="21" y="4" width="2" height="4" fill="#333" rx="1"/>
            <rect x="2" y="3" width="16" height="6" fill="#4caf50" rx="1"/>
        </svg>'''
    
    def create_arrow_icon(self):
        return '''<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4l4 4-4 4" stroke="#666" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>'''
    
    def create_info_icon(self):
        return '''<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r="7" stroke="#007aff" stroke-width="1" fill="none"/>
            <circle cx="8" cy="5" r="1" fill="#007aff"/>
            <line x1="8" y1="7" x2="8" y2="11" stroke="#007aff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>'''
    
    def create_home_icon(self):
        return '''<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7l7-4 7 4v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="#666" stroke-width="1.5" fill="none"/>
            <polyline points="9,20 9,12 11,12 11,20" stroke="#666" stroke-width="1.5" fill="none"/>
        </svg>'''
    
    def create_inquiry_icon(self):
        return '''<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8" stroke="#007aff" stroke-width="1.5" fill="none"/>
            <path d="M10 6a4 4 0 00-4 4" stroke="#007aff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
            <circle cx="10" cy="14" r="1" fill="#007aff"/>
        </svg>'''
    
    def create_account_icon(self):
        return '''<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="7" r="4" stroke="#007aff" stroke-width="1.5" fill="none"/>
            <path d="M4 19v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="#007aff" stroke-width="1.5" fill="none"/>
        </svg>'''
    
    def create_profile_icon(self):
        return '''<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="6" r="3" stroke="#666" stroke-width="1.5" fill="none"/>
            <path d="M5 17v-1a4 4 0 014-4h2a4 4 0 014 4v1" stroke="#666" stroke-width="1.5" fill="none"/>
        </svg>'''

def main():
    PORT = 3001  # 更改为3001端口以匹配小程序配置
    
    try:
        # 切换到项目根目录
        project_root = os.path.dirname(os.path.abspath(__file__))
        os.chdir(project_root)
        
        print(f"📁 工作目录: {os.getcwd()}")
        print(f"🌐 启动简单静态文件服务器，端口: {PORT}")
        print(f"🔗 访问地址: http://localhost:{PORT}")
        print("📷 图片资源地址: http://localhost:3001/images/")
        print("❤️ 健康检查: http://localhost:3001/health")
        print("🔓 微信登录API: http://localhost:3001/api/auth/wechat/login")
        print("✏️ 用户更新API: http://localhost:3001/api/user/update")
        print("\n按 Ctrl+C 停止服务器")
        
        with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n🛑 服务器已停止")
    except Exception as e:
        print(f"❌ 启动服务器失败: {e}")

if __name__ == "__main__":
    main()