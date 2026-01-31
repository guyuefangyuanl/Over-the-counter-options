#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
测试项目依赖是否正确安装
"""

print("正在测试项目依赖...")

try:
    import flask
    print(f"✅ Flask 版本: {flask.__version__}")
except ImportError as e:
    print(f"❌ Flask 导入失败: {e}")

try:
    import flask_cors
    print("✅ Flask-CORS 导入成功")
except ImportError as e:
    print(f"❌ Flask-CORS 导入失败: {e}")

try:
    import pymongo
    print(f"✅ PyMongo 版本: {pymongo.version}")
except ImportError as e:
    print(f"❌ PyMongo 导入失败: {e}")

try:
    import openpyxl
    print(f"✅ OpenPyXL 版本: {openpyxl.__version__}")
except ImportError as e:
    print(f"❌ OpenPyXL 导入失败: {e}")

try:
    import akshare
    print(f"✅ AKShare 版本: {akshare.__version__}")
except ImportError as e:
    print(f"❌ AKShare 导入失败: {e}")

try:
    import requests
    print(f"✅ Requests 版本: {requests.__version__}")
except ImportError as e:
    print(f"❌ Requests 导入失败: {e}")

try:
    import dotenv
    print("✅ python-dotenv 导入成功")
except ImportError as e:
    print(f"❌ python-dotenv 导入失败: {e}")

try:
    from services.cloud_db import CloudDbClient
    print("✅ CloudDbClient 导入成功")
except ImportError as e:
    print(f"❌ CloudDbClient 导入失败: {e}")

print("\n依赖测试完成！")