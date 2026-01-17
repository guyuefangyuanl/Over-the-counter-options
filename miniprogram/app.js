// app.js
const NotificationManager = require('./utils/notification-manager.js');
const loginService = require('./utils/loginService.js');
const performanceOptimizer = require('./utils/performance-optimizer.js');
const storageManager = require('./utils/storage-manager.js');
const uiEnhancer = require('./utils/user-experience-enhancer.js');

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
    }
  },
  onLaunch: function() {
    console.log('小程序启动');

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        // env: 'my-env-id',
        traceUser: true,
      })
    }

    this.initializeCoreServices();
    this.updateAppLogs();
    this.checkAutoLogin();
    this.initPerformanceMonitoring();
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
    }, 100); // 延迟100ms执行
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
  reportError: function(error) {
    // 模拟错误上报
    console.log('错误已上报', error);
  }
});




