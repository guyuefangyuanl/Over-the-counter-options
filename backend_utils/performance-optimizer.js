// utils/performance-optimizer.js
/**
 * 小程序性能优化管理器
 * 实现懒加载、代码分割、缓存管理等性能优化功能
 */

class PerformanceOptimizer {
  constructor() {
    this.cache = new Map();
    this.loadingStates = new Map();
    this.lazyLoadObserver = null;
    this.performanceMetrics = {
      pageLoadTimes: {},
      apiResponseTimes: {},
      memoryUsage: [],
      errorCounts: 0,
      networkSpeed: [],
      renderTimes: {},
      interactionDelays: {},
      cacheHitRates: {}
    };
    
    // 性能监控配置
    this.monitoringConfig = {
      memoryCheckInterval: 30000, // 30秒检查一次内存
      performanceReportInterval: 1800000, // 30分钟生成一次报告
      alertThresholds: {
        memoryUsage: 80, // 内存使用率阈值 80%
        apiResponseTime: 3000, // API响应时间阈值 3秒
        pageLoadTime: 2000, // 页面加载时间阈值 2秒
        renderTime: 16 // 渲染时间阈值 16ms (60fps)
      }
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
    
    // 启动定期监控
    this.startPeriodicMonitoring();
    
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
   */
  predownloadSubpackages() {
    // 仅在小程序环境中执行
    if (typeof wx !== 'undefined' && wx.preloadSubpackage) {
      const subpackages = ['charts', 'advanced-tools'];
      
      subpackages.forEach(subpackage => {
        wx.preloadSubpackage({
          name: subpackage,
          success: () => {
            console.log(`分包预下载成功: ${subpackage}`);
          },
          fail: (error) => {
            console.error(`分包预下载失败: ${subpackage}`, error);
          }
        });
      });
    }
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
    
    console.log('性能优化器已销毁');
  }
}

// 创建全局实例
const performanceOptimizer = new PerformanceOptimizer();

// 导出工具函数
module.exports = {
  PerformanceOptimizer,
  
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
  
  preprocessData: (dataKey, processFn, rawData, options) =>
    performanceOptimizer.preprocessAndCache(dataKey, processFn, rawData, options),
  
  // 新增的增强功能
  monitorRender: (componentName, renderFunction) =>
    performanceOptimizer.monitorRenderPerformance(componentName, renderFunction),
  
  monitorInteraction: (eventName, handler) =>
    performanceOptimizer.monitorInteractionDelay(eventName, handler),
  
  recordMemory: () =>
    performanceOptimizer.recordMemoryUsage(),
  
  configure: (config) => {
    performanceOptimizer.monitoringConfig = {
      ...performanceOptimizer.monitoringConfig,
      ...config
    };
  },

  // 获取全局实例
  getInstance: () => performanceOptimizer
};