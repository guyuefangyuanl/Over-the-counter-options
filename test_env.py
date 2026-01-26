import os
from dotenv import load_dotenv

load_dotenv()

print("=== 环境变量检查 ===")
print(f"WX_APPID: {os.getenv('WX_APPID')}")
print(f"WX_SECRET: {os.getenv('WX_SECRET')}")
print(f"WX_CLOUD_ENV: {os.getenv('WX_CLOUD_ENV')}")

# 测试云数据库初始化
try:
    from services.cloud_db import CloudDbClient
    client = CloudDbClient.from_env()
    print("\n✅ 云数据库客户端初始化成功!")
    print(f"环境ID: {client._env_id}")
except Exception as e:
    print(f"\n❌ 云数据库初始化失败: {e}")
