#!/usr/bin/env python3
"""
初始化管理员账户到数据库
运行命令：python init_admin.py
"""
import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient
from services.auth_service import AuthService

# 加载环境变量
load_dotenv('.env.production')

def init_admin():
    """初始化管理员账户"""
    print("\n" + "="*60)
    print("🔐 初始化管理员账户")
    print("="*60 + "\n")
    
    # 连接数据库
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/option_data')
    db_name = os.getenv('DATABASE_NAME', 'option_trading')
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client[db_name]
        print("✅ 数据库连接成功\n")
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        return
    
    # 获取管理员信息
    admin_username = os.getenv('ADMIN_USERNAME', 'admin')
    admin_password = input(f"请输入管理员密码 (留空使用环境变量): ").strip()
    
    if not admin_password:
        admin_password = os.getenv('ADMIN_PASSWORD', 'admin123')
        print(f"⚠️ 使用环境变量密码: {admin_password}")
    
    # 验证密码强度
    auth_service = AuthService(db=None, cloud_client=None)
    is_valid, error_msg = auth_service._validate_password_strength(admin_password)
    
    if not is_valid:
        print(f"\n❌ 密码强度不足: {error_msg}")
        print("建议：至少8位，包含大小写字母、数字和特殊字符")
        return
    
    # 生成密码哈希
    password_hash = auth_service._hash_password(admin_password)
    
    # 检查管理员是否已存在
    admin_collection = db['admin_users']
    existing_admin = admin_collection.find_one({'username': admin_username})
    
    if existing_admin:
        print(f"\n⚠️ 管理员账户 '{admin_username}' 已存在")
        update = input("是否更新密码？(y/n): ").strip().lower()
        
        if update == 'y':
            result = admin_collection.update_one(
                {'username': admin_username},
                {'$set': {
                    'password_hash': password_hash,
                    'updated_at': auth_service._now()
                }}
            )
            if result.modified_count > 0:
                print(f"✅ 管理员密码已更新")
            else:
                print(f"❌ 更新失败")
        else:
            print("❌ 操作已取消")
    else:
        # 创建新管理员
        admin_data = {
            'username': admin_username,
            'password_hash': password_hash,
            'role': 'admin',
            'email': input("请输入管理员邮箱（可选）: ").strip() or None,
            'created_at': auth_service._now(),
            'updated_at': auth_service._now(),
            'is_active': True
        }
        
        result = admin_collection.insert_one(admin_data)
        print(f"\n✅ 管理员账户创建成功")
        print(f"   用户名: {admin_username}")
        print(f"   ID: {result.inserted_id}")
    
    # 显示登录信息
    print("\n" + "="*60)
    print("📋 登录信息")
    print("="*60)
    print(f"用户名: {admin_username}")
    print(f"密码: {'*' * len(admin_password)}")
    print(f"角色: admin")
    print("="*60 + "\n")
    
    print("✅ 初始化完成！现在可以使用以下方式登录：")
    print("   1. 管理后台: http://localhost:5002/admin")
    print("   2. API接口: POST /api/v1/auth/login")
    print()

if __name__ == "__main__":
    try:
        init_admin()
    except KeyboardInterrupt:
        print("\n\n❌ 操作已取消")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 初始化失败: {e}")
        sys.exit(1)
