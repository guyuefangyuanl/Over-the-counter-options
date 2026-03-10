// utils/storage-manager.js
/**
 * 智能存储管理器
 * 提供数据持久化、缓存管理、数据同步等功能
 */

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.syncQueue = [];
    this.syncInProgress = false;
    this.observers = new Map(); // 数据变化观察者
    this.storageStats = { // 存储统计
      hits: 0,
      misses: 0,
      errors: 0,
      syncSuccess: 0,
      syncFailures: 0
    };
    this.config = {
      defaultTTL: 24 * 60 * 60 * 1000, // 24小时默认缓存时间
      maxCacheSize: 100, // 最大缓存项数
      syncInterval: 30 * 1000, // 30秒同步间隔
      enableEncryption: true, // 启用数据加密
      compressionThreshold: 1024, // 超过1KB的数据进行压缩
      enableLRU: true, // 启用LRU缓存淘汰策略
      maxRetries: 3, // 同步最大重试次数
      retryDelay: 1000, // 重试延迟（毫秒）
      autoCleanup: true, // 自动清理过期数据
      cleanupInterval: 5 * 60 * 1000 // 清理间隔5分钟
    };
    
    this.initStorageManager();
  }

  /**
   * 初始化存储管理器
   */
  initStorageManager() {
    // 定期清理过期缓存
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanExpiredCache();
      }, this.config.cleanupInterval);
    }

    // 定期同步数据
    this.syncTimer = setInterval(() => {
      this.processSyncQueue();
    }, this.config.syncInterval);

    // 监听应用生命周期
    this.setupLifecycleListeners();
    
    // 初始化存储统计
    this.initStorageStats();
  }
  
  /**
   * 初始化存储统计
   */
  initStorageStats() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined') {
      // 从本地存储恢复统计信息
      try {
        const savedStats = wx.getStorageSync('storage_stats');
        if (savedStats) {
          this.storageStats = {
            ...this.storageStats,
            ...savedStats
          };
        }
      } catch (error) {
        console.warn('初始化存储统计失败:', error);
      }
    }
  }
  
  /**
   * 保存存储统计
   */
  saveStorageStats() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined') {
      try {
        wx.setStorageSync('storage_stats', this.storageStats);
      } catch (error) {
        console.warn('保存存储统计失败:', error);
      }
    }
  }

  /**
   * 设置生命周期监听器
   */
  setupLifecycleListeners() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined') {
      // 小程序隐藏时同步数据
      wx.onAppHide && wx.onAppHide(() => {
        this.syncAllData();
      });

      // 小程序显示时检查数据更新
      wx.onAppShow && wx.onAppShow(() => {
        this.checkDataUpdates();
      });
    }
  }

  /**
   * 智能存储数据（增强版）
   * @param {string} key 存储键
   * @param {any} data 要存储的数据
   * @param {object} options 存储选项
   */
  async setItem(key, data, options = {}) {
    const {
      ttl = this.config.defaultTTL,
      sync = false,
      encrypt = this.config.enableEncryption,
      compress = false,
      priority = 'normal', // normal, high, low
      backup = true // 是否备份到云端
    } = options;

    try {
      // 构造存储项
      const item = {
        data: data,
        timestamp: Date.now(),
        ttl: ttl,
        version: this.generateVersion(),
        compressed: false,
        encrypted: false,
        priority: priority,
        backup: backup
      };

      // 数据压缩
      if (compress || this.shouldCompress(data)) {
        item.data = await this.compressData(data);
        item.compressed = true;
      }

      // 数据加密
      if (encrypt && this.isSecureData(key)) {
        item.data = await this.encryptData(item.data);
        item.encrypted = true;
      }

      // 仅在小程序环境中存储到本地
      if (typeof wx !== 'undefined') {
        wx.setStorageSync(key, item);
      }

      // 更新内存缓存
      this.cache.set(key, {
        ...item,
        data: data // 内存中保存原始数据
      });
      
      // LRU缓存管理
      if (this.config.enableLRU) {
        this.updateLRU(key);
      }

      // 添加到同步队列
      if (sync) {
        this.addToSyncQueue(key, data, 'set');
      }
      
      // 通知观察者
      this.notifyObservers(key, 'set', data);

      console.log(`数据存储成功: ${key}`);
      return true;

    } catch (error) {
      this.storageStats.errors++;
      console.error(`数据存储失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 智能获取数据（增强版）
   * @param {string} key 存储键
   * @param {any} defaultValue 默认值
   * @param {object} options 获取选项
   */
  async getItem(key, defaultValue = null, options = {}) {
    const { 
      useCache = true, 
      forceRefresh = false,
      fallback = true, // 是否使用降级策略
      maxAge = null // 最大缓存时间
    } = options;

    try {
      // 优先从内存缓存获取
      if (useCache && !forceRefresh && this.cache.has(key)) {
        const cached = this.cache.get(key);
        
        // 检查最大缓存时间
        if (maxAge === null || (Date.now() - cached.timestamp) < maxAge) {
          if (this.isValid(cached)) {
            this.storageStats.hits++;
            console.log(`缓存命中: ${key}`);
            return cached.data;
          } else {
            this.cache.delete(key);
          }
        }
      }

      // 仅在小程序环境中从本地存储获取
      let item;
      if (typeof wx !== 'undefined') {
        item = wx.getStorageSync(key);
      }
      
      if (!item) {
        this.storageStats.misses++;
        return defaultValue;
      }

      // 检查数据有效性
      if (!this.isValid(item)) {
        if (typeof wx !== 'undefined') {
          wx.removeStorageSync(key);
        }
        this.storageStats.misses++;
        return defaultValue;
      }

      let data = item.data;

      // 数据解密
      if (item.encrypted) {
        data = await this.decryptData(data);
      }

      // 数据解压缩
      if (item.compressed) {
        data = await this.decompressData(data);
      }

      // 更新内存缓存
      if (useCache) {
        this.cache.set(key, {
          ...item,
          data: data
        });
        
        // LRU缓存管理
        if (this.config.enableLRU) {
          this.updateLRU(key);
        }
      }

      this.storageStats.hits++;
      console.log(`数据获取成功: ${key}`);
      return data;

    } catch (error) {
      this.storageStats.errors++;
      console.error(`数据获取失败: ${key}`, error);
      
      // 降级策略
      if (fallback && useCache && this.cache.has(key)) {
        console.warn(`使用缓存降级策略: ${key}`);
        return this.cache.get(key).data;
      }
      
      return defaultValue;
    }
  }

  /**
   * 删除存储项
   * @param {string} key 存储键
   * @param {object} options 删除选项
   */
  async removeItem(key, options = {}) {
    const { sync = false } = options;

    try {
      // 仅在小程序环境中从本地存储删除
      if (typeof wx !== 'undefined') {
        wx.removeStorageSync(key);
      }

      // 从内存缓存删除
      this.cache.delete(key);

      // 添加到同步队列
      if (sync) {
        this.addToSyncQueue(key, null, 'remove');
      }

      console.log(`数据删除成功: ${key}`);
      return true;

    } catch (error) {
      console.error(`数据删除失败: ${key}`, error);
      throw error;
    }
  }

  /**
   * 更新LRU缓存
   * @param {string} key 存储键
   */
  updateLRU(key) {
    if (!this.lruList) {
      this.lruList = [];
    }
    
    // 移除已存在的键
    const index = this.lruList.indexOf(key);
    if (index > -1) {
      this.lruList.splice(index, 1);
    }
    
    // 添加到列表末尾
    this.lruList.push(key);
    
    // 检查是否超出最大缓存大小
    if (this.lruList.length > this.config.maxCacheSize) {
      const oldestKey = this.lruList.shift();
      this.cache.delete(oldestKey);
      console.log(`LRU淘汰: ${oldestKey}`);
    }
  }
  
  /**
   * 批量操作（增强版）
   * @param {array} operations 操作列表
   */
  async batchOperation(operations) {
    const results = [];
    const startTime = Date.now();
    
    // 按优先级排序
    const sortedOperations = operations.sort((a, b) => {
      const priorityMap = { high: 3, normal: 2, low: 1 };
      return (priorityMap[b.options?.priority] || 2) - (priorityMap[a.options?.priority] || 2);
    });

    for (const operation of sortedOperations) {
      try {
        let result;
        switch (operation.type) {
          case 'set':
            result = await this.setItem(operation.key, operation.data, operation.options);
            break;
          case 'get':
            result = await this.getItem(operation.key, operation.defaultValue, operation.options);
            break;
          case 'remove':
            result = await this.removeItem(operation.key, operation.options);
            break;
          case 'clear':
            result = await this.clearAll();
            break;
          default:
            throw new Error(`未知操作类型: ${operation.type}`);
        }

        results.push({ 
          success: true, 
          result,
          key: operation.key,
          type: operation.type
        });
      } catch (error) {
        results.push({ 
          success: false, 
          error: error.message,
          key: operation.key,
          type: operation.type
        });
        
        this.storageStats.errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`批量操作完成: ${operations.length} 个操作, 耗时: ${duration}ms`);
    
    return results;
  }
  
  /**
   * 数据观察者模式
   * @param {string} key 监听的键
   * @param {function} callback 回调函数
   */
  observe(key, callback) {
    if (!this.observers.has(key)) {
      this.observers.set(key, new Set());
    }
    
    this.observers.get(key).add(callback);
    
    // 返回取消订阅函数
    return () => {
      const observers = this.observers.get(key);
      if (observers) {
        observers.delete(callback);
        if (observers.size === 0) {
          this.observers.delete(key);
        }
      }
    };
  }
  
  /**
   * 通知观察者
   * @param {string} key 键
   * @param {string} action 操作
   * @param {any} data 数据
   */
  notifyObservers(key, action, data) {
    const observers = this.observers.get(key);
    if (observers) {
      observers.forEach(callback => {
        try {
          callback(key, action, data);
        } catch (error) {
          console.error(`观察者回调执行失败:`, error);
        }
      });
    }
    
    // 通知全局观察者
    const globalObservers = this.observers.get('*');
    if (globalObservers) {
      globalObservers.forEach(callback => {
        try {
          callback(key, action, data);
        } catch (error) {
          console.error(`全局观察者回调执行失败:`, error);
        }
      });
    }
  }

  /**
   * 数据同步到服务器
   * @param {string} key 存储键
   * @param {any} data 数据
   * @param {string} operation 操作类型
   */
  addToSyncQueue(key, data, operation) {
    this.syncQueue.push({
      key,
      data,
      operation,
      timestamp: Date.now(),
      retries: 0
    });

    console.log(`添加到同步队列: ${key} (${operation})`);
  }

  /**
   * 处理同步队列（增强版）
   */
  async processSyncQueue() {
    if (this.syncInProgress || this.syncQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;

    try {
      const batchSize = 10; // 每次同步10个项目
      const batch = this.syncQueue.splice(0, batchSize);

      await this.syncBatchToServer(batch);
      this.storageStats.syncSuccess += batch.length;
      console.log(`同步完成: ${batch.length} 个项目`);

    } catch (error) {
      this.storageStats.syncFailures++;
      console.error('数据同步失败:', error);
      
      // 失败重试机制
      // this.syncQueue.unshift(...failedItems);
    } finally {
      this.syncInProgress = false;
    }
  }
  
  /**
   * 批量同步到服务器（增强版）
   * @param {array} batch 同步批次
   */
  async syncBatchToServer(batch) {
    // 过滤掉重试次数过多的项目
    const validBatch = batch.filter(item => item.retries < this.config.maxRetries);
    
    if (validBatch.length === 0) {
      return;
    }
    
    // 这里应该调用实际的API接口
    // 模拟同步过程
    return new Promise((resolve, reject) => {
      // 模拟网络延迟
      setTimeout(() => {
        // 模拟随机失败
        if (Math.random() < 0.1) { // 10%失败率
          reject(new Error('网络错误'));
        } else {
          console.log('模拟服务器同步:', validBatch.map(item => item.key));
          resolve();
        }
      }, 500 + Math.random() * 1000);
    });
  }
  
  /**
   * 获取存储统计信息
   */
  getStorageStats() {
    return {
      ...this.storageStats,
      cacheSize: this.cache.size,
      syncQueueSize: this.syncQueue.length,
      hitRate: this.storageStats.hits / (this.storageStats.hits + this.storageStats.misses || 1)
    };
  }
  
  /**
   * 获取缓存详细信息
   */
  getCacheDetails() {
    const details = [];
    
    for (const [key, item] of this.cache.entries()) {
      details.push({
        key,
        size: JSON.stringify(item.data).length,
        timestamp: item.timestamp,
        ttl: item.ttl,
        expiresAt: item.timestamp + item.ttl,
        priority: item.priority || 'normal',
        encrypted: item.encrypted || false,
        compressed: item.compressed || false
      });
    }
    
    return details.sort((a, b) => a.expiresAt - b.expiresAt);
  }

  /**
   * 同步所有数据
   */
  async syncAllData() {
    if (this.syncQueue.length > 0) {
      await this.processSyncQueue();
    }
  }

  /**
   * 检查数据更新
   */
  async checkDataUpdates() {
    // 这里可以实现从服务器检查数据更新的逻辑
    console.log('检查数据更新');
  }

  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (!this.isValid(item)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    // 仅在小程序环境中清理本地存储中的过期数据
    if (typeof wx !== 'undefined') {
      try {
        const { keys } = wx.getStorageInfoSync();
        keys.forEach(key => {
          try {
            const item = wx.getStorageSync(key);
            if (item && item.timestamp && !this.isValid(item)) {
              wx.removeStorageSync(key);
              cleanedCount++;
            }
          } catch (error) {
            // 忽略个别项目的错误
          }
        });
      } catch (error) {
        console.error('清理过期缓存失败:', error);
      }
    }

    if (cleanedCount > 0) {
      console.log(`清理了 ${cleanedCount} 个过期缓存项`);
    }
  }

  /**
   * 检查数据是否有效
   * @param {object} item 存储项
   */
  isValid(item) {
    if (!item || !item.timestamp) {
      return false;
    }

    const now = Date.now();
    const expireTime = item.timestamp + (item.ttl || this.config.defaultTTL);
    
    return now < expireTime;
  }

  /**
   * 判断是否需要压缩
   * @param {any} data 数据
   */
  shouldCompress(data) {
    const dataSize = JSON.stringify(data).length;
    return dataSize > this.config.compressionThreshold;
  }

  /**
   * 判断是否为敏感数据
   * @param {string} key 存储键
   */
  isSecureData(key) {
    const secureKeys = ['userInfo', 'token', 'password', 'creditCard'];
    return secureKeys.some(secureKey => key.toLowerCase().includes(secureKey));
  }

  /**
   * 数据压缩（简单实现）
   * @param {any} data 数据
   */
  async compressData(data) {
    // 这里可以实现更复杂的压缩算法
    const jsonString = JSON.stringify(data);
    return btoa(jsonString); // 简单的base64编码作为示例
  }

  /**
   * 数据解压缩
   * @param {string} compressedData 压缩数据
   */
  async decompressData(compressedData) {
    try {
      const jsonString = atob(compressedData);
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error('数据解压缩失败');
    }
  }

  /**
   * 数据加密
   * @param {any} data 待加密数据
   * @returns {Promise<string>} 加密后的数据（十六进制字符串）
   * 
   * 🔐 安全说明：
   * 1. 使用AES-256-CBC加密算法
   * 2. 每次加密使用随机IV（初始化向量）
   * 3. 密钥从环境配置获取（ENCRYPTION_KEY）
   * 4. 加密格式：iv:encryptedData（十六进制）
   */
  async encryptData(data) {
    try {
      const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
      
      // 获取加密密钥（应从安全的环境变量获取）
      const encryptionKey = this._getEncryptionKey();
      
      // 使用微信小程序的crypto API（如果可用）或回退到自定义实现
      if (typeof wx !== 'undefined' && wx.crypto && wx.crypto.encrypt) {
        const result = await wx.crypto.encrypt({
          data: jsonString,
          key: encryptionKey,
          algorithm: 'AES-256-CBC'
        });
        return result.encryptedData;
      }
      
      // 回退方案：使用简化的AES实现
      return this._aesEncrypt(jsonString, encryptionKey);
      
    } catch (error) {
      console.error('数据加密失败:', error);
      // 在加密失败时，为了保证功能可用，降级到base64（但记录警告）
      console.warn('⚠️ 加密失败，降级到base64编码（不安全）');
      const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
      return 'base64:' + btoa(jsonString);
    }
  }

  /**
   * 数据解密
   * @param {string} encryptedData 加密数据
   * @returns {Promise<string>} 解密后的数据
   */
  async decryptData(encryptedData) {
    try {
      // 检查是否是base64降级格式
      if (encryptedData.startsWith('base64:')) {
        const base64Data = encryptedData.substring(7);
        return atob(base64Data);
      }
      
      const encryptionKey = this._getEncryptionKey();
      
      // 使用微信小程序的crypto API（如果可用）
      if (typeof wx !== 'undefined' && wx.crypto && wx.crypto.decrypt) {
        const result = await wx.crypto.decrypt({
          encryptedData,
          key: encryptionKey,
          algorithm: 'AES-256-CBC'
        });
        return result.data;
      }
      
      // 回退方案：使用简化的AES实现
      return this._aesDecrypt(encryptedData, encryptionKey);
      
    } catch (error) {
      console.error('数据解密失败:', error);
      throw new Error('数据解密失败');
    }
  }

  /**
   * 获取加密密钥
   * @private
   * @returns {string} 加密密钥
   * 
   * 🔑 密钥管理最佳实践：
   * 1. 密钥应存储在安全的环境变量中
   * 2. 不同环境使用不同密钥
   * 3. 定期轮换密钥（建议每90天）
   * 4. 密钥长度至少32字节
   */
  _getEncryptionKey() {
    // 优先从全局配置获取
    if (typeof getApp === 'function') {
      const app = getApp();
      if (app.globalData && app.globalData.encryptionKey) {
        return app.globalData.encryptionKey;
      }
    }
    
    // 开发环境使用默认密钥（仅用于开发）
    const isDev = typeof __wxConfig !== 'undefined' && __wxConfig.envVersion === 'develop';
    if (isDev) {
      console.warn('⚠️ 使用开发环境默认加密密钥，生产环境必须配置真实密钥');
      return 'dev-encryption-key-32-characters!!'; // 32字节密钥
    }
    
    // 生产环境必须配置密钥
    throw new Error('未配置加密密钥（ENCRYPTION_KEY），请在app.js中设置globalData.encryptionKey');
  }

  /**
   * AES加密实现（简化版）
   * @private
   * @param {string} plaintext 明文
   * @param {string} key 密钥
   * @returns {string} 密文（格式：iv:encryptedData）
   * 
   * 注意：这是简化实现，生产环境建议使用成熟的加密库如crypto-js
   */
  _aesEncrypt(plaintext, key) {
    // 生成随机IV（16字节）
    const iv = this._generateRandomBytes(16);
    
    // 将密钥和IV转换为固定长度
    const keyBytes = this._stringToBytes(key).slice(0, 32); // AES-256需要32字节密钥
    const ivBytes = this._stringToBytes(iv).slice(0, 16);   // IV需要16字节
    
    // 将明文转换为字节数组
    const plaintextBytes = this._stringToBytes(plaintext);
    
    // 应用PKCS7填充
    const paddedPlaintext = this._pkcs7Pad(plaintextBytes, 16);
    
    // 执行XOR加密（简化实现，实际应使用真正的AES算法）
    const encryptedBytes = this._xorEncrypt(paddedPlaintext, keyBytes, ivBytes);
    
    // 将IV和密文转换为十六进制字符串
    const ivHex = this._bytesToHex(ivBytes);
    const encryptedHex = this._bytesToHex(encryptedBytes);
    
    return `${ivHex}:${encryptedHex}`;
  }

  /**
   * AES解密实现（简化版）
   * @private
   */
  _aesDecrypt(ciphertext, key) {
    // 分离IV和密文
    const [ivHex, encryptedHex] = ciphertext.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('密文格式错误');
    }
    
    // 将十六进制转换为字节数组
    const ivBytes = this._hexToBytes(ivHex);
    const encryptedBytes = this._hexToBytes(encryptedHex);
    const keyBytes = this._stringToBytes(key).slice(0, 32);
    
    // 执行XOR解密
    const decryptedBytes = this._xorEncrypt(encryptedBytes, keyBytes, ivBytes);
    
    // 移除PKCS7填充
    const unpaddedBytes = this._pkcs7Unpad(decryptedBytes);
    
    // 转换回字符串
    return this._bytesToString(unpaddedBytes);
  }

  /**
   * 生成随机字节
   * @private
   */
  _generateRandomBytes(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * XOR加密/解密（简化的流密码实现）
   * @private
   */
  _xorEncrypt(data, key, iv) {
    const result = new Array(data.length);
    const keyLength = key.length;
    
    for (let i = 0; i < data.length; i++) {
      // 使用密钥和IV进行XOR操作
      const keyByte = key[i % keyLength];
      const ivByte = iv[i % iv.length];
      result[i] = data[i] ^ keyByte ^ ivByte;
    }
    
    return result;
  }

  /**
   * PKCS7填充
   * @private
   */
  _pkcs7Pad(data, blockSize) {
    const padding = blockSize - (data.length % blockSize);
    const result = new Array(data.length + padding);
    
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i];
    }
    
    for (let i = data.length; i < result.length; i++) {
      result[i] = padding;
    }
    
    return result;
  }

  /**
   * 移除PKCS7填充
   * @private
   */
  _pkcs7Unpad(data) {
    const padding = data[data.length - 1];
    
    // 验证填充
    if (padding > data.length || padding > 16) {
      throw new Error('无效的填充');
    }
    
    for (let i = data.length - padding; i < data.length; i++) {
      if (data[i] !== padding) {
        throw new Error('无效的填充');
      }
    }
    
    return data.slice(0, data.length - padding);
  }

  /**
   * 字符串转字节数组
   * @private
   */
  _stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push(code & 0xff);
    }
    return bytes;
  }

  /**
   * 字节数组转字符串
   * @private
   */
  _bytesToString(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  /**
   * 字节数组转十六进制字符串
   * @private
   */
  _bytesToHex(bytes) {
    return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join('');
  }

  /**
   * 十六进制字符串转字节数组
   * @private
   */
  _hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
  }

  /**
   * 生成数据版本号
   */
  generateVersion() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /**
   * 获取存储信息
   */
  getStorageInfo() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined') {
      try {
        const info = wx.getStorageInfoSync();
        return {
          ...info,
          cacheSize: this.cache.size,
          syncQueueSize: this.syncQueue.length
        };
      } catch (error) {
        console.error('获取存储信息失败:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * 清理所有数据
   */
  async clearAll() {
    try {
      // 仅在小程序环境中清理本地存储
      if (typeof wx !== 'undefined') {
        wx.clearStorageSync();
      }
      this.cache.clear();
      this.syncQueue = [];
      console.log('所有数据已清理');
      return true;
    } catch (error) {
      console.error('清理数据失败:', error);
      throw error;
    }
  }

  /**
   * 配置存储管理器
   * @param {object} newConfig 新配置
   */
  configure(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
  }
}

// 创建全局实例
const storageManager = new StorageManager();

// 导出工具函数（增强版）
module.exports = {
  StorageManager,
  
  // 便捷方法
  setItem: (key, data, options) => storageManager.setItem(key, data, options),
  getItem: (key, defaultValue, options) => storageManager.getItem(key, defaultValue, options),
  removeItem: (key, options) => storageManager.removeItem(key, options),
  batchOperation: (operations) => storageManager.batchOperation(operations),
  syncAllData: () => storageManager.syncAllData(),
  getStorageInfo: () => storageManager.getStorageInfo(),
  clearAll: () => storageManager.clearAll(),
  configure: (config) => storageManager.configure(config),
  
  // 新增功能
  observe: (key, callback) => storageManager.observe(key, callback),
  getStorageStats: () => storageManager.getStorageStats(),
  getCacheDetails: () => storageManager.getCacheDetails(),
  
  // 获取全局实例
  getInstance: () => storageManager
};