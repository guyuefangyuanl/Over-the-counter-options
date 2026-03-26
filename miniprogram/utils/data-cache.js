/**
 * 数据缓存管理模块
 * 提供统一的数据缓存、请求去重和节流功能
 * 基于 miniprogram/utils/performance-optimizer.js 封装
 */

const {
  cacheGet,
  cacheSet,
  cacheStats,
  checkDuplicate,
  markComplete,
  dedupStats,
  throttle,
  debounce
} = require('../utils/performance-optimizer.js');

// 缓存键前缀
const CACHE_PREFIX = {
  MARKET_INDICES: 'market_indices',
  HOT_OPTIONS: 'hot_options',
  HOLDINGS: 'holdings',
  SEARCH: 'search',
  SUGGESTIONS: 'suggestions'
};

// 默认 TTL 配置（毫秒）
const DEFAULT_TTL = {
  MARKET_INDICES: 60 * 1000,    // 1分钟
  HOT_OPTIONS: 5 * 60 * 1000,   // 5分钟
  HOLDINGS: 60 * 1000,          // 1分钟
  SEARCH: 5 * 60 * 1000,        // 5分钟
  SUGGESTIONS: 5 * 60 * 1000    // 5分钟
};

/**
 * 数据缓存管理器
 */
const DataCacheManager = {
  /**
   * 获取缓存数据
   * @param {string} key 缓存键
   * @returns {object|null} 缓存数据或null
   */
  get(key) {
    const fullKey = CACHE_PREFIX[key] || key;
    const cached = cacheGet(fullKey);
    if (cached) {
      console.log(`[缓存命中] ${fullKey}`);
    }
    return cached;
  },

  /**
   * 设置缓存数据
   * @param {string} key 缓存键
   * @param {any} data 数据
   * @param {number} ttl 过期时间（毫秒）
   */
  set(key, data, ttl) {
    const fullKey = CACHE_PREFIX[key] || key;
    const actualTTL = ttl || DEFAULT_TTL[key] || DEFAULT_TTL.HOT_OPTIONS;
    cacheSet(fullKey, data, actualTTL);
    console.log(`[缓存设置] ${fullKey}, TTL: ${actualTTL}ms`);
  },

  /**
   * 带缓存的数据获取
   * @param {string} key 缓存键
   * @param {Function} fetcher 数据获取函数
   * @param {object} options 配置选项
   */
  async fetchWithCache(key, fetcher, options = {}) {
    const { ttl, forceRefresh = false } = options;

    // 非强制刷新时，先尝试缓存
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    // 检查重复请求
    const { isDuplicate, key: requestKey } = checkDuplicate(key);
    if (isDuplicate) {
      console.log(`[请求去重] ${key}`);
      // 等待一段时间后重试获取缓存
      await new Promise(resolve => setTimeout(resolve, 100));
      const cached = this.get(key);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    try {
      const data = await fetcher();
      this.set(key, data, ttl);
      return { data, fromCache: false };
    } finally {
      markComplete(requestKey);
    }
  },

  /**
   * 节流执行函数
   * @param {string} key 节流键
   * @param {Function} fn 执行函数
   * @param {number} interval 间隔时间（毫秒）
   */
  throttleExecute(key, fn, interval = 1000) {
    return throttle(key, fn, interval);
  },

  /**
   * 防抖执行函数
   * @param {string} key 防抖键
   * @param {Function} fn 执行函数
   * @param {number} delay 延迟时间（毫秒）
   */
  debounceExecute(key, fn, delay = 300) {
    debounce(key, fn, delay);
  },

  /**
   * 检查请求是否重复
   */
  checkDuplicateRequest(requestId, params) {
    return checkDuplicate(requestId, params);
  },

  /**
   * 标记请求完成
   */
  markRequestComplete(key) {
    markComplete(key);
  },

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      cache: cacheStats(),
      dedup: dedupStats()
    };
  }
};

module.exports = {
  DataCacheManager,
  CACHE_PREFIX,
  DEFAULT_TTL
};