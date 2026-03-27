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

// 默认 TTL 配置（毫秒）- 优化：适当延长缓存时间以提高命中率
const DEFAULT_TTL = {
  MARKET_INDICES: 3 * 60 * 1000,    // 3分钟（原1分钟，延长以减少重复请求）
  HOT_OPTIONS: 10 * 60 * 1000,      // 10分钟（原5分钟，期权数据更新较慢）
  HOLDINGS: 2 * 60 * 1000,          // 2分钟（原1分钟，持仓数据适当延长）
  SEARCH: 10 * 60 * 1000,           // 10分钟（原5分钟，搜索结果可缓存更久）
  SUGGESTIONS: 10 * 60 * 1000       // 10分钟（原5分钟，建议数据更新频率低）
};

// 请求去重：存储正在进行的请求 Promise
const pendingFetchPromises = new Map();

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
   * 带缓存的数据获取（优化版：真正的请求去重）
   * 核心优化：使用 Promise 共享机制，让重复请求等待同一个 Promise
   * @param {string} key 缓存键
   * @param {Function} fetcher 数据获取函数
   * @param {object} options 配置选项
   */
  async fetchWithCache(key, fetcher, options = {}) {
    const { ttl, forceRefresh = false, params } = options;
    const fullKey = CACHE_PREFIX[key] || key;

    // 非强制刷新时，先尝试缓存
    if (!forceRefresh) {
      const cached = this.get(key);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }

    // 生成请求唯一标识
    const paramsHash = params ? this._hashParams(params) : '';
    const requestKey = `${fullKey}:${paramsHash}`;

    // 核心优化：检查是否有正在进行的相同请求
    if (pendingFetchPromises.has(requestKey)) {
      console.log(`[请求去重] 等待已有请求: ${requestKey}`);
      try {
        // 等待第一个请求完成并获取结果
        const result = await pendingFetchPromises.get(requestKey);
        // 第一个请求完成后，尝试从缓存获取
        const cached = this.get(key);
        if (cached) {
          return { data: cached, fromCache: true };
        }
        return result;
      } catch (error) {
        // 如果第一个请求失败，重新发起请求
        console.warn(`[请求去重] 等待的请求失败，重新发起: ${requestKey}`);
      }
    }

    // 标记请求开始
    checkDuplicate(fullKey, params);

    // 创建请求 Promise 并存储
    const fetchPromise = this._executeFetch(requestKey, fullKey, fetcher, ttl);
    pendingFetchPromises.set(requestKey, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      // 请求完成后清理
      pendingFetchPromises.delete(requestKey);
      markComplete(requestKey);
    }
  },

  /**
   * 执行实际的 fetch 操作
   * @private
   */
  async _executeFetch(requestKey, fullKey, fetcher, ttl) {
    try {
      const data = await fetcher();
      this.set(fullKey, data, ttl);
      return { data, fromCache: false };
    } catch (error) {
      console.error(`[缓存获取失败] ${fullKey}:`, error);
      throw error;
    }
  },

  /**
   * 简单参数哈希
   * @private
   */
  _hashParams(params) {
    if (!params) return '';
    try {
      const str = JSON.stringify(params);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).slice(0, 8);
    } catch (e) {
      return '';
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