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

# 日志文件路径 - 用于调试
_LOG_FILE = os.path.join(os.path.dirname(__file__), ".sync_log.txt")


def _log(message: str) -> None:
    """同时打印到控制台和写入文件"""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}"
    print(log_line)  # 打印到控制台
    logger.info(message)
    try:
        with open(_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_line + "\n")
    except Exception:
        pass


def _fetch_stock_codes_from_sina() -> List[str]:
    """从新浪财经 API 获取所有 A 股股票代码"""
    codes: List[str] = []

    # 新浪财经 A 股列表接口
    base_url = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData"

    _log("[全量更新] 正在从新浪财经获取沪深A股列表...")

    page = 1
    page_size = 100

    while True:
        params = {
            "page": page,
            "num": page_size,
            "sort": "symbol",
            "asc": 1,
            "node": "hs_a",  # 沪深A股
            "symbol": "",
            "_s_r_a": "page"
        }

        try:
            resp = requests.get(base_url, params=params, timeout=30)

            if resp.status_code != 200:
                _log(f"[全量更新] 新浪API响应异常: {resp.status_code}")
                break

            data = resp.json()
            if not data:
                _log(f"[全量更新] 新浪API第{page}页返回空数据，停止分页")
                break

            page_codes = []
            for item in data:
                code = item.get("code", "")
                if code and len(code) == 6 and code.isdigit():
                    page_codes.append(code)

            codes.extend(page_codes)
            _log(f"[全量更新] 新浪API第{page}页获取 {len(page_codes)} 只，总计 {len(codes)}")

            if len(data) < page_size:
                break

            page += 1

        except requests.exceptions.Timeout:
            _log(f"[全量更新] 新浪API第{page}页请求超时")
            break
        except requests.exceptions.RequestException as e:
            _log(f"[全量更新] 新浪API第{page}页请求失败: {e}")
            break
        except Exception as e:
            _log(f"[全量更新] 新浪API第{page}页处理异常: {type(e).__name__}: {e}")
            break

    # 去重并排序
    codes = sorted(set(codes))

    # 过滤掉无效代码（确保是6位数字）
    valid_codes = [c for c in codes if c.isdigit() and len(c) == 6]

    _log(f"[全量更新] 新浪API总共获取到 {len(valid_codes)} 只有效股票代码")
    return valid_codes


def _fetch_stock_codes_from_eastmoney() -> List[str]:
    """从东方财富 API 获取所有 A 股股票代码"""
    codes: List[str] = []

    # 东方财富 API 配置
    # fs 参数格式: m:{市场}+t:{类型}
    # 市场: 0=深市, 1=沪市
    # 类型: 2=主板, 23=科创板/创业板, 80=创业板
    market_configs = [
        {
            "fs": "m:1+t:2,m:1+t:23",  # 沪市主板 + 科创板
            "name": "沪市A股"
        },
        {
            "fs": "m:0+t:2,m:0+t:23,m:0+t:80",  # 深市主板 + 创业板
            "name": "深市A股"
        },
    ]

    base_url = "http://push2.eastmoney.com/api/qt/clist/get"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "http://quote.eastmoney.com/",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    for config in market_configs:
        fs_param = config["fs"]
        name = config["name"]

        _log(f"[全量更新] 正在获取{name}股票列表...")

        # 分页获取
        page = 1
        page_size = 100  # API 每页最多返回 100 条
        market_codes: List[str] = []
        total = 0  # 总记录数

        while True:
            params = {
                "pn": page,
                "pz": page_size,
                "po": 1,
                "np": 1,
                "ut": "bd1d9ddb04089700cf9c27f6f7426281",
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": fs_param,
                "fields": "f12",  # f12 是股票代码
            }

            try:
                resp = requests.get(base_url, params=params, headers=headers, timeout=30)

                _log(f"[全量更新] {name} 第{page}页 API响应状态: {resp.status_code}")

                resp.raise_for_status()
                data = resp.json()

                if data and "data" in data and data["data"] and "diff" in data["data"]:
                    items = data["data"]["diff"]
                    page_codes = [item["f12"] for item in items if "f12" in item]
                    market_codes.extend(page_codes)
                    total = data["data"].get("total", 0)

                    _log(f"[全量更新] {name} 第{page}页获取 {len(page_codes)} 只，总计 {len(market_codes)}/{total}")

                    # 判断是否还有下一页：已获取数量小于总数时继续
                    if len(market_codes) >= total:
                        break
                    page += 1
                else:
                    _log(f"[全量更新] {name} 返回数据为空或格式错误: {str(data)[:200]}")
                    break

            except requests.exceptions.Timeout:
                _log(f"[全量更新] {name} 第{page}页 API 请求超时")
                break
            except requests.exceptions.RequestException as e:
                _log(f"[全量更新] {name} 第{page}页 API 请求失败: {e}")
                break
            except Exception as e:
                _log(f"[全量更新] {name} 第{page}页 处理异常: {type(e).__name__}: {e}")
                break

        codes.extend(market_codes)
        _log(f"[全量更新] {name} 共获取 {len(market_codes)} 只股票")

    # 去重并排序
    codes = sorted(set(codes))

    # 过滤掉无效代码（确保是6位数字）
    valid_codes = [c for c in codes if c.isdigit() and len(c) == 6]

    _log(f"[全量更新] 总共获取到 {len(valid_codes)} 只有效股票代码")
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

    优先从本地缓存读取，缓存过期或不存在时依次尝试新浪、东方财富 API

    Returns:
        List[str]: 股票代码列表，如 ["000001", "000002", ...]
    """
    # 1. 尝试从缓存读取
    cached_codes = _load_codes_from_cache()
    if cached_codes:
        _log(f"[全量更新] 从缓存加载 {len(cached_codes)} 只股票代码")
        return cached_codes

    # 2. 优先从新浪 API 获取（更稳定）
    _log("[全量更新] 开始从新浪财经 API 获取股票代码列表...")

    try:
        codes = _fetch_stock_codes_from_sina()
        _log(f"[全量更新] 新浪财经 API 返回 {len(codes)} 只股票代码")

        if codes and len(codes) > 100:  # 确保获取到了有效数据
            _save_codes_to_cache(codes)
            _log(f"[全量更新] 成功获取并缓存 {len(codes)} 只股票代码")
            return codes
        else:
            _log(f"[全量更新] 新浪 API 返回数据过少({len(codes)}条)，尝试东方财富")
    except Exception as e:
        _log(f"[全量更新] 从新浪获取股票代码失败: {e}")

    # 3. 尝试东方财富 API
    _log("[全量更新] 尝试从东方财富 API 获取...")
    try:
        codes = _fetch_stock_codes_from_eastmoney()
        _log(f"[全量更新] 东方财富 API 返回 {len(codes)} 只股票代码")

        if codes and len(codes) > 100:
            _save_codes_to_cache(codes)
            _log(f"[全量更新] 成功获取并缓存 {len(codes)} 只股票代码")
            return codes
        else:
            _log(f"[全量更新] 东方财富 API 返回数据过少({len(codes)}条)")
    except Exception as e:
        _log(f"[全量更新] 从东方财富获取股票代码失败: {e}")

    # 4. 如果外部 API 失败，尝试读取过期缓存
    try:
        if os.path.exists(_STOCK_CODES_CACHE_FILE):
            with open(_STOCK_CODES_CACHE_FILE, "r", encoding="utf-8") as f:
                cache_data = json.load(f)
            codes = cache_data.get("codes", [])
            if codes and len(codes) > 10:
                _log(f"[全量更新] 使用过期缓存数据: {len(codes)} 只股票")
                return codes
    except Exception as e:
        _log(f"[全量更新] 读取过期缓存失败: {e}")

    # 5. 返回默认的模拟数据（兜底）
    _log("[全量更新] 所有获取方式失败，返回默认股票列表（仅10条）")
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
