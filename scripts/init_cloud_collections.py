# -*- coding: utf-8 -*-
"""
微信云开发数据库集合初始化脚本
用于检查和提示需要在云开发控制台创建的数据库集合

使用方法：
1. 确保已配置环境变量 WX_CLOUD_ENV, WX_APPID, WX_SECRET
2. 运行此脚本检查集合状态
3. 根据提示在微信云开发控制台创建缺失的集合
"""
import os
import sys
import logging

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 定义项目需要的所有数据库集合
REQUIRED_COLLECTIONS = {
    'positions': {
        'description': '持仓数据',
        'indexes': ['customerId', 'productCode', 'status'],
        'required': True
    },
    'orders': {
        'description': '订单数据',
        'indexes': ['customerId', 'status'],
        'required': True
    },
    'inquiries': {
        'description': '询价数据',
        'indexes': ['customerId', 'status'],
        'required': True
    },
    'users': {
        'description': '用户数据',
        'indexes': ['openid'],
        'required': True
    },
    'admin_users': {
        'description': '管理员用户数据',
        'indexes': ['username'],
        'required': False
    },
    'customers': {
        'description': '客户数据',
        'indexes': ['openid'],
        'required': False
    },
    'transactions': {
        'description': '交易流水',
        'indexes': ['user_id'],
        'required': True
    },
    'settlements': {
        'description': '结算数据',
        'indexes': [],
        'required': False
    },
    'groups': {
        'description': '分组数据',
        'indexes': [],
        'required': False
    }
}


def check_env_vars():
    """检查必要的环境变量"""
    required_vars = ['WX_CLOUD_ENV', 'WX_APPID', 'WX_SECRET']
    missing = []
    placeholder_values = ['your_env_id_here', 'your_appid_here', 'your_secret_here']

    for var in required_vars:
        value = os.environ.get(var, '')
        if not value:
            missing.append(var)
        elif any(p in value for p in placeholder_values):
            logger.warning(f"环境变量 {var} 使用了占位符值，请设置实际值")

    if missing:
        logger.error(f"缺少必要的环境变量: {', '.join(missing)}")
        logger.info("请设置以下环境变量：")
        logger.info("  export WX_CLOUD_ENV=your_env_id")
        logger.info("  export WX_APPID=your_appid")
        logger.info("  export WX_SECRET=your_secret")
        return False

    return True


def check_collections():
    """检查云数据库集合状态"""
    try:
        from services.cloud_db import CloudDbClient, CloudDbConfigError

        client = CloudDbClient.from_env()
        logger.info(f"已连接云环境: {client._env_id}")

        existing_collections = []
        missing_collections = []

        for name, info in REQUIRED_COLLECTIONS.items():
            try:
                # 尝试查询集合（limit 1）来检查是否存在
                query = f'db.collection("{name}").limit(1).get()'
                client.query(query)
                existing_collections.append(name)
                logger.info(f"✓ 集合 '{name}' 存在")
            except Exception as e:
                err_msg = str(e)
                if 'ResourceNotFound' in err_msg or 'Db or Table not exist' in err_msg or '集合不存在' in err_msg:
                    missing_collections.append(name)
                    logger.warning(f"✗ 集合 '{name}' 不存在 - {info['description']}")
                else:
                    logger.error(f"检查集合 '{name}' 时出错: {e}")

        return existing_collections, missing_collections

    except CloudDbConfigError as e:
        logger.error(f"云数据库配置错误: {e}")
        return [], list(REQUIRED_COLLECTIONS.keys())
    except Exception as e:
        logger.error(f"连接云数据库失败: {e}")
        return [], list(REQUIRED_COLLECTIONS.keys())


def print_instructions(missing_collections):
    """打印创建集合的操作指南"""
    if not missing_collections:
        logger.info("\n🎉 所有必要的数据库集合都已存在！")
        return

    logger.info("\n" + "="*60)
    logger.info("📋 请在微信云开发控制台创建以下缺失的集合：")
    logger.info("="*60)
    logger.info("")

    for name in missing_collections:
        info = REQUIRED_COLLECTIONS[name]
        required_mark = "【必须】" if info['required'] else "【可选】"
        logger.info(f"  {required_mark} 集合名称: {name}")
        logger.info(f"       描述: {info['description']}")
        if info['indexes']:
            logger.info(f"       建议索引: {', '.join(info['indexes'])}")
        logger.info("")

    logger.info("="*60)
    logger.info("📝 操作步骤：")
    logger.info("  1. 登录微信云开发控制台: https://cloud.weixin.qq.com/")
    logger.info("  2. 选择对应的环境")
    logger.info("  3. 进入「数据库」→「集合管理」")
    logger.info("  4. 点击「添加集合」，输入上述集合名称")
    logger.info("  5. 创建集合后，可在「索引管理」中添加建议的索引")
    logger.info("="*60)


def main():
    logger.info("="*60)
    logger.info("微信云开发数据库集合检查工具")
    logger.info("="*60)

    # 检查环境变量
    if not check_env_vars():
        sys.exit(1)

    # 检查集合
    logger.info("\n正在检查数据库集合状态...\n")
    existing, missing = check_collections()

    # 打印统计
    logger.info(f"\n统计: 存在 {len(existing)} 个集合, 缺失 {len(missing)} 个集合")

    # 打印操作指南
    print_instructions(missing)

    # 返回退出码
    sys.exit(0 if not missing else 1)


if __name__ == '__main__':
    main()