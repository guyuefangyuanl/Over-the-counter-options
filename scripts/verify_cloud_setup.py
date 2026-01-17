import os
import json
import logging
from dotenv import load_dotenv
import requests

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def verify_setup():
    logger.info("开始校验云数据库环境配置...")
    
    # 1. 加载环境变量
    env_paths = [".env.local", ".env"]
    loaded = False
    for path in env_paths:
        if os.path.exists(path):
            load_dotenv(path, override=True)
            logger.info(f"已加载环境变量文件: {path}")
            loaded = True
            break
    
    if not loaded:
        logger.warning("未找到 .env 或 .env.local 文件，将使用当前环境中的变量")

    # 2. 检查关键变量
    env_id = os.getenv("WX_CLOUD_ENV")
    appid = os.getenv("WX_APPID") or os.getenv("WECHAT_APPID")
    secret = os.getenv("WX_SECRET") or os.getenv("WECHAT_SECRET")
    
    if not env_id or "your_" in env_id:
        logger.error("❌ 环境变量 WX_CLOUD_ENV 未正确配置")
    else:
        logger.info(f"✅ WX_CLOUD_ENV: {env_id}")
        
    if not appid or "your_" in appid:
        logger.error("❌ 环境变量 WX_APPID 未正确配置")
    else:
        logger.info(f"✅ WX_APPID: {appid}")
        
    if not secret or "your_" in secret:
        logger.error("❌ 环境变量 WX_SECRET 未正确配置")
    else:
        logger.info("✅ WX_SECRET: 已设置")

    if not all([env_id, appid, secret]) or any("your_" in x for x in [env_id or "", appid or "", secret or ""]):
        logger.error("终止校验：请先在 .env 文件中填入真实的微信云开发信息")
        return

    # 3. 获取 Access Token
    logger.info("正在尝试获取微信 Access Token...")
    try:
        token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={appid}&secret={secret}"
        resp = requests.get(token_url, timeout=10)
        data = resp.json()
        if "access_token" in data:
            access_token = data["access_token"]
            logger.info("✅ Access Token 获取成功")
        else:
            logger.error(f"❌ Access Token 获取失败: {data.get('errmsg', '未知错误')}")
            return
    except Exception as e:
        logger.error(f"❌ 网络请求异常: {e}")
        return

    # 4. 检查集合
    collections = ["quotes", "groups", "inquiries", "orders"]
    logger.info(f"开始检查以下集合是否存在: {', '.join(collections)}")
    
    base_url = f"https://api.weixin.qq.com/tcb/databasequery?access_token={access_token}"
    
    for coll in collections:
        query = f'db.collection("{coll}").limit(1).get()'
        payload = {
            "env": env_id,
            "query": query
        }
        try:
            resp = requests.post(base_url, json=payload, timeout=10)
            res_data = resp.json()
            errcode = res_data.get("errcode")
            errmsg = res_data.get("errmsg", "")
            
            if errcode == 0:
                logger.info(f"✅ 集合 '{coll}': 已存在")
            elif "Db or Table not exist" in errmsg or "[ResourceNotFound]" in errmsg:
                logger.error(f"❌ 集合 '{coll}': 不存在！请在云开发控制台中手动创建")
            else:
                logger.warning(f"⚠️ 集合 '{coll}': 检查返回异常 ({errcode}): {errmsg}")
        except Exception as e:
            logger.error(f"❌ 检查集合 '{coll}' 时发生异常: {e}")

    logger.info("\n--- 校验完成 ---")
    logger.info("权限说明：请确保以上集合在云开发控制台中的权限设置为 '所有用户可读，仅创建者可写' 或根据需求设置为 '所有用户可读写'")

if __name__ == "__main__":
    verify_setup()
