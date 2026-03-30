// utils/performance-optimizer.js
/**
 * 小程序性能优化管理器
 *
 * 与后端 services/unified_performance_service.py 保持一致的API设计
 * 实现：
 * - 智能缓存淘汰机制（LRU + LFU + TTL）
 * - 请求去重和防抖节流
 * - 自动化性能告警
 * - 统一的性能指标收集
 */

// 性能指标类型枚举（与后端保持一致）
const MetricType = {
  API_RESPONSE: 'api_response',
  PAGE_LOAD: 'page_load',
  CACHE_HIT: 'cache_hit',
  DB_QUERY: 'db_query',
  RENDER: 'render',
  INTERACTION: 'interaction',
  MEMORY: 'memory',
  NETWORK: 'network',
  ERROR: 'error'
};

// 告警级别枚举
const AlertLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

class PerformanceOptimizer {
  constructor() {
    // 智能缓存系统
    this.cache = new Map();
    this.cacheOrder = []; // LRU顺序
    this.accessCount = {}; // LFU计数
    this.cacheTTL = {}; // TTL数据

    // 请求去重
    this.pendingRequests = new Map();
    this.requestTimestamps = new Map();

    // 防抖节流
    this.throttleTimers = {};
    this.debounceTimers = {};

    this.loadingStates = new Map();
    this.lazyLoadObserver = null;

    // 性能指标存储
    this.performanceMetrics = {
      pageLoadTimes: {},
      apiResponseTimes: {},
      memoryUsage: [],
      errorCounts: 0,
      networkSpeed: [],
      renderTimes: {},
      interactionDelays: {},
      cacheHitRates: {},
      // 新增：统一指标存储
      metrics: {},
      aggregatedStats: {}
    };

    // 告警系统
    this.alerts = [];
    this.alertHandlers = [];

    // 性能监控配置
    this.monitoringConfig = {
      memoryCheckInterval: 30000, // 30秒检查一次内存
      performanceReportInterval: 1800000, // 30分钟生成一次报告
      alertThresholds: {
        // 与后端 unified_performance_service.py 保持一致
        api_response: { warning: 2000, error: 5000, critical: 10000 },
        page_load: { warning: 3000, error: 5000, critical: 10000 },
        db_query: { warning: 1000, error: 3000, critical: 5000 },
        cache_hit: { warning: 50, error: 30, critical: 10 }, // 命中率低于阈值
        memory: { warning: 80, error: 90, critical: 95 },
        error: { warning: 5, error: 10, critical: 20 } // 错误率%
      },
      // 缓存配置
      cacheConfig: {
        maxSize: 500,
        defaultTTL: 300, // 5分钟
        cleanupInterval: 60000 // 1分钟清理一次
      }
    };

    // 缓存统计
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalRequests: 0
    };

    // 去重统计
    this.dedupStats = {
      totalRequests: 0,
      deduplicated: 0,
      unique: 0
    };

    this.initPerformanceMonitoring();
  }

  /**
   * 初始化性能监控
   */
  initPerformanceMonitoring() {
    // 监听内存警告
    // 仅在小程序环境中初始化
    if (typeof wx !== 'undefined' && wx.onMemoryWarning) {
      wx.onMemoryWarning(() => {
        console.warn('内存警告，正在清理缓存...');
        this.recordMemoryUsage(true);
        this.clearLowPriorityCache();
        this.triggerPerformanceAlert('memory', 'Memory warning triggered');
      });
    }

    // 记录应用启动时间
    this.performanceMetrics.appStartTime = Date.now();
    
    // 启动定期监控（延迟启动，避免阻塞应用启动）
    // this.startPeriodicMonitoring();
    setTimeout(() => this.startPeriodicMonitoring(), 3000);
    
    // 监听页面性能
    this.setupPagePerformanceMonitoring();
    
    // 监听网络状态变化
    this.setupNetworkMonitoring();
  }

  /**
   * 懒加载模块
   * @param {string} moduleName - 模块名称
   * @param {function} loader - 加载函数
   * @param {object} options - 配置选项
   */
  async lazyLoadModule(moduleName, loader, options = {}) {
    const { cacheKey = moduleName, ttl = 30 * 60 * 1000, priority = 'normal' } = options;

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < ttl) {
        console.log(`从缓存加载模块: ${moduleName}`);
        this.updateCacheHitRate(cacheKey, true);
        return cached.data;
      }
    }
    
    // 缓存未命中
    this.updateCacheHitRate(cacheKey, false);

    // 检查是否正在加载
    if (this.loadingStates.has(moduleName)) {
      console.log(`等待模块加载: ${moduleName}`);
      return this.loadingStates.get(moduleName);
    }

    // 开始加载
    const loadingPromise = this.loadModuleWithMetrics(moduleName, loader);
    this.loadingStates.set(moduleName, loadingPromise);

    try {
      const result = await loadingPromise;
      
      // 存储到缓存
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
        priority: priority
      });

      console.log(`模块加载完成: ${moduleName}`);
      return result;
    } catch (error) {
      console.error(`模块加载失败: ${moduleName}`, error);
      this.performanceMetrics.errorCounts++;
      throw error;
    } finally {
      this.loadingStates.delete(moduleName);
    }
  }

  /**
   * 带性能监控的模块加载
   */
  async loadModuleWithMetrics(moduleName, loader) {
    const startTime = Date.now();
    
    try {
      const result = await loader();
      const loadTime = Date.now() - startTime;
      
      // 记录加载时间
      if (!this.performanceMetrics.pageLoadTimes[moduleName]) {
        this.performanceMetrics.pageLoadTimes[moduleName] = [];
      }
      this.performanceMetrics.pageLoadTimes[moduleName].push(loadTime);

      console.log(`模块 ${moduleName} 加载耗时: ${loadTime}ms`);
      return result;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      console.error(`模块 ${moduleName} 加载失败，耗时: ${loadTime}ms`, error);
      throw error;
    }
  }

  /**
   * API请求性能监控
   */
  async monitorApiRequest(apiName, requestFn) {
    const startTime = Date.now();
    
    try {
      const result = await requestFn();
      const responseTime = Date.now() - startTime;
      
      // 记录API响应时间
      if (!this.performanceMetrics.apiResponseTimes[apiName]) {
        this.performanceMetrics.apiResponseTimes[apiName] = [];
      }
      this.performanceMetrics.apiResponseTimes[apiName].push(responseTime);

      // 性能预警
      if (responseTime > this.monitoringConfig.alertThresholds.apiResponseTime) {
        console.warn(`API ${apiName} 响应缓慢: ${responseTime}ms`);
        this.triggerPerformanceAlert('api', `${apiName} 响应缓慢: ${responseTime}ms`);
      }
      
      // 记录网络速度（估算）
      if (result && result.data) {
        const dataSize = JSON.stringify(result.data).length;
        const speed = dataSize / (responseTime / 1000); // bytes/second
        this.performanceMetrics.networkSpeed.push({
          timestamp: Date.now(),
          speed: speed,
          apiName: apiName
        });
      }

      return result;
    } catch (error) {
      this.performanceMetrics.errorCounts++;
      this.triggerPerformanceAlert('api', `${apiName} 请求失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 预加载关键资源
   */
  async preloadCriticalResources() {
    const criticalModules = [
      {
        name: 'option-pricing',
        loader: () => require('./option-pricing.js'),
        priority: 'high'
      },
      {
        name: 'enhanced-features',
        loader: () => require('./enhanced-features.js'),
        priority: 'high'
      }
    ];

    const preloadPromises = criticalModules.map(module => 
      this.lazyLoadModule(module.name, module.loader, { priority: module.priority })
    );

    try {
      await Promise.all(preloadPromises);
      console.log('关键资源预加载完成');
    } catch (error) {
      console.error('预加载失败:', error);
    }
  }

  /**
   * 图片懒加载
   */
  setupImageLazyLoading(selector = '.lazy-image') {
    // 仅在小程序环境中初始化
    if (typeof wx !== 'undefined' && wx.createIntersectionObserver) {
      if (!this.lazyLoadObserver) {
        this.lazyLoadObserver = wx.createIntersectionObserver({
          threshold: [0.1]
        });

        this.lazyLoadObserver.observe(selector, (res) => {
          if (res.intersectionRatio > 0) {
            // 图片进入视窗，开始加载
            const dataset = res.dataset;
            if (dataset && dataset.src) {
              // 触发图片加载
              this.loadImage(res.id, dataset.src);
            }
          }
        });
      }
    }
  }

  /**
   * 加载图片
   */
  loadImage(imageId, src) {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined') {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        wx.getImageInfo({
          src: src,
          success: (res) => {
            const loadTime = Date.now() - startTime;
            console.log(`图片加载完成: ${imageId}, 耗时: ${loadTime}ms`);
            resolve(res);
          },
          fail: (error) => {
            console.error(`图片加载失败: ${imageId}`, error);
            reject(error);
          }
        });
      });
    }
  }

  /**
   * 分包预下载
   * 自动检测项目中配置的分包并进行预下载
   * @param {Object} options - 配置选项
   * @param {string[]} options.packages - 指定要预下载的包名列表，为空则预下载所有
   * @param {boolean} options.silent - 是否静默模式（不输出日志）
   */
  predownloadSubpackages(options = {}) {
    const { packages = [], silent = false } = options;

    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined' && wx.preloadSubpackage) {
      // 动态获取分包配置
      let subpackages = [];

      try {
        // 从 __wxConfig 中读取分包配置
        if (typeof __wxConfig !== 'undefined' && __wxConfig.subPackages) {
          subpackages = __wxConfig.subPackages.map(pkg => pkg.name || pkg.root);
        } else if (typeof __wxConfig !== 'undefined' && __wxConfig.subpackages) {
          subpackages = __wxConfig.subpackages.map(pkg => pkg.name || pkg.root);
        }
      } catch (e) {
        if (!silent) console.warn('无法读取分包配置:', e.message);
      }

      // 如果没有配置分包，跳过预下载
      if (subpackages.length === 0) {
        if (!silent) console.log('当前项目未配置分包，跳过分包预下载');
        return Promise.resolve([]);
      }

      // 过滤指定的包
      const targetPackages = packages.length > 0
        ? subpackages.filter(pkg => packages.includes(pkg))
        : subpackages;

      if (!silent) {
        console.log(`准备预下载分包: ${targetPackages.join(', ')}`);
      }

      // 预下载状态跟踪
      const preloadStatus = {
        success: [],
        failed: [],
        total: targetPackages.length
      };

      // 执行预下载
      const preloadPromises = targetPackages.map(subpackage => {
        return new Promise((resolve) => {
          wx.preloadSubpackage({
            name: subpackage,
            success: () => {
              preloadStatus.success.push(subpackage);
              if (!silent) console.log(`✅ 分包预下载成功: ${subpackage}`);
              resolve({ name: subpackage, success: true });
            },
            fail: (error) => {
              preloadStatus.failed.push({ name: subpackage, error });
              if (!silent) console.warn(`❌ 分包预下载失败: ${subpackage}`, error.errMsg || error);
              resolve({ name: subpackage, success: false, error });
            }
          });
        });
      });

      return Promise.all(preloadPromises).then(results => {
        // 记录预下载统计
        if (!this.performanceMetrics.subpackagePreload) {
          this.performanceMetrics.subpackagePreload = [];
        }
        this.performanceMetrics.subpackagePreload.push({
          timestamp: Date.now(),
          ...preloadStatus
        });

        return results;
      });
    }

    return Promise.resolve([]);
  }

  /**
   * 智能分包预下载
   * 根据当前页面路径自动预下载相关分包
   * @param {string} currentPage - 当前页面路径
   */
  smartPreloadSubpackages(currentPage) {
    // 定义页面与分包的映射关系
    const pagePackageMap = {
      'pages/index/index': ['inquiry', 'quotes-ext'],
      'pages/quotes/quotes': ['quotes-ext', 'inquiry'],
      'pages/account/account': ['user'],
      'pages/profile/profile': ['user', 'info'],
      'pages/inquiry/inquiry': ['quotes-ext'],
      'pages/login/login': ['user']
    };

    const packagesToPreload = pagePackageMap[currentPage] || [];

    if (packagesToPreload.length > 0) {
      return this.predownloadSubpackages({ packages: packagesToPreload, silent: true });
    }

    return Promise.resolve([]);
  }

  /**
   * 获取分包预下载统计
   */
  getSubpackagePreloadStats() {
    if (!this.performanceMetrics.subpackagePreload) {
      return { totalPreloads: 0, successRate: 0 };
    }

    const records = this.performanceMetrics.subpackagePreload;
    const totalPreloads = records.length;
    const totalSuccess = records.reduce((sum, r) => sum + r.success.length, 0);
    const totalAttempts = records.reduce((sum, r) => sum + r.total, 0);

    return {
      totalPreloads,
      successRate: totalAttempts > 0 ? (totalSuccess / totalAttempts * 100).toFixed(2) : 0,
      recentRecords: records.slice(-5)
    };
  }

  /**
   * 清理低优先级缓存
   */
  clearLowPriorityCache() {
    let clearedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (value.priority === 'low' || value.priority === 'normal') {
        this.cache.delete(key);
        clearedCount++;
      }
    }

    console.log(`清理了 ${clearedCount} 个低优先级缓存项`);
    return clearedCount;
  }

  /**
   * 获取性能报告
   */
  getPerformanceReport() {
    const report = {
      overview: {
        cacheSize: this.cache.size,
        errorCount: this.performanceMetrics.errorCounts,
        uptime: Date.now() - this.performanceMetrics.appStartTime,
        memoryChecks: this.performanceMetrics.memoryUsage.length,
        alertCount: this.performanceMetrics.alerts ? this.performanceMetrics.alerts.length : 0
      },
      pagePerformance: {},
      apiPerformance: {},
      cachePerformance: {},
      renderPerformance: {},
      interactionPerformance: {},
      networkPerformance: {},
      recentAlerts: this.performanceMetrics.alerts ? this.performanceMetrics.alerts.slice(-10) : [],
      recommendations: []
    };

    // 计算页面加载性能
    Object.entries(this.performanceMetrics.pageLoadTimes).forEach(([page, times]) => {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      
      report.pagePerformance[page] = {
        avgLoadTime: Math.round(avgTime),
        maxLoadTime: maxTime,
        minLoadTime: minTime,
        loadCount: times.length
      };

      // 性能建议
      if (avgTime > 3000) {
        report.recommendations.push(`${page} 页面平均加载时间过长 (${Math.round(avgTime)}ms)，建议优化`);
      }
    });

    // 计算API性能
    Object.entries(this.performanceMetrics.apiResponseTimes).forEach(([api, times]) => {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      
      report.apiPerformance[api] = {
        avgResponseTime: Math.round(avgTime),
        requestCount: times.length
      };

      if (avgTime > 2000) {
        report.recommendations.push(`API ${api} 平均响应时间过长 (${Math.round(avgTime)}ms)，建议优化`);
      }
    });

    // 计算缓存性能
    Object.entries(this.performanceMetrics.cacheHitRates).forEach(([cacheKey, stats]) => {
      const hitRate = stats.totalRequests > 0 ? stats.hits / stats.totalRequests : 0;
      report.cachePerformance[cacheKey] = {
        hitRate: Math.round(hitRate * 100),
        totalRequests: stats.totalRequests,
        hits: stats.hits,
        misses: stats.misses
      };
      
      if (stats.totalRequests > 10 && hitRate < 0.6) {
        report.recommendations.push(`缓存 ${cacheKey} 命中率较低 (${Math.round(hitRate * 100)}%)，建议优化缓存策略`);
      }
    });
    
    // 计算渲染性能
    Object.entries(this.performanceMetrics.renderTimes).forEach(([component, times]) => {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      report.renderPerformance[component] = {
        avgRenderTime: Math.round(avgTime * 100) / 100,
        maxRenderTime: Math.round(maxTime * 100) / 100,
        renderCount: times.length
      };
      
      if (avgTime > this.monitoringConfig.alertThresholds.renderTime) {
        report.recommendations.push(`组件 ${component} 平均渲染时间过长 (${avgTime.toFixed(2)}ms)，建议优化渲染逻辑`);
      }
    });
    
    // 计算交互性能
    Object.entries(this.performanceMetrics.interactionDelays).forEach(([event, delays]) => {
      const avgDelay = delays.reduce((sum, item) => sum + item.delay, 0) / delays.length;
      const errorRate = delays.filter(item => item.hasError).length / delays.length;
      
      report.interactionPerformance[event] = {
        avgDelay: Math.round(avgDelay),
        interactionCount: delays.length,
        errorRate: Math.round(errorRate * 100)
      };
      
      if (avgDelay > 300) {
        report.recommendations.push(`交互事件 ${event} 平均响应时间过长 (${Math.round(avgDelay)}ms)，建议优化处理逻辑`);
      }
    });
    
    // 计算网络性能
    if (this.performanceMetrics.networkSpeed.length > 0) {
      const avgSpeed = this.performanceMetrics.networkSpeed.reduce((sum, item) => sum + item.speed, 0) / this.performanceMetrics.networkSpeed.length;
      report.networkPerformance = {
        avgSpeed: Math.round(avgSpeed),
        speedSamples: this.performanceMetrics.networkSpeed.length,
        unit: 'bytes/second'
      };
    }
    
    // 内存使用分析
    if (this.performanceMetrics.memoryUsage.length > 0) {
      const memoryWarnings = this.performanceMetrics.memoryUsage.filter(item => item.isWarning).length;
      report.overview.memoryWarnings = memoryWarnings;
      
      if (memoryWarnings > 0) {
        report.recommendations.push(`检测到 ${memoryWarnings} 次内存警告，建议优化内存使用`);
      }
    }
    
    return report;
  }

  /**
   * 数据预处理和缓存
   */
  async preprocessAndCache(dataKey, processFn, rawData, options = {}) {
    const { ttl = 10 * 60 * 1000, forceRefresh = false } = options;
    
    if (!forceRefresh && this.cache.has(dataKey)) {
      const cached = this.cache.get(dataKey);
      if (Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
    }

    try {
      const startTime = Date.now();
      const processedData = await processFn(rawData);
      const processTime = Date.now() - startTime;
      
      console.log(`数据预处理完成: ${dataKey}, 耗时: ${processTime}ms`);
      
      // 缓存处理后的数据
      this.cache.set(dataKey, {
        data: processedData,
        timestamp: Date.now(),
        priority: 'normal'
      });

      return processedData;
    } catch (error) {
      console.error(`数据预处理失败: ${dataKey}`, error);
      throw error;
    }
  }

  /**
   * 启动定期监控
   */
  startPeriodicMonitoring() {
    // 定期检查内存使用情况
    this.memoryCheckTimer = setInterval(() => {
      this.recordMemoryUsage();
    }, this.monitoringConfig.memoryCheckInterval);
    
    // 定期生成性能报告
    this.reportTimer = setInterval(() => {
      this.generatePerformanceAlert();
    }, this.monitoringConfig.performanceReportInterval);
  }
  
  /**
   * 记录内存使用情况
   */
  recordMemoryUsage(isWarning = false) {
    try {
      // 仅在小程序环境中执行
      if (typeof wx !== 'undefined' && wx.getPerformance) {
        const performance = wx.getPerformance();
        const memoryInfo = {
          timestamp: Date.now(),
          isWarning: isWarning,
          cacheSize: this.cache.size,
          loadingStates: this.loadingStates.size
        };
        
        this.performanceMetrics.memoryUsage.push(memoryInfo);
        
        // 保持最近100条记录
        if (this.performanceMetrics.memoryUsage.length > 100) {
          this.performanceMetrics.memoryUsage.shift();
        }
      }
    } catch (error) {
      console.error('记录内存使用情况失败:', error);
    }
  }
  
  /**
   * 设置页面性能监控
   */
  setupPagePerformanceMonitoring() {
    // 监控页面路由变化
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined' && wx.onAppRoute) {
      wx.onAppRoute((res) => {
        this.recordPageNavigation(res);
      });
    }
  }
  
  /**
   * 记录页面导航性能
   */
  recordPageNavigation(routeInfo) {
    const navigationMetric = {
      timestamp: Date.now(),
      path: routeInfo.path,
      openType: routeInfo.openType
    };
    
    if (!this.performanceMetrics.navigationTimes) {
      this.performanceMetrics.navigationTimes = [];
    }
    
    this.performanceMetrics.navigationTimes.push(navigationMetric);
  }
  
  /**
   * 设置网络监控
   */
  setupNetworkMonitoring() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined' && wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange((res) => {
        this.recordNetworkChange(res);
      });
    }
  }
  
  /**
   * 记录网络状态变化
   */
  recordNetworkChange(networkInfo) {
    const networkMetric = {
      timestamp: Date.now(),
      isConnected: networkInfo.isConnected,
      networkType: networkInfo.networkType
    };
    
    if (!this.performanceMetrics.networkChanges) {
      this.performanceMetrics.networkChanges = [];
    }
    
    this.performanceMetrics.networkChanges.push(networkMetric);
    
    // 网络状态变化时清理API缓存
    if (!networkInfo.isConnected) {
      console.warn('网络断开，清理API缓存');
      this.clearApiCache();
    }
  }
  
  /**
   * 清理API相关缓存
   */
  clearApiCache() {
    let clearedCount = 0;
    for (const [key, value] of this.cache.entries()) {
      if (key.includes('api-') || key.includes('request-')) {
        this.cache.delete(key);
        clearedCount++;
      }
    }
    console.log(`清理了 ${clearedCount} 个API缓存项`);
  }
  
  /**
   * 监控渲染性能
   */
  monitorRenderPerformance(componentName, renderFunction) {
    return async (...args) => {
      // 仅在小程序环境中执行
      if (typeof performance !== 'undefined' && performance.now) {
        const startTime = performance.now();
        
        try {
          const result = await renderFunction.apply(this, args);
          const renderTime = performance.now() - startTime;
          
          // 记录渲染时间
          if (!this.performanceMetrics.renderTimes[componentName]) {
            this.performanceMetrics.renderTimes[componentName] = [];
          }
          this.performanceMetrics.renderTimes[componentName].push(renderTime);
          
          // 渲染性能警告
          if (renderTime > this.monitoringConfig.alertThresholds.renderTime) {
            console.warn(`组件 ${componentName} 渲染耗时过长: ${renderTime.toFixed(2)}ms`);
            this.triggerPerformanceAlert('render', `${componentName} 渲染耗时: ${renderTime.toFixed(2)}ms`);
          }
          
          return result;
        } catch (error) {
          console.error(`组件 ${componentName} 渲染失败:`, error);
          throw error;
        }
      } else {
        // 在Node.js环境中直接执行
        return await renderFunction.apply(this, args);
      }
    };
  }
  
  /**
   * 监控用户交互延迟
   */
  monitorInteractionDelay(eventName, handler) {
    return function(e) {
      const startTime = Date.now();
      
      // 创建性能监控的promise包装
      const result = handler.call(this, e);
      
      // 如果是promise，监控完成时间
      if (result && typeof result.then === 'function') {
        result.then(() => {
          const delay = Date.now() - startTime;
          performanceOptimizer.recordInteractionDelay(eventName, delay);
        }).catch((error) => {
          const delay = Date.now() - startTime;
          performanceOptimizer.recordInteractionDelay(eventName, delay, error);
        });
      } else {
        // 同步操作直接记录
        const delay = Date.now() - startTime;
        performanceOptimizer.recordInteractionDelay(eventName, delay);
      }
      
      return result;
    };
  }
  
  /**
   * 记录交互延迟
   */
  recordInteractionDelay(eventName, delay, error = null) {
    if (!this.performanceMetrics.interactionDelays[eventName]) {
      this.performanceMetrics.interactionDelays[eventName] = [];
    }
    
    this.performanceMetrics.interactionDelays[eventName].push({
      delay: delay,
      timestamp: Date.now(),
      hasError: !!error
    });
    
    // 交互延迟警告
    if (delay > 300) { // 300ms以上认为是明显延迟
      console.warn(`交互事件 ${eventName} 响应延迟: ${delay}ms`);
      this.triggerPerformanceAlert('interaction', `${eventName} 响应延迟: ${delay}ms`);
    }
  }
  
  /**
   * 计算缓存命中率
   */
  updateCacheHitRate(cacheKey, isHit) {
    if (!this.performanceMetrics.cacheHitRates[cacheKey]) {
      this.performanceMetrics.cacheHitRates[cacheKey] = {
        hits: 0,
        misses: 0,
        totalRequests: 0
      };
    }
    
    const cacheStats = this.performanceMetrics.cacheHitRates[cacheKey];
    cacheStats.totalRequests++;
    
    if (isHit) {
      cacheStats.hits++;
    } else {
      cacheStats.misses++;
    }
  }
  
  /**
   * 触发性能警告
   */
  triggerPerformanceAlert(type, message) {
    const alert = {
      type: type,
      message: message,
      timestamp: Date.now()
    };
    
    if (!this.performanceMetrics.alerts) {
      this.performanceMetrics.alerts = [];
    }
    
    this.performanceMetrics.alerts.push(alert);
    
    // 保持最近50条警告
    if (this.performanceMetrics.alerts.length > 50) {
      this.performanceMetrics.alerts.shift();
    }
    
    // 在控制台输出警告
    console.warn(`[性能警告] ${type}: ${message}`);
  }
  
  /**
   * 生成性能警告检查
   */
  generatePerformanceAlert() {
    const report = this.getPerformanceReport();
    
    // 检查各项性能指标
    Object.entries(report.pagePerformance).forEach(([page, metrics]) => {
      if (metrics.avgLoadTime > this.monitoringConfig.alertThresholds.pageLoadTime) {
        this.triggerPerformanceAlert('page', `页面 ${page} 平均加载时间过长: ${metrics.avgLoadTime}ms`);
      }
    });
    
    Object.entries(report.apiPerformance).forEach(([api, metrics]) => {
      if (metrics.avgResponseTime > this.monitoringConfig.alertThresholds.apiResponseTime) {
        this.triggerPerformanceAlert('api', `API ${api} 平均响应时间过长: ${metrics.avgResponseTime}ms`);
      }
    });
    
    // 检查缓存命中率
    Object.entries(this.performanceMetrics.cacheHitRates).forEach(([cacheKey, stats]) => {
      const hitRate = stats.hits / stats.totalRequests;
      if (stats.totalRequests > 10 && hitRate < 0.5) { // 请求数大于10且命中率低于50%
        this.triggerPerformanceAlert('cache', `缓存 ${cacheKey} 命中率过低: ${(hitRate * 100).toFixed(1)}%`);
      }
    });
  }
  
  // ==================== 智能缓存系统 ====================

  /**
   * 智能缓存获取（LRU + LFU + TTL）
   * 参考: services/unified_performance_service.py SmartCache
   */
  smartCacheGet(key) {
    this.cacheStats.totalRequests++;

    // 检查是否存在
    if (!this.cache.has(key)) {
      this.cacheStats.misses++;
      return null;
    }

    // 检查TTL
    if (this.cacheTTL[key]) {
      const { expiry } = this.cacheTTL[key];
      if (Date.now() > expiry) {
        this._removeCacheEntry(key);
        this.cacheStats.misses++;
        this.cacheStats.expirations++;
        return null;
      }
    }

    // LRU: 移到末尾
    const idx = this.cacheOrder.indexOf(key);
    if (idx > -1) {
      this.cacheOrder.splice(idx, 1);
      this.cacheOrder.push(key);
    }

    // LFU: 增加访问计数
    this.accessCount[key] = (this.accessCount[key] || 0) + 1;

    this.cacheStats.hits++;
    return this.cache.get(key);
  }

  /**
   * 智能缓存设置
   */
  smartCacheSet(key, value, ttl = null) {
    ttl = ttl || this.monitoringConfig.cacheConfig.defaultTTL * 1000;
    const now = Date.now();
    const expiry = now + ttl;

    // 如果已存在，更新
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.cacheTTL[key] = { expiry, created: now };
      // LRU: 移到末尾
      const idx = this.cacheOrder.indexOf(key);
      if (idx > -1) {
        this.cacheOrder.splice(idx, 1);
        this.cacheOrder.push(key);
      }
      return true;
    }

    // 检查容量
    if (this.cache.size >= this.monitoringConfig.cacheConfig.maxSize) {
      this._evictCache();
    }

    // 添加新条目
    this.cache.set(key, value);
    this.cacheOrder.push(key);
    this.cacheTTL[key] = { expiry, created: now };
    this.accessCount[key] = 0;

    return true;
  }

  /**
   * 移除缓存条目
   */
  _removeCacheEntry(key) {
    this.cache.delete(key);
    delete this.cacheTTL[key];
    delete this.accessCount[key];
    const idx = this.cacheOrder.indexOf(key);
    if (idx > -1) {
      this.cacheOrder.splice(idx, 1);
    }
  }

  /**
   * 混合淘汰策略
   */
  _evictCache() {
    const now = Date.now();

    // 1. 清理过期条目
    for (const key of Object.keys(this.cacheTTL)) {
      if (now > this.cacheTTL[key].expiry) {
        this._removeCacheEntry(key);
        this.cacheStats.expirations++;
      }
    }

    if (this.cache.size < this.monitoringConfig.cacheConfig.maxSize) {
      return;
    }

    // 2. LFU+LRU混合淘汰
    const items = [];
    for (const key of this.cacheOrder) {
      const accessFreq = this.accessCount[key] || 0;
      const created = this.cacheTTL[key]?.created || now;
      const age = (now - created) / 1000;

      // 分数 = 访问频率 * 10 - 年龄(秒) * 0.1
      const score = accessFreq * 10 - age * 0.1;
      items.push({ key, score });
    }

    // 按分数升序排列
    items.sort((a, b) => a.score - b.score);
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.1));

    for (let i = 0; i < evictCount && i < items.length; i++) {
      this._removeCacheEntry(items[i].key);
      this.cacheStats.evictions++;
    }
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    const total = this.cacheStats.totalRequests;
    const hitRate = total > 0 ? (this.cacheStats.hits / total * 100).toFixed(2) : 0;
    return {
      size: this.cache.size,
      maxSize: this.monitoringConfig.cacheConfig.maxSize,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      hitRate: parseFloat(hitRate),
      evictions: this.cacheStats.evictions,
      expirations: this.cacheStats.expirations,
      totalRequests: total
    };
  }

  // ==================== 请求去重系统 ====================

  /**
   * 检查请求是否重复
   * 参考: services/unified_performance_service.py RequestDeduplicator
   */
  checkDuplicateRequest(requestId, params = null) {
    this.dedupStats.totalRequests++;

    // 生成请求key
    let key = requestId;
    if (params) {
      const paramsStr = JSON.stringify(params);
      const paramsHash = this._simpleHash(paramsStr);
      key = `${requestId}:${paramsHash}`;
    }

    // 清理过期的pending请求（超过5秒）- 优化：延长去重窗口以提高去重效果
    const now = Date.now();
    for (const [k, ts] of this.requestTimestamps.entries()) {
      if (now - ts > 5000) {
        this.pendingRequests.delete(k);
        this.requestTimestamps.delete(k);
      }
    }

    if (this.pendingRequests.has(key)) {
      this.dedupStats.deduplicated++;
      return { isDuplicate: true, key };
    }

    this.dedupStats.unique++;
    this.pendingRequests.set(key, true);
    this.requestTimestamps.set(key, now);
    return { isDuplicate: false, key };
  }

  /**
   * 标记请求完成
   */
  markRequestComplete(key) {
    this.pendingRequests.delete(key);
    this.requestTimestamps.delete(key);
  }

  /**
   * 简单哈希函数
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  /**
   * 获取去重统计
   */
  getDedupStats() {
    const total = this.dedupStats.totalRequests;
    const dedupRate = total > 0 ? (this.dedupStats.deduplicated / total * 100).toFixed(2) : 0;
    return {
      totalRequests: total,
      deduplicated: this.dedupStats.deduplicated,
      unique: this.dedupStats.unique,
      dedupRate: parseFloat(dedupRate),
      pendingCount: this.pendingRequests.size
    };
  }

  // ==================== 防抖节流系统 ====================

  /**
   * 节流执行
   */
  throttleExecute(key, func, interval) {
    const now = Date.now();
    const lastExec = this.throttleTimers[key] || 0;

    if (now - lastExec >= interval) {
      this.throttleTimers[key] = now;
      return func();
    }
    return null;
  }

  /**
   * 防抖执行
   */
  debounceExecute(key, func, delay) {
    // 取消之前的计时器
    if (this.debounceTimers[key]) {
      clearTimeout(this.debounceTimers[key]);
    }

    // 创建新计时器
    this.debounceTimers[key] = setTimeout(() => {
      func();
      delete this.debounceTimers[key];
    }, delay);
  }

  // ==================== 增强告警系统 ====================

  /**
   * 添加告警处理器
   */
  addAlertHandler(handler) {
    if (typeof handler === 'function') {
      this.alertHandlers.push(handler);
    }
  }

  /**
   * 触发告警
   */
  triggerAlert(alertType, level, message, metricValue, threshold) {
    const alert = {
      alertType,
      level,
      message,
      metricValue,
      threshold,
      timestamp: Date.now(),
      resolved: false
    };

    this.alerts.push(alert);

    // 保持最近100条
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // 触发处理器
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (e) {
        console.error('告警处理器执行失败:', e);
      }
    }

    // 控制台输出
    const levelMap = {
      [AlertLevel.INFO]: console.log,
      [AlertLevel.WARNING]: console.warn,
      [AlertLevel.ERROR]: console.error,
      [AlertLevel.CRITICAL]: console.error
    };
    const logFunc = levelMap[level] || console.log;
    logFunc(`[性能告警][${level.toUpperCase()}] ${message}`);
  }

  /**
   * 检查并触发告警
   */
  checkAndAlert(metricType, metricName, value) {
    const thresholds = this.monitoringConfig.alertThresholds[metricType];
    if (!thresholds) return null;

    let level = null;
    let threshold = null;

    // 缓存命中率的判断逻辑相反
    if (metricType === 'cache_hit') {
      if (value < thresholds.critical) {
        level = AlertLevel.CRITICAL;
        threshold = thresholds.critical;
      } else if (value < thresholds.error) {
        level = AlertLevel.ERROR;
        threshold = thresholds.error;
      } else if (value < thresholds.warning) {
        level = AlertLevel.WARNING;
        threshold = thresholds.warning;
      }
    } else {
      if (value > thresholds.critical) {
        level = AlertLevel.CRITICAL;
        threshold = thresholds.critical;
      } else if (value > thresholds.error) {
        level = AlertLevel.ERROR;
        threshold = thresholds.error;
      } else if (value > thresholds.warning) {
        level = AlertLevel.WARNING;
        threshold = thresholds.warning;
      }
    }

    if (level) {
      const unit = metricType === 'cache_hit' ? '%' : 'ms';
      this.triggerAlert(
        metricType,
        level,
        `${metricName} ${level}: ${value}${unit} (阈值: ${threshold})`,
        value,
        threshold
      );
    }

    return level ? { level, threshold } : null;
  }

  /**
   * 获取告警列表
   */
  getAlerts(level = null, limit = 50) {
    let alerts = this.alerts;
    if (level) {
      alerts = alerts.filter(a => a.level === level);
    }
    return alerts.slice(-limit);
  }

  /**
   * 获取告警统计
   */
  getAlertStats() {
    const stats = {
      total: this.alerts.length,
      byLevel: {},
      byType: {},
      recentCount: 0
    };

    const oneHourAgo = Date.now() - 3600000;

    for (const alert of this.alerts) {
      // 按级别统计
      stats.byLevel[alert.level] = (stats.byLevel[alert.level] || 0) + 1;
      // 按类型统计
      stats.byType[alert.alertType] = (stats.byType[alert.alertType] || 0) + 1;
      // 最近1小时
      if (alert.timestamp > oneHourAgo) {
        stats.recentCount++;
      }
    }

    return stats;
  }

  // ==================== 统一性能报告 ====================

  /**
   * 生成增强版性能报告
   * 参考: services/unified_performance_service.py get_performance_report
   */
  getEnhancedPerformanceReport() {
    const basicReport = this.getPerformanceReport();

    const report = {
      generatedAt: new Date().toISOString(),
      uptime: Date.now() - (this.performanceMetrics.appStartTime || Date.now()),
      summary: {
        ...basicReport.overview,
        cacheStats: this.getCacheStats(),
        dedupStats: this.getDedupStats(),
        alertStats: this.getAlertStats()
      },
      metrics: basicReport,
      alerts: {
        recent: this.getAlerts(null, 20),
        stats: this.getAlertStats()
      },
      recommendations: basicReport.recommendations || []
    };

    // 添加智能建议
    const cacheStats = this.getCacheStats();
    if (cacheStats.totalRequests > 10 && cacheStats.hitRate < 60) {
      report.recommendations.push({
        type: 'cache',
        priority: 'high',
        message: `缓存命中率 ${cacheStats.hitRate}% 较低，建议优化缓存策略或增加TTL`
      });
    }

    const dedupStats = this.getDedupStats();
    if (dedupStats.dedupRate > 20) {
      report.recommendations.push({
        type: 'network',
        priority: 'medium',
        message: `请求去重率 ${dedupStats.dedupRate}%，存在较多重复请求，建议优化前端请求逻辑`
      });
    }

    return report;
  }

  // ==================== 与后端同步 ====================

  /**
   * 同步性能数据到后端
   */
  async syncToBackend(apiUrl) {
    try {
      const report = this.getEnhancedPerformanceReport();

      // 使用 wx.request 发送到后端
      if (typeof wx !== 'undefined') {
        return new Promise((resolve, reject) => {
          wx.request({
            url: `${apiUrl}/performance/metrics`,
            method: 'POST',
            data: {
              source: 'miniprogram',
              timestamp: Date.now(),
              metrics: report.metrics,
              cacheStats: report.summary.cacheStats,
              dedupStats: report.summary.dedupStats,
              alerts: report.alerts.recent
            },
            success: (res) => resolve(res),
            fail: (err) => {
              console.warn('同步性能数据到后端失败:', err);
              reject(err);
            }
          });
        });
      }
    } catch (e) {
      console.error('同步性能数据失败:', e);
    }
    return null;
  }

  /**
   * 销毁性能优化器
   */
  destroy() {
    if (this.lazyLoadObserver) {
      this.lazyLoadObserver.disconnect();
      this.lazyLoadObserver = null;
    }

    // 清理定时器
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
    }
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.cache.clear();
    this.loadingStates.clear();
    this.pendingRequests.clear();
    this.alerts = [];
    this.alertHandlers = [];

    console.log('性能优化器已销毁');
  }
}

// 创建全局实例
const performanceOptimizer = new PerformanceOptimizer();

// 导出工具函数和常量
module.exports = {
  PerformanceOptimizer,
  MetricType,
  AlertLevel,

  // 便捷方法
  lazyLoad: (moduleName, loader, options) =>
    performanceOptimizer.lazyLoadModule(moduleName, loader, options),

  monitorApi: (apiName, requestFn) =>
    performanceOptimizer.monitorApiRequest(apiName, requestFn),

  preloadCritical: () =>
    performanceOptimizer.preloadCriticalResources(),

  setupImageLazy: (selector) =>
    performanceOptimizer.setupImageLazyLoading(selector),

  clearCache: () =>
    performanceOptimizer.clearLowPriorityCache(),

  getReport: () =>
    performanceOptimizer.getPerformanceReport(),

  getEnhancedReport: () =>
    performanceOptimizer.getEnhancedPerformanceReport(),

  preprocessData: (dataKey, processFn, rawData, options) =>
    performanceOptimizer.preprocessAndCache(dataKey, processFn, rawData, options),

  // 智能缓存
  cacheGet: (key) => performanceOptimizer.smartCacheGet(key),
  cacheSet: (key, value, ttl) => performanceOptimizer.smartCacheSet(key, value, ttl),
  cacheStats: () => performanceOptimizer.getCacheStats(),

  // 请求去重
  checkDuplicate: (requestId, params) => performanceOptimizer.checkDuplicateRequest(requestId, params),
  markComplete: (key) => performanceOptimizer.markRequestComplete(key),
  dedupStats: () => performanceOptimizer.getDedupStats(),

  // 防抖节流
  throttle: (key, func, interval) => performanceOptimizer.throttleExecute(key, func, interval),
  debounce: (key, func, delay) => performanceOptimizer.debounceExecute(key, func, delay),

  // 告警系统
  addAlertHandler: (handler) => performanceOptimizer.addAlertHandler(handler),
  getAlerts: (level, limit) => performanceOptimizer.getAlerts(level, limit),
  alertStats: () => performanceOptimizer.getAlertStats(),

  // 渲染和交互监控
  monitorRender: (componentName, renderFunction) =>
    performanceOptimizer.monitorRenderPerformance(componentName, renderFunction),

  monitorInteraction: (eventName, handler) =>
    performanceOptimizer.monitorInteractionDelay(eventName, handler),

  recordMemory: () =>
    performanceOptimizer.recordMemoryUsage(),

  // 配置
  configure: (config) => {
    performanceOptimizer.monitoringConfig = {
      ...performanceOptimizer.monitoringConfig,
      ...config
    };
  },

  // 后端同步
  syncToBackend: (apiUrl) => performanceOptimizer.syncToBackend(apiUrl),

  // 分包预下载
  predownloadSubpackages: (options) => performanceOptimizer.predownloadSubpackages(options),
  smartPreload: (currentPage) => performanceOptimizer.smartPreloadSubpackages(currentPage),
  subpackageStats: () => performanceOptimizer.getSubpackagePreloadStats(),

  // 获取全局实例
  getInstance: () => performanceOptimizer
};