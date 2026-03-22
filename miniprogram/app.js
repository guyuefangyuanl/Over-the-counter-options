// app.js
const NotificationManager = require('./utils/notification-manager.js');
const loginService = require('./utils/loginService.js');
const performanceOptimizer = require('./utils/performance-optimizer.js');
const storageManager = require('./utils/storage-manager.js');
const uiEnhancer = require('./utils/user-experience-enhancer.js');
const { getErrorReporter } = require('./utils/error-reporter.js');

App({
  globalData: {
    userInfo: null,
    optionPricing: null,
    notificationManager: null,
    performanceOptimizer: null,
    storageManager: null,
    uiEnhancer: null,
    // 报价页跳转参数
    pendingQuoteParams: null,
    // 性能监控
    performance: {
      startTime: Date.now(),
      pageLoadTimes: {},
      errorCount: 0
    },
    // 🔐 加密密钥配置（从安全配置获取）
    // 生产环境：通过云开发环境变量或后端接口获取
    // 开发环境：使用本地配置或默认值
    encryptionKey: null, // 运行时初始化，不再硬编码

    // 🚫 Mock登录控制（安全配置）
    // 生产环境自动禁用Mock登录
    // true = 允许开发环境使用Mock登录（默认）
    // false = 禁止所有Mock登录，强制使用真实认证
    allowMockLogin: true,

    // ⚠️ 当前是否处于Mock模式（运行时设置）
    isMockMode: false
  },
  onLaunch: function() {
    console.log('小程序启动');

    // 初始化错误上报器
    this.errorReporter = getErrorReporter();

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      try {
        wx.cloud.init({
          env: 'develop-8gx7kh9g045e6c9a',
          traceUser: true,
        })
        console.log('云开发初始化成功，环境ID: develop-8gx7kh9g045e6c9a')
      } catch (e) {
        // WACloud.js 在开发者工具缓存损坏时可能加载失败，catch 后不影响主业务逻辑
        console.warn('[app] 云开发初始化失败（不影响主功能）:', e.message)
      }
    }

    this.initializeCoreServices();
    this.updateAppLogs();
    this.initEncryptionKey();
    this.checkAutoLogin();
    this.initPerformanceMonitoring();
    
    // 初始化错误处理
    this.initErrorHandling();
  },
  
  // 🔐 安全初始化加密密钥
  initEncryptionKey: function() {
    const self = this;
    
    // 优先从云开发环境变量获取
    if (typeof wx !== 'undefined' && wx.cloud) {
      try {
        wx.cloud.callFunction({
          name: 'getSecureConfig',
          data: { key: 'encryptionKey' }
        }).then(res => {
          if (res.result && res.result.encryptionKey) {
            self.globalData.encryptionKey = res.result.encryptionKey;
            console.log('✅ 加密密钥从云环境加载成功');
          } else {
            // 云函数未返回，使用本地存储的密钥
            self.loadLocalEncryptionKey();
          }
        }).catch(err => {
          console.warn('云函数获取加密密钥失败，使用本地配置:', err.message);
          self.loadLocalEncryptionKey();
        });
      } catch (e) {
        console.warn('加密密钥初始化异常:', e.message);
        self.loadLocalEncryptionKey();
      }
    } else {
      self.loadLocalEncryptionKey();
    }
  },
  
  // 从本地存储加载加密密钥（开发环境）
  loadLocalEncryptionKey: function() {
    try {
      // 尝试从本地存储获取
      const storedKey = wx.getStorageSync('encryption_key');
      if (storedKey && storedKey.length >= 32) {
        this.globalData.encryptionKey = storedKey;
        console.log('✅ 加密密钥从本地存储加载');
        return;
      }
      
      // 开发环境：检查是否为生产环境
      const accountInfo = wx.getAccountInfoSync();
      const envVersion = accountInfo?.miniProgram?.envVersion || 'develop';
      
      if (envVersion === 'release') {
        // 生产环境但没有密钥，记录严重警告
        console.error('🚨 生产环境缺少加密密钥！请配置云环境变量或后端服务');
        this.globalData.encryptionKey = null; // 强制为空，不允许使用默认值
      } else {
        // 开发环境：生成临时密钥（仅用于开发测试）
        console.warn('⚠️ 开发环境使用临时密钥，生产环境请配置安全密钥');
        this.globalData.encryptionKey = 'DEV_TEMP_KEY_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      }
    } catch (e) {
      console.error('加载本地加密密钥失败:', e);
      this.globalData.encryptionKey = null;
    }
  },
  
  // 初始化错误处理
  initErrorHandling: function() {
    const self = this;
    
    // 重写全局错误处理
    const originalOnError = this.onError;
    this.onError = function(error) {
      console.error('小程序错误:', error);
      self.globalData.performance.errorCount++;
      
      // 使用错误上报器
      if (self.errorReporter) {
        self.errorReporter.report({
          type: 'runtime_error',
          message: error,
          stack: error.stack || '',
          timestamp: Date.now(),
          page: self.getCurrentPageRoute(),
          systemInfo: wx.getSystemInfoSync()
        });
      }
    };
    
    // 监听未处理的Promise异常
    wx.onUnhandledRejection((res) => {
      if (self.errorReporter) {
        self.errorReporter.onUnhandledRejection(res);
      }
    });
    
    console.log('错误处理初始化完成');
  },
  
  // 获取当前页面路径
  getCurrentPageRoute: function() {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      return pages[pages.length - 1].route;
    }
    return 'unknown';
  },
  
  // 初始化核心服�?
  initializeCoreServices: function() {
    // 初始化存储管理器
    this.globalData.storageManager = storageManager.getInstance();
    
    // 初始化性能优化�?
    this.globalData.performanceOptimizer = performanceOptimizer.getInstance();
    
    // 初始化UI增强�?
    this.globalData.uiEnhancer = uiEnhancer.getInstance();
    
    // 初始化通知系统
    this.globalData.notificationManager = new NotificationManager();
    
    // 预加载关键资�?
    this.preloadCriticalResources();
    
    console.log('核心服务初始化完成');
  },
  
  // 更新应用日志（使用新存储管理器）
  updateAppLogs: function() {
    const self = this;
    
    // 使用异步方式处理，避免阻塞主线程
    setTimeout(async function() {
      try {
        const logs = await self.globalData.storageManager.getItem('app_logs', []);
        logs.unshift(Date.now());
        
        // 保留最�?0条日�?
        const trimmedLogs = logs.slice(0, 50);
        
        await self.globalData.storageManager.setItem('app_logs', trimmedLogs, {
          ttl: 7 * 24 * 60 * 60 * 1000, // 7天缓�?
          sync: false
        });
        
      } catch (error) {
        console.error('更新应用日志失败:', error);
        // 降级到传统存储方�?
        const logs = wx.getStorageSync('logs') || [];
        logs.unshift(Date.now());
        wx.setStorageSync('logs', logs.slice(0, 50));
      }
    }, 0);
  },
  
  // 预加载关键资�?
  preloadCriticalResources: function() {
    const self = this;
    
    // 使用异步方式预加载，避免阻塞启动
    setTimeout(async function() {
      try {
        // 懒加载期权定价系�?
        self.globalData.optionPricing = await performanceOptimizer.lazyLoad(
          'option-pricing',
          () => {
            const OptionPricingSystem = require('./utils/option-pricing.js');
            return new OptionPricingSystem();
          },
          { priority: 'high' }
        );
        
        // 预加载其他关键模�?
        if (self.globalData.performanceOptimizer && typeof self.globalData.performanceOptimizer.preloadCriticalResources === 'function') {
          await self.globalData.performanceOptimizer.preloadCriticalResources();
        }
        
        console.log('关键资源预加载完成');
      } catch (error) {
        console.error('关键资源预加载失败', error);
      }
    }, 500); // 延迟500ms执行，给主线程更多时间完成初始化
  },
  
  // 检查自动登录
  checkAutoLogin: function() {
    console.log('检查自动登录状态');
    
    if (loginService.isLoggedIn()) {
      // 尝试自动登录验证
      loginService.autoLogin()
        .then(result => {
          console.log('自动登录成功:', result);
          this.globalData.userInfo = loginService.getCurrentUser();
        })
        .catch(error => {
          console.log('自动登录失败:', error.message);
          // 登录失败，清除状�?
          loginService.clearLoginState();
          this.globalData.userInfo = null;
        });
    } else {
      console.log('用户未登录');
    }
  },
  
  // 性能监控初始?
  initPerformanceMonitoring: function() {
    // 使用新的性能优化器，避免重写Page函数
    const self = this;
    
    // 记录应用启动时间
    self.globalData.performance.appLaunchTime = Date.now();
    
    // 监听页面性能（不重写Page函数）
    wx.onMemoryWarning && wx.onMemoryWarning(function() {
      console.warn('内存警告，正在清理缓存..');
      if (self.globalData.performanceOptimizer && typeof self.globalData.performanceOptimizer.clearLowPriorityCache === 'function') {
        self.globalData.performanceOptimizer.clearLowPriorityCache();
      }
    });
    
    // 定期生成性能报告
    setInterval(() => {
      if (self.globalData.performanceOptimizer) {
        // 添加安全检查，确保方法存在
        if (typeof self.globalData.performanceOptimizer.getPerformanceReport === 'function') {
          const report = self.globalData.performanceOptimizer.getPerformanceReport();
          console.log('性能报告:', report);
        } else if (typeof performanceOptimizer.getReport === 'function') {
          // 备用调用方式
          const report = performanceOptimizer.getReport();
          console.log('性能报告:', report);
        } else {
          console.warn('无法获取性能报告，getReport方法不存在');
        }
      }
    }, 60000); // 每分钟一次
  },

  onShow: function() {
    // 小程序显示时的处理
    if (this.globalData.storageManager) {
      this.globalData.storageManager.checkDataUpdates();
    }
  },

  onHide: function() {
    // 小程序隐藏时的处理
    if (this.globalData.storageManager) {
      this.globalData.storageManager.syncAllData();
    }
  },
  
  onError: function(error) {
    // 全局错误处理
    console.error('小程序错误', error);
    this.globalData.performance.errorCount++;
    
    // 可以将错误信息上报到服务�?
    this.reportError(error);
  },
  
  // 获取全局存储管理�?
  getStorageManager: function() {
    return this.globalData.storageManager;
  },
  
  // 获取全局性能优化�?
  getPerformanceOptimizer: function() {
    return this.globalData.performanceOptimizer;
  },
  
  // 获取全局UI增强�?
  getUIEnhancer: function() {
    return this.globalData.uiEnhancer;
  },
  
  // 错误上报
  reportError: function(errorInfo) {
    try {
      // 构建错误报告
      const reportData = {
        // 错误基本信息
        type: errorInfo.type || 'unknown',
        message: typeof errorInfo.message === 'string' ? errorInfo.message : String(errorInfo.message),
        stack: errorInfo.stack || '',
        timestamp: errorInfo.timestamp || Date.now(),
        
        // 页面信息
        page: errorInfo.page || this.getCurrentPageRoute(),
        
        // 用户信息
        userInfo: this.globalData.userInfo || null,
        
        // 系统信息
        systemInfo: errorInfo.systemInfo || null,
        
        // 性能信息
        performance: {
          errorCount: this.globalData.performance.errorCount,
          memory: wx.getSystemInfoSync().memorySize || 0
        },
        
        // 环境信息
        env: {
          version: wx.getAccountInfoSync()?.miniProgram?.version || 'unknown',
          envVersion: wx.getAccountInfoSync()?.miniProgram?.envVersion || 'unknown'
        }
      };
      
      console.log('📝 错误上报数据:', reportData);
      
      // 保存到本地缓存（如果上报失败可以重试）
      this._saveErrorToCache(reportData);
      
      // 尝试发送到服务器
      this._sendErrorToServer(reportData);
      
    } catch (e) {
      console.error('错误上报失败:', e);
    }
  },
  
  // 保存错误到本地缓存
  _saveErrorToCache: function(errorData) {
    try {
      const errorCache = wx.getStorageSync('error_cache') || [];
      errorCache.push({
        ...errorData,
        cachedAt: Date.now()
      });
      // 保留最近50条错误
      if (errorCache.length > 50) {
        errorCache.shift();
      }
      wx.setStorageSync('error_cache', errorCache);
    } catch (e) {
      console.error('保存错误缓存失败:', e);
    }
  },
  
  // 发送错误到服务器
  _sendErrorToServer: function(errorData) {
    // reportError 云函数未创建，改为本地存储错误日志
    try {
      const errorCache = wx.getStorageSync('error_cache') || [];
      errorCache.push({ ...errorData, cachedAt: Date.now() });
      // 保留最近 50 条，防止占用过多本地存储
      wx.setStorageSync('error_cache', errorCache.slice(-50));
    } catch (e) {
      console.error('错误日志本地存储失败:', e);
    }
  },
  
  // 发送缓存的错误（预留接口，后续可对接后端日志接口）
  _sendCachedErrors: function() {
    try {
      const errorCache = wx.getStorageSync('error_cache') || [];
      if (errorCache.length === 0) return;
      // 预留：待 reportError 云函数或后端接口就绪后可在此上报
      console.log(`[错误缓存] 共 ${errorCache.length} 条未上报错误`);
    } catch (e) {
      console.error('读取错误缓存失败:', e);
    }
  },
  
  // 捕获Promise未处理的异常
  onUnhandledRejection: function(res) {
    console.error('未处理的Promise异常:', res);
    this.reportError({
      type: 'unhandled_rejection',
      message: res.reason || 'Unknown rejection',
      stack: res.stack || '',
      timestamp: Date.now(),
      page: this.getCurrentPageRoute()
    });
  },
});




