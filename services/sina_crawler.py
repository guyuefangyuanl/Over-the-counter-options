# import akshare as ak  # 云托管环境暂不需要
import json
import os
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple
import logging
import requests

from sina_quotes import SinaQuote, fetch_sina_quotes

logger = logging.getLogger(__name__)

# 本地缓存文件路径
_STOCK_CODES_CACHE_FILE = os.path.join(os.path.dirname(__file__), ".stock_codes_cache.json")
_CACHE_TTL = 86400  # 缓存有效期：24小时


def _fetch_stock_codes_from_eastmoney() -> List[str]:
    """从东方财富 API 获取所有 A 股股票代码"""
    codes: List[str] = []

    # 东方财富 API 配置
    # 沪市主板 (1) + 深市主板 (2) + 创业板 (3) + 科创板 (4)
    market_configs = [
        {"market": "1", "name": "沪市主板"},   # 沪市主板 60xxxx
        {"market": "2", "name": "深市主板"},    # 深市主板 00xxxx
        {"market": "3", "name": "创业板"},     # 创业板 30xxxx
        {"market": "4", "name": "科创板"},     # 科创板 688xxx
    ]

    base_url = "http://push2.eastmoney.com/api/qt/clist/get"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "http://quote.eastmoney.com/",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    for config in market_configs:
        market = config["market"]
        name = config["name"]

        params = {
            "pn": 1,
            "pz": 5000,  # 每页数量，设置足够大
            "po": 1,
            "np": 1,
            "ut": "bd1d9ddb04089700cf9c27f6f7426281",
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": f"m:{market},t:23",  # t:23 表示股票类型
            "fields": "f12",  # f12 是股票代码
        }

        try:
            logger.info(f"[全量更新] 正在获取{name}股票列表...")
            print(f"[全量更新] 正在获取{name}股票列表...")

            resp = requests.get(base_url, params=params, headers=headers, timeout=30)

            logger.info(f"[全量更新] {name} API响应状态: {resp.status_code}")
            print(f"[全量更新] {name} API响应状态: {resp.status_code}")

            resp.raise_for_status()
            data = resp.json()

            # 调试：打印返回数据的关键信息
            if data:
                logger.debug(f"[全量更新] {name} 返回数据keys: {list(data.keys())}")
                if "data" in data:
                    data_info = data["data"]
                    if data_info:
                        logger.debug(f"[全量更新] {name} data.keys: {list(data_info.keys()) if isinstance(data_info, dict) else 'not dict'}")

            if data and "data" in data and data["data"] and "diff" in data["data"]:
                items = data["data"]["diff"]
                market_codes = [item["f12"] for item in items if "f12" in item]
                codes.extend(market_codes)
                logger.info(f"[全量更新] 获取到 {name} {len(market_codes)} 只股票")
                print(f"[全量更新] 获取到 {name} {len(market_codes)} 只股票")
            else:
                logger.warning(f"[全量更新] {name} 返回数据为空或格式错误: {str(data)[:200]}")
                print(f"[全量更新] {name} 返回数据为空或格式错误")

        except requests.exceptions.Timeout:
            logger.error(f"[全量更新] {name} API 请求超时")
            print(f"[全量更新] {name} API 请求超时")
        except requests.exceptions.RequestException as e:
            logger.error(f"[全量更新] {name} API 请求失败: {e}")
            print(f"[全量更新] {name} API 请求失败: {e}")
        except Exception as e:
            logger.error(f"[全量更新] {name} 处理异常: {type(e).__name__}: {e}")
            print(f"[全量更新] {name} 处理异常: {type(e).__name__}: {e}")

    # 去重并排序
    codes = sorted(set(codes))

    # 过滤掉无效代码（确保是6位数字）
    valid_codes = [c for c in codes if c.isdigit() and len(c) == 6]

    logger.info(f"总共获取到 {len(valid_codes)} 只有效股票代码")
    return valid_codes


def _load_codes_from_cache() -> Optional[List[str]]:
    """从本地缓存加载股票代码"""
    try:
        if not os.path.exists(_STOCK_CODES_CACHE_FILE):
            return None

        with open(_STOCK_CODES_CACHE_FILE, "r", encoding="utf-8") as f:
            cache_data = json.load(f)

        if not isinstance(cache_data, dict):
            return None

        timestamp = cache_data.get("timestamp", 0)
        codes = cache_data.get("codes", [])

        # 检查缓存是否过期
        if time.time() - timestamp > _CACHE_TTL:
            logger.info("股票代码缓存已过期")
            return None

        if not isinstance(codes, list) or len(codes) == 0:
            return None

        logger.info(f"从缓存加载 {len(codes)} 只股票代码")
        return codes

    except Exception as e:
        logger.warning(f"读取股票代码缓存失败: {e}")
        return None


def _save_codes_to_cache(codes: List[str]) -> None:
    """保存股票代码到本地缓存"""
    try:
        cache_data = {
            "timestamp": time.time(),
            "count": len(codes),
            "codes": codes,
        }
        with open(_STOCK_CODES_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache_data, f, ensure_ascii=False)
        logger.info(f"已缓存 {len(codes)} 只股票代码")
    except Exception as e:
        logger.warning(f"保存股票代码缓存失败: {e}")


def get_all_stock_codes() -> List[str]:
    """
    获取所有 A 股股票代码

    优先从本地缓存读取，缓存过期或不存在时从东方财富 API 获取

    Returns:
        List[str]: 股票代码列表，如 ["000001", "000002", ...]
    """
    # 1. 尝试从缓存读取
    cached_codes = _load_codes_from_cache()
    if cached_codes:
        return cached_codes

    # 2. 从东方财富 API 获取
    logger.info("开始从东方财富 API 获取股票代码列表...")
    try:
        codes = _fetch_stock_codes_from_eastmoney()
        if codes:
            # 保存到缓存
            _save_codes_to_cache(codes)
            return codes
    except Exception as e:
        logger.error(f"从东方财富获取股票代码失败: {e}")

    # 3. 如果外部 API 失败，尝试读取过期缓存
    try:
        if os.path.exists(_STOCK_CODES_CACHE_FILE):
            with open(_STOCK_CODES_CACHE_FILE, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            codes = cache_data.get("codes", [])
            if codes:
                logger.warning(f"使用过期缓存数据: {len(codes)} 只股票")
                return codes
    except Exception:
        pass

    # 4. 返回默认的模拟数据（兜底）
    logger.warning("所有获取方式失败，返回默认股票列表")
    return ["000001", "000002", "000333", "000858", "002415", "002594", "300750", "600000", "600519", "601318"]


def _is_suspended(q: SinaQuote) -> bool:
    if q.price in (None, 0) and q.volume in (None, 0):
        return True
    return False


def crawl_quotes(
    codes: Sequence[str],
    *,
    timeout: float = 8.0,
    retries: int = 3,
    chunk_size: int = 50,
    max_workers: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    quotes, errors = fetch_sina_quotes(
        codes,
        timeout=timeout,
        retries=retries,
        chunk_size=chunk_size,
        max_workers=max_workers,
    )
    items: List[Dict[str, Any]] = []
    for q in quotes:
        if _is_suspended(q):
            continue
        items.append(q.to_admin_stock_item())
    return items, errors
