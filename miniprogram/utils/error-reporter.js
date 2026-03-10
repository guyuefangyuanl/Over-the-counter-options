/**
 * 错误上报工具类
 * 提供小程序错误的收集、缓存和上报功能
 */

class ErrorReporter {
  constructor() {
    this.maxCacheSize = 50; // 最多缓存50条错误
    this.batchSize = 10;    // 每次批量发送数量
    this.retryInterval = 30000; // 重试间隔30秒
    this.init();
  }

  init() {
    // 定期发送缓存的错误
    setInterval(() => {
      this.sendCachedErrors();
    }, this.retryInterval);
  }

  /**
   * 上报错误
   * @param {Object} errorInfo 错误信息
   */
  report(errorInfo) {
    try {
      const reportData = this.buildReportData(errorInfo);
      console.log('📝 错误上报数据:', reportData);

      // 保存到本地缓存
      this.saveToCache(reportData);

      // 尝试发送到服务器
      this.sendToServer(reportData);

    } catch (e) {
      console.error('错误上报失败:', e);
    }
  }

  /**
   * 构建错误报告数据
   */
  buildReportData(errorInfo) {
    const app = getApp();
    const systemInfo = wx.getSystemInfoSync();
    const accountInfo = wx.getAccountInfoSync();

    return {
      // 错误基本信息
      type: errorInfo.type || 'unknown',
      message: typeof errorInfo.message === 'string' 
        ? errorInfo.message 
        : String(errorInfo.message),
      stack: errorInfo.stack || '',
      timestamp: errorInfo.timestamp || Date.now(),

      // 页面信息
      page: errorInfo.page || this.getCurrentPageRoute(),

      // 用户信息
      userInfo: app?.globalData?.userInfo || null,

      // 系统信息
      systemInfo: {
        brand: systemInfo.brand,
        model: systemInfo.model,
        system: systemInfo.system,
        version: systemInfo.version,
        SDKVersion: systemInfo.SDKVersion,
        platform: systemInfo.platform,
        screenWidth: systemInfo.screenWidth,
        screenHeight: systemInfo.screenHeight,
        windowWidth: systemInfo.windowWidth,
        windowHeight: systemInfo.windowHeight,
        language: systemInfo.language
      },

      // 性能信息
      performance: {
        errorCount: app?.globalData?.performance?.errorCount || 0,
        memory: systemInfo.memorySize || 0
      },

      // 环境信息
      env: {
        version: accountInfo?.miniProgram?.version || 'unknown',
        envVersion: accountInfo?.miniProgram?.envVersion || 'unknown'
      }
    };
  }

  /**
   * 获取当前页面路径
   */
  getCurrentPageRoute() {
    const pages = getCurrentPages();
    if (pages.length > 0) {
      return pages[pages.length - 1].route;
    }
    return 'unknown';
  }

  /**
   * 保存错误到本地缓存
   */
  saveToCache(errorData) {
    try {
      const errorCache = wx.getStorageSync('error_cache') || [];
      errorCache.push({
        ...errorData,
        cachedAt: Date.now()
      });

      // 保留最近的错误
      if (errorCache.length > this.maxCacheSize) {
        errorCache.shift();
      }

      wx.setStorageSync('error_cache', errorCache);
    } catch (e) {
      console.error('保存错误缓存失败:', e);
    }
  }

  /**
   * 发送错误到服务器
   */
  sendToServer(errorData) {
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          console.log('无网络连接，错误已缓存到本地');
          return;
        }

        // 使用云函数上报错误
        wx.cloud.callFunction({
          name: 'reportError',
          data: errorData,
          success: (res) => {
            console.log('✅ 错误上报成功:', res);
            // 上报成功后，尝试发送缓存的错误
            this.sendCachedErrors();
          },
          fail: (err) => {
            console.error('❌ 错误上报失败:', err);
          }
        });
      }
    });
  }

  /**
   * 发送缓存的错误
   */
  sendCachedErrors() {
    try {
      const errorCache = wx.getStorageSync('error_cache') || [];
      if (errorCache.length === 0) return;

      // 取出最多batchSize条缓存错误
      const errorsToSend = errorCache.slice(0, this.batchSize);
      const remainingErrors = errorCache.slice(this.batchSize);

      wx.cloud.callFunction({
        name: 'reportError',
        data: {
          type: 'batch',
          errors: errorsToSend
        },
        success: () => {
          console.log(`✅ 发送了 ${errorsToSend.length} 条缓存错误`);
          wx.setStorageSync('error_cache', remainingErrors);
        },
        fail: (err) => {
          console.error('发送缓存错误失败:', err);
        }
      });
    } catch (e) {
      console.error('发送缓存错误失败:', e);
    }
  }

  /**
   * 捕获Promise未处理的异常
   */
  onUnhandledRejection(res) {
    console.error('未处理的Promise异常:', res);
    this.report({
      type: 'unhandled_rejection',
      message: res.reason || 'Unknown rejection',
      stack: res.stack || '',
      timestamp: Date.now(),
      page: this.getCurrentPageRoute()
    });
  }

  /**
   * 捕获页面错误
   */
  onPageError(error, page) {
    this.report({
      type: 'page_error',
      message: error,
      page: page,
      timestamp: Date.now()
    });
  }
}

// 创建单例
let instance = null;

function getErrorReporter() {
  if (!instance) {
    instance = new ErrorReporter();
  }
  return instance;
}

module.exports = {
  ErrorReporter,
  getErrorReporter
};
