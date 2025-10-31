// utils/ui-enhancer.js
/**
 * UI体验增强工具类
 * 提供加载动画、反馈提示、错误处理等用户体验优化功能
 */

class UIEnhancer {
  constructor() {
    this.loadingStates = new Map();
    this.toastQueue = [];
    this.isToastShowing = false;
    this.feedbackConfig = {
      hapticEnabled: true,
      animationEnabled: true,
      autoHideLoading: 3000 // 3秒自动隐藏加载状态
    };
  }

  /**
   * 显示智能加载提示
   * @param {string} title 加载提示文字
   * @param {string} key 加载状态标识
   * @param {object} options 配置选项
   */
  showLoading(title = '加载中...', key = 'default', options = {}) {
    const { timeout = this.feedbackConfig.autoHideLoading, mask = true } = options;
    
    // 防止重复显示
    if (this.loadingStates.has(key)) {
      return;
    }

    wx.showLoading({
      title: title,
      mask: mask
    });

    // 记录加载状态
    const startTime = Date.now();
    this.loadingStates.set(key, { title, startTime });

    // 自动隐藏
    if (timeout > 0) {
      setTimeout(() => {
        this.hideLoading(key);
      }, timeout);
    }

    console.log(`显示加载提示: ${title}`);
  }

  /**
   * 隐藏加载提示
   * @param {string} key 加载状态标识
   */
  hideLoading(key = 'default') {
    if (this.loadingStates.has(key)) {
      const loadingInfo = this.loadingStates.get(key);
      const duration = Date.now() - loadingInfo.startTime;
      
      console.log(`隐藏加载提示: ${loadingInfo.title}, 持续时间: ${duration}ms`);
      
      this.loadingStates.delete(key);
      
      // 只有当没有其他加载状态时才隐藏
      if (this.loadingStates.size === 0) {
        wx.hideLoading();
      }
    }
  }

  /**
   * 智能Toast提示队列
   * @param {string} title 提示内容
   * @param {object} options 配置选项
   */
  showToast(title, options = {}) {
    const config = {
      title: title,
      icon: 'none',
      duration: 2000,
      mask: false,
      ...options
    };

    this.toastQueue.push(config);
    this.processToastQueue();
  }

  /**
   * 处理Toast队列
   */
  processToastQueue() {
    if (this.isToastShowing || this.toastQueue.length === 0) {
      return;
    }

    this.isToastShowing = true;
    const config = this.toastQueue.shift();
    
    wx.showToast(config);

    setTimeout(() => {
      this.isToastShowing = false;
      this.processToastQueue(); // 处理下一个
    }, config.duration || 2000);
  }

  /**
   * 成功提示
   * @param {string} title 提示内容
   * @param {object} options 配置选项
   */
  showSuccess(title, options = {}) {
    this.showToast(title, {
      icon: 'success',
      ...options
    });
    
    // 触感反馈
    this.hapticFeedback('success');
  }

  /**
   * 错误提示
   * @param {string} title 提示内容
   * @param {object} options 配置选项
   */
  showError(title, options = {}) {
    this.showToast(title, {
      icon: 'error',
      duration: 3000, // 错误提示显示更久
      ...options
    });
    
    // 触感反馈
    this.hapticFeedback('error');
  }

  /**
   * 警告提示
   * @param {string} title 提示内容
   * @param {object} options 配置选项
   */
  showWarning(title, options = {}) {
    this.showToast(title, {
      icon: 'none',
      duration: 2500,
      ...options
    });
    
    // 触感反馈
    this.hapticFeedback('warning');
  }

  /**
   * 触感反馈
   * @param {string} type 反馈类型
   */
  hapticFeedback(type = 'light') {
    if (!this.feedbackConfig.hapticEnabled) {
      return;
    }

    const typeMap = {
      'success': 'success',
      'error': 'error',
      'warning': 'warning',
      'light': 'light',
      'medium': 'medium',
      'heavy': 'heavy'
    };

    const feedbackType = typeMap[type] || 'light';

    if (wx.vibrateShort) {
      wx.vibrateShort({
        type: feedbackType
      });
    }
  }

  /**
   * 智能确认对话框
   * @param {string} title 标题
   * @param {string} content 内容
   * @param {object} options 配置选项
   */
  showConfirm(title, content, options = {}) {
    return new Promise((resolve) => {
      const config = {
        title: title,
        content: content,
        confirmText: '确定',
        cancelText: '取消',
        confirmColor: '#409EFF',
        ...options,
        success: (res) => {
          if (res.confirm) {
            this.hapticFeedback('success');
            resolve(true);
          } else if (res.cancel) {
            this.hapticFeedback('light');
            resolve(false);
          }
        },
        fail: () => {
          resolve(false);
        }
      };

      wx.showModal(config);
    });
  }

  /**
   * 操作菜单
   * @param {array} items 菜单项
   * @param {object} options 配置选项
   */
  showActionSheet(items, options = {}) {
    return new Promise((resolve) => {
      const config = {
        itemList: items,
        itemColor: '#000000',
        ...options,
        success: (res) => {
          this.hapticFeedback('light');
          resolve({
            selected: true,
            tapIndex: res.tapIndex,
            item: items[res.tapIndex]
          });
        },
        fail: () => {
          resolve({ selected: false });
        }
      };

      wx.showActionSheet(config);
    });
  }

  /**
   * 页面加载动画
   * @param {object} pageInstance 页面实例
   * @param {function} loadFunction 加载函数
   * @param {object} options 配置选项
   */
  async pageLoadWithAnimation(pageInstance, loadFunction, options = {}) {
    const { loadingText = '正在加载...', errorText = '加载失败，请重试' } = options;
    
    // 设置加载状态
    pageInstance.setData({
      pageLoading: true,
      pageError: false
    });

    this.showLoading(loadingText, 'page-load');

    try {
      const result = await loadFunction();
      
      // 成功加载
      pageInstance.setData({
        pageLoading: false,
        pageError: false
      });
      
      this.hideLoading('page-load');
      return result;
      
    } catch (error) {
      console.error('页面加载失败:', error);
      
      // 加载失败
      pageInstance.setData({
        pageLoading: false,
        pageError: true,
        errorMessage: error.message || errorText
      });
      
      this.hideLoading('page-load');
      this.showError(error.message || errorText);
      
      throw error;
    }
  }

  /**
   * 下拉刷新增强
   * @param {object} pageInstance 页面实例
   * @param {function} refreshFunction 刷新函数
   */
  async enhancedPullRefresh(pageInstance, refreshFunction) {
    try {
      // 触感反馈
      this.hapticFeedback('light');
      
      await refreshFunction();
      
      // 刷新成功
      this.hapticFeedback('success');
      
    } catch (error) {
      console.error('刷新失败:', error);
      this.showError('刷新失败，请重试');
    } finally {
      // 确保停止下拉刷新
      wx.stopPullDownRefresh();
    }
  }

  /**
   * 列表加载更多
   * @param {object} pageInstance 页面实例
   * @param {function} loadMoreFunction 加载更多函数
   */
  async enhancedLoadMore(pageInstance, loadMoreFunction, options = {}) {
    const { 
      loadingStateKey = 'loadingMore',
      hasMoreKey = 'hasMore',
      listKey = 'list'
    } = options;

    // 检查是否正在加载或已无更多数据
    if (pageInstance.data[loadingStateKey] || !pageInstance.data[hasMoreKey]) {
      return;
    }

    // 设置加载状态
    pageInstance.setData({
      [loadingStateKey]: true
    });

    try {
      const result = await loadMoreFunction();
      
      if (result && result.data && result.data.length > 0) {
        // 有新数据
        const currentList = pageInstance.data[listKey] || [];
        const newList = currentList.concat(result.data);
        
        pageInstance.setData({
          [listKey]: newList,
          [hasMoreKey]: result.hasMore !== false,
          [loadingStateKey]: false
        });
        
        this.hapticFeedback('light');
      } else {
        // 无更多数据
        pageInstance.setData({
          [hasMoreKey]: false,
          [loadingStateKey]: false
        });
        
        this.showToast('没有更多数据了');
      }
      
    } catch (error) {
      console.error('加载更多失败:', error);
      
      pageInstance.setData({
        [loadingStateKey]: false
      });
      
      this.showError('加载失败，请重试');
    }
  }

  /**
   * 配置UI增强选项
   * @param {object} config 配置选项
   */
  configure(config) {
    this.feedbackConfig = {
      ...this.feedbackConfig,
      ...config
    };
  }

  /**
   * 清理所有状态
   */
  cleanup() {
    // 清理所有加载状态
    this.loadingStates.clear();
    wx.hideLoading();
    
    // 清理Toast队列
    this.toastQueue = [];
    this.isToastShowing = false;
    
    console.log('UI增强器已清理');
  }
}

// 创建全局实例
const uiEnhancer = new UIEnhancer();

// 导出工具函数（增强版）
module.exports = {
  UIEnhancer,
  
  // 便捷方法
  showLoading: (title, key, options) => uiEnhancer.showLoading(title, key, options),
  hideLoading: (key) => uiEnhancer.hideLoading(key),
  showToast: (title, options) => uiEnhancer.showToast(title, options),
  showSuccess: (title, options) => uiEnhancer.showSuccess(title, options),
  showError: (title, options) => uiEnhancer.showError(title, options),
  showWarning: (title, options) => uiEnhancer.showWarning(title, options),
  showConfirm: (title, content, options) => uiEnhancer.showConfirm(title, content, options),
  showActionSheet: (items, options) => uiEnhancer.showActionSheet(items, options),
  hapticFeedback: (type) => uiEnhancer.hapticFeedback(type),
  pageLoadWithAnimation: (pageInstance, loadFunction, options) => 
    uiEnhancer.pageLoadWithAnimation(pageInstance, loadFunction, options),
  enhancedPullRefresh: (pageInstance, refreshFunction) => 
    uiEnhancer.enhancedPullRefresh(pageInstance, refreshFunction),
  enhancedLoadMore: (pageInstance, loadMoreFunction, options) => 
    uiEnhancer.enhancedLoadMore(pageInstance, loadMoreFunction, options),
  configure: (config) => uiEnhancer.configure(config),
  cleanup: () => uiEnhancer.cleanup(),
  
  // 新增的动画和主题功能
  playAnimation: (type, options) => uiEnhancer.playAnimation(type, options),
  createCustomAnimation: (name, preset) => uiEnhancer.createCustomAnimation(name, preset),
  addPressEffect: (selector, callback) => uiEnhancer.addPressEffect(selector, callback),
  switchTheme: (theme) => uiEnhancer.switchTheme(theme),
  getCurrentTheme: () => uiEnhancer.getCurrentTheme(),
  
  // UI组件创建
  createFloatingButton: (options) => uiEnhancer.createFloatingButton(options),
  createProgressIndicator: (options) => uiEnhancer.createProgressIndicator(options),
  createSkeletonScreen: (options) => uiEnhancer.createSkeletonScreen(options),
  
  // 获取全局实例
  getInstance: () => uiEnhancer
};