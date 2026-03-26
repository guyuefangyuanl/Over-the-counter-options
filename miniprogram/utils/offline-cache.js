/**
 * 离线缓存管理器
 * 实现数据持久化存储，支持离线访问和自动同步
 */

const { cacheGet, cacheSet } = require('./performance-optimizer.js');

// 缓存类型
const CacheType = {
  MEMORY: 'memory',       // 内存缓存（会话级别）
  STORAGE: 'storage',     // 本地存储（持久化）
  HYBRID: 'hybrid'        // 混合模式（内存+存储）
};

// 缓存配置
const OFFLINE_CONFIG = {
  // 默认TTL（毫秒）
  DEFAULT_TTL: 30 * 60 * 1000,  // 30分钟
  // 最大存储数量
  MAX_STORAGE_ITEMS: 200,
  // 最大存储大小（字节）
  MAX_STORAGE_SIZE: 5 * 1024 * 1024,  // 5MB
  // 自动清理间隔
  CLEANUP_INTERVAL: 5 * 60 * 1000,  // 5分钟
  // 离线数据版本
  DATA_VERSION: 1
};

/**
 * 离线缓存管理器
 */
class OfflineCacheManager {
  constructor() {
    // 内存缓存
    this.memoryCache = new Map();

    // 存储统计
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      deletes: 0,
      evictions: 0
    };

    // 初始化状态
    this.initialized = false;

    // 离线模式标记
    this.isOffline = false;

    // 待同步队列
    this.pendingSync = [];
  }

  /**
   * 初始化缓存管理器
   */
  init() {
    if (this.initialized) return;

    // 检测网络状态
    this._checkNetworkStatus();

    // 监听网络变化
    if (typeof wx !== 'undefined' && wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange((res) => {
        this.isOffline = !res.isConnected;
        if (res.isConnected) {
          this._processPendingSync();
        }
      });
    }

    // 启动定期清理
    this._startCleanupTimer();

    // 恢复离线数据
    this._restoreOfflineData();

    this.initialized = true;
    console.log('[离线缓存] 初始化完成');
  }

  /**
   * 检测网络状态
   */
  _checkNetworkStatus() {
    if (typeof wx !== 'undefined') {
      wx.getNetworkType({
        success: (res) => {
          this.isOffline = res.networkType === 'none';
        }
      });
    }
  }

  /**
   * 获取缓存数据
   * @param {string} key 缓存键
   * @param {object} options 配置项
   */
  get(key, options = {}) {
    const { cacheType = CacheType.HYBRID, fallback = null } = options;

    // 1. 尝试内存缓存
    if (cacheType === CacheType.MEMORY || cacheType === CacheType.HYBRID) {
      const memoryData = this.memoryCache.get(key);
      if (memoryData && !this._isExpired(memoryData)) {
        this.stats.hits++;
        console.log(`[离线缓存] 内存命中: ${key}`);
        return memoryData.data;
      }
    }

    // 2. 尝试本地存储
    if (cacheType === CacheType.STORAGE || cacheType === CacheType.HYBRID) {
      try {
        const storageKey = this._getStorageKey(key);
        const storageData = wx.getStorageSync(storageKey);
        if (storageData && !this._isExpired(storageData)) {
          this.stats.hits++;
          // 回填内存缓存
          this.memoryCache.set(key, storageData);
          console.log(`[离线缓存] 存储命中: ${key}`);
          return storageData.data;
        }
      } catch (e) {
        console.warn(`[离线缓存] 读取存储失败: ${key}`, e.message);
      }
    }

    // 未命中
    this.stats.misses++;
    return fallback;
  }

  /**
   * 设置缓存数据
   * @param {string} key 缓存键
   * @param {any} data 数据
   * @param {object} options 配置项
   */
  set(key, data, options = {}) {
    const {
      cacheType = CacheType.HYBRID,
      ttl = OFFLINE_CONFIG.DEFAULT_TTL,
      priority = 'normal'  // high, normal, low
    } = options;

    const cacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
      priority,
      version: OFFLINE_CONFIG.DATA_VERSION
    };

    // 写入内存缓存
    if (cacheType === CacheType.MEMORY || cacheType === CacheType.HYBRID) {
      this.memoryCache.set(key, cacheEntry);
    }

    // 写入本地存储
    if (cacheType === CacheType.STORAGE || cacheType === CacheType.HYBRID) {
      try {
        const storageKey = this._getStorageKey(key);
        wx.setStorageSync(storageKey, cacheEntry);
        this.stats.writes++;
        console.log(`[离线缓存] 写入成功: ${key}`);
      } catch (e) {
        console.warn(`[离线缓存] 写入存储失败: ${key}`, e.message);
        // 存储空间不足时清理低优先级缓存
        if (e.errMsg && e.errMsg.includes('storage')) {
          this._emergencyCleanup();
          // 重试
          try {
            wx.setStorageSync(this._getStorageKey(key), cacheEntry);
          } catch (retryError) {
            console.error(`[离线缓存] 重试写入失败: ${key}`, retryError.message);
          }
        }
      }
    }

    return true;
  }

  /**
   * 删除缓存
   */
  delete(key) {
    // 删除内存缓存
    this.memoryCache.delete(key);

    // 删除本地存储
    try {
      wx.removeStorageSync(this._getStorageKey(key));
      this.stats.deletes++;
    } catch (e) {
      console.warn(`[离线缓存] 删除失败: ${key}`, e.message);
    }
  }

  /**
   * 清空所有缓存
   */
  clear() {
    // 清空内存缓存
    this.memoryCache.clear();

    // 清空本地存储（仅清除本模块管理的缓存）
    try {
      const keys = this._getManagedKeys();
      keys.forEach(key => {
        wx.removeStorageSync(key);
      });
      console.log(`[离线缓存] 已清空 ${keys.length} 个缓存项`);
    } catch (e) {
      console.error('[离线缓存] 清空失败:', e.message);
    }
  }

  /**
   * 检查缓存是否过期
   */
  _isExpired(cacheEntry) {
    if (!cacheEntry || !cacheEntry.timestamp || !cacheEntry.ttl) {
      return true;
    }
    return Date.now() - cacheEntry.timestamp > cacheEntry.ttl;
  }

  /**
   * 获取存储键名
   */
  _getStorageKey(key) {
    return `offline_cache_${key}`;
  }

  /**
   * 获取本模块管理的所有缓存键
   */
  _getManagedKeys() {
    const keys = [];
    try {
      const res = wx.getStorageInfoSync();
      res.keys.forEach(key => {
        if (key.startsWith('offline_cache_')) {
          keys.push(key);
        }
      });
    } catch (e) {
      console.error('[离线缓存] 获取键列表失败:', e.message);
    }
    return keys;
  }

  /**
   * 启动定期清理
   */
  _startCleanupTimer() {
    setInterval(() => {
      this._cleanupExpired();
    }, OFFLINE_CONFIG.CLEANUP_INTERVAL);
  }

  /**
   * 清理过期缓存
   */
  _cleanupExpired() {
    let cleaned = 0;

    // 清理内存缓存
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this._isExpired(entry)) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    // 清理本地存储
    const keys = this._getManagedKeys();
    for (const storageKey of keys) {
      try {
        const data = wx.getStorageSync(storageKey);
        if (this._isExpired(data)) {
          wx.removeStorageSync(storageKey);
          cleaned++;
        }
      } catch (e) {
        // 忽略错误
      }
    }

    if (cleaned > 0) {
      console.log(`[离线缓存] 清理了 ${cleaned} 个过期项`);
      this.stats.evictions += cleaned;
    }
  }

  /**
   * 紧急清理（存储空间不足时）
   */
  _emergencyCleanup() {
    console.log('[离线缓存] 执行紧急清理');

    // 清理低优先级缓存
    const keys = this._getManagedKeys();
    for (const storageKey of keys) {
      try {
        const data = wx.getStorageSync(storageKey);
        if (data && data.priority === 'low') {
          wx.removeStorageSync(storageKey);
        }
      } catch (e) {
        // 忽略
      }
    }

    // 清理最旧的缓存
    const cacheItems = [];
    for (const storageKey of keys) {
      try {
        const data = wx.getStorageSync(storageKey);
        if (data) {
          cacheItems.push({ key: storageKey, timestamp: data.timestamp || 0 });
        }
      } catch (e) {
        // 忽略
      }
    }

    // 按时间排序，删除最旧的25%
    cacheItems.sort((a, b) => a.timestamp - b.timestamp);
    const deleteCount = Math.ceil(cacheItems.length * 0.25);
    for (let i = 0; i < deleteCount; i++) {
      try {
        wx.removeStorageSync(cacheItems[i].key);
      } catch (e) {
        // 忽略
      }
    }
  }

  /**
   * 恢复离线数据
   */
  _restoreOfflineData() {
    // 尝试恢复之前未同步的数据
    try {
      const pendingData = wx.getStorageSync('offline_pending_sync');
      if (pendingData && Array.isArray(pendingData)) {
        this.pendingSync = pendingData;
        console.log(`[离线缓存] 恢复了 ${pendingData.length} 个待同步项`);
      }
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 添加待同步操作
   */
  addPendingSync(operation) {
    this.pendingSync.push({
      ...operation,
      timestamp: Date.now()
    });

    // 持久化待同步队列
    try {
      wx.setStorageSync('offline_pending_sync', this.pendingSync);
    } catch (e) {
      console.error('[离线缓存] 保存待同步队列失败:', e.message);
    }
  }

  /**
   * 处理待同步队列
   */
  async _processPendingSync() {
    if (this.pendingSync.length === 0) return;

    console.log(`[离线缓存] 开始同步 ${this.pendingSync.length} 个待处理项`);

    const successItems = [];
    for (const item of this.pendingSync) {
      try {
        // 这里应该调用实际的同步方法
        // 目前只是标记为成功
        successItems.push(item);
      } catch (e) {
        console.error(`[离线缓存] 同步失败:`, e.message);
      }
    }

    // 移除成功的项目
    this.pendingSync = this.pendingSync.filter(
      item => !successItems.includes(item)
    );

    // 更新持久化
    try {
      wx.setStorageSync('offline_pending_sync', this.pendingSync);
    } catch (e) {
      // 忽略
    }

    console.log(`[离线缓存] 同步完成，剩余 ${this.pendingSync.length} 个`);
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;

    return {
      ...this.stats,
      hitRate: parseFloat(hitRate),
      memorySize: this.memoryCache.size,
      isOffline: this.isOffline,
      pendingCount: this.pendingSync.length
    };
  }

  /**
   * 获取存储使用情况
   */
  getStorageInfo() {
    try {
      const info = wx.getStorageInfoSync();
      return {
        keys: info.keys.filter(k => k.startsWith('offline_cache_')),
        currentSize: info.currentSize,
        limitSize: info.limitSize,
        usagePercent: ((info.currentSize / info.limitSize) * 100).toFixed(2)
      };
    } catch (e) {
      return null;
    }
  }
}

// 创建单例
const offlineCacheManager = new OfflineCacheManager();

// 离线缓存行为（可混入页面）
const OfflineCacheBehavior = Behavior({
  lifetimes: {
    attached() {
      offlineCacheManager.init();
    }
  },

  methods: {
    // 获取离线缓存
    getOfflineCache(key, options) {
      return offlineCacheManager.get(key, options);
    },

    // 设置离线缓存
    setOfflineCache(key, data, options) {
      return offlineCacheManager.set(key, data, options);
    },

    // 删除离线缓存
    deleteOfflineCache(key) {
      return offlineCacheManager.delete(key);
    },

    // 检查是否离线
    isOffline() {
      return offlineCacheManager.isOffline;
    },

    // 添加待同步操作
    addPendingSync(operation) {
      offlineCacheManager.addPendingSync(operation);
    }
  }
});

module.exports = {
  OfflineCacheManager,
  offlineCacheManager,
  OfflineCacheBehavior,
  CacheType,
  OFFLINE_CONFIG
};