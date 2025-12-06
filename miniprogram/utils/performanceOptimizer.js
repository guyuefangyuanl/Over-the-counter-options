// utils/performanceOptimizer.js
/**
 * 性能优化工具类
 * 提供数据缓存、批量处理等性能优化功能
 */

class PerformanceOptimizer {
  // 缓存存储
  static cache = new Map();
  
  // 防重复请求存储
  static pendingRequests = new Map();
  
  // 降级策略存储
  static fallbackData = new Map();

  /**
   * 数据预处理（带缓存和降级）
   * @param {string} key - 缓存键
   * @param {Function} dataFetcher - 数据获取函数
   * @param {*} fallbackValue - 降级值
   * @param {Object} options - 选项配置
   * @param {number} options.ttl - 缓存时间(毫秒)
   * @param {boolean} options.useStale - 是否使用过期缓存作为降级
   * @returns {Promise<*>} 处理后的数据
   */
  static async preprocessData(key, dataFetcher, fallbackValue = null, options = {}) {
    const {
      ttl = 5 * 60 * 1000, // 默认5分钟缓存
      useStale = false
    } = options;

    try {
      // 检查是否有正在进行的相同请求
      if (this.pendingRequests.has(key)) {
        console.log(`[性能优化] 请求去重: ${key}`);
        return await this.pendingRequests.get(key);
      }

      // 检查缓存
      const cachedData = this.getCachedData(key);
      if (cachedData) {
        console.log(`[性能优化] 缓存命中: ${key}`);
        return cachedData;
      }

      // 创建新的请求Promise
      const requestPromise = dataFetcher().then(result => {
        // 缓存结果
        this.setCachedData(key, result, ttl);
        // 清理进行中的请求
        this.pendingRequests.delete(key);
        return result;
      }).catch(error => {
        // 清理进行中的请求
        this.pendingRequests.delete(key);
        // 使用降级数据
        if (useStale && this.fallbackData.has(key)) {
          console.warn(`[性能优化] 使用降级数据: ${key}`);
          return this.fallbackData.get(key);
        }
        throw error;
      });

      // 存储进行中的请求
      this.pendingRequests.set(key, requestPromise);

      // 执行请求并返回结果
      const result = await requestPromise;
      return result;

    } catch (error) {
      console.error(`[性能优化] 数据获取失败: ${key}`, error);
      
      // 尝试使用降级数据
      if (this.fallbackData.has(key)) {
        console.warn(`[性能优化] 使用降级数据: ${key}`);
        return this.fallbackData.get(key);
      }
      
      // 返回默认降级值
      return fallbackValue;
    }
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @returns {*} 缓存数据或null
   */
  static getCachedData(key) {
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      // 检查是否过期
      if (Date.now() - cached.timestamp < cached.ttl) {
        return cached.data;
      } else {
        // 保存过期数据作为降级备选
        this.fallbackData.set(key, cached.data);
        // 清除过期缓存
        this.cache.delete(key);
      }
    }
    return null;
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {*} data - 缓存数据
   * @param {number} ttl - 缓存时间(毫秒)
   */
  static setCachedData(key, data, ttl) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    });
  }

  /**
   * 清除指定缓存
   * @param {string} key - 缓存键
   */
  static clearCache(key) {
    this.cache.delete(key);
    this.pendingRequests.delete(key);
    this.fallbackData.delete(key);
  }

  /**
   * 清除所有缓存
   */
  static clearAllCache() {
    this.cache.clear();
    this.pendingRequests.clear();
    this.fallbackData.clear();
  }

  /**
   * 批量处理数据
   * @param {Array} items - 待处理项数组
   * @param {Function} processor - 处理函数
   * @param {number} batchSize - 批次大小
   * @returns {Promise<Array>} 处理结果数组
   */
  static async batchProcess(items, processor, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => processor(item))
      );
      results.push(...batchResults);
      
      // 添加小延迟避免阻塞UI
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return results;
  }

  /**
   * 防抖函数
   * @param {Function} func - 要防抖的函数
   * @param {number} delay - 延迟时间(毫秒)
   * @returns {Function} 防抖后的函数
   */
  static debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * 节流函数
   * @param {Function} func - 要节流的函数
   * @param {number} delay - 延迟时间(毫秒)
   * @returns {Function} 节流后的函数
   */
  static throttle(func, delay) {
    let lastExecTime = 0;
    return function (...args) {
      const currentTime = Date.now();
      if (currentTime - lastExecTime >= delay) {
        func.apply(this, args);
        lastExecTime = currentTime;
      }
    };
  }

  /**
   * 自动清理过期缓存
   */
  static autoCleanup() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp >= cached.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清理资源
   */
  static cleanup() {
    // 清理定时器等资源
    console.log('PerformanceOptimizer资源已清理');
  }
}

// 单例模式导出
module.exports = {
  performanceOptimizer: PerformanceOptimizer
};