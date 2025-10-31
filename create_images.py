#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
创建小程序所需的默认图片文件
解决图片资源500错误问题
"""

import os
import base64

# 图片目录
images_dir = 'images'

# 确保目录存在
if not os.path.exists(images_dir):
    os.makedirs(images_dir)

# 1x1像素透明PNG的base64数据
DEFAULT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA6dp+nwAAAABJRU5ErkJggg=='

# 需要创建的图片列表（根据错误信息）
image_list = [
    # 原有的图片
    'avatar-default.png',
    'refresh.png', 
    'quote.png',
    'calculator.png',
    'inquiry.png',
    'position.png',
    'analysis.png',
    'news.png',
    'warning.png',
    # 其他可能需要的图片
    'default-avatar.png',
    'home.png',
    'profile.png',
    'back.png',
    'arrow-right.png',
    'info.png',
    
    # 新增的系统图标
    'signal1.png',
    'signal2.png',
    'battery.png',
    'dropdown-down.png',
    'account-active.png',
    
    # 新增的登录页面图标
    'logo.png',
    'wechat-icon.png',
    'wechat-white.png',
    'phone-icon.png',
    'guest-icon.png',
    'help.png',
    'service.png'
]

def create_default_images():
    """创建默认图片文件"""
    print("🚀 开始创建默认图片文件...")
    
    success_count = 0
    
    for filename in image_list:
        try:
            # 解码base64数据
            image_data = base64.b64decode(DEFAULT_PNG_BASE64)
            
            # 创建文件路径
            file_path = os.path.join(images_dir, filename)
            
            # 写入文件
            with open(file_path, 'wb') as f:
                f.write(image_data)
            
            print(f"✅ 创建成功: {filename}")
            success_count += 1
            
        except Exception as e:
            print(f"❌ 创建失败 {filename}: {str(e)}")
    
    print(f"\n🎉 完成! 成功创建 {success_count}/{len(image_list)} 个图片文件")
    print(f"📁 图片目录: {os.path.abspath(images_dir)}")
    print("💡 提示: 这些是1x1像素的透明PNG占位图，你可以后续替换为实际图标")

if __name__ == '__main__':
    create_default_images()