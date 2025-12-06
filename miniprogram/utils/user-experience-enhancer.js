// utils/user-experience-enhancer.js
/**
 * 用户体验增强工具类
 * 提供动画效果、智能反馈、交互增强等功能
 */

class UserExperienceEnhancer {
  constructor() {
    this.animations = new Map();
    this.feedbackQueue = [];
    this.isFeedbackProcessing = false;
    this.config = {
      animationsEnabled: true,
      hapticFeedbackEnabled: false,
      voiceFeedbackEnabled: false,
      autoHideDuration: 3000,
      maxFeedbackQueue: 10
    };
    
    // 预定义动画效果
    this.animationPresets = {
      slideInUp: {
        from: { transform: 'translateY(100%)', opacity: 0 },
        to: { transform: 'translateY(0)', opacity: 1 }
      },
      slideInDown: {
        from: { transform: 'translateY(-100%)', opacity: 0 },
        to: { transform: 'translateY(0)', opacity: 1 }
      },
      slideInLeft: {
        from: { transform: 'translateX(-100%)', opacity: 0 },
        to: { transform: 'translateX(0)', opacity: 1 }
      },
      slideInRight: {
        from: { transform: 'translateX(100%)', opacity: 0 },
        to: { transform: 'translateX(0)', opacity: 1 }
      },
      fadeIn: {
        from: { opacity: 0 },
        to: { opacity: 1 }
      },
      zoomIn: {
        from: { transform: 'scale(0.8)', opacity: 0 },
        to: { transform: 'scale(1)', opacity: 1 }
      },
      bounce: {
        from: { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.1)' },
        to: { transform: 'scale(1)' }
      },
      pulse: {
        from: { transform: 'scale(1)' },
        '50%': { transform: 'scale(1.05)' },
        to: { transform: 'scale(1)' }
      }
    };
  }

  /**
   * 播放预定义动画
   * @param {string} presetName 动画预设名称
   * @param {string} selector 元素选择器
   * @param {object} options 动画选项
   */
  playPresetAnimation(presetName, selector, options = {}) {
    if (!this.config.animationsEnabled) {
      return Promise.resolve();
    }

    const preset = this.animationPresets[presetName];
    if (!preset) {
      console.warn(`未找到动画预设: ${presetName}`);
      return Promise.resolve();
    }

    return this.playKeyframeAnimation(preset, selector, options);
  }

  /**
   * 播放关键帧动画
   * @param {object} keyframes 关键帧定义
   * @param {string} selector 元素选择器
   * @param {object} options 动画选项
   */
  playKeyframeAnimation(keyframes, selector, options = {}) {
    if (!this.config.animationsEnabled) {
      return Promise.resolve();
    }

    const {
      duration = 300,
      easing = 'ease-out',
      delay = 0,
      iterations = 1
    } = options;

    return new Promise((resolve) => {
      // 微信小程序动画实现
      if (typeof wx !== 'undefined' && wx.createAnimation) {
        const animation = wx.createAnimation({
          duration,
          timingFunction: easing,
          delay
        });

        // 应用关键帧
        Object.entries(keyframes).forEach(([progress, styles]) => {
          if (progress === 'from') {
            // 应用初始状态
            Object.entries(styles).forEach(([property, value]) => {
              if (property === 'transform') {
                this.applyTransform(animation, value);
              } else {
                animation[property](value);
              }
            });
          } else if (progress === 'to') {
            // 应用结束状态
            Object.entries(styles).forEach(([property, value]) => {
              if (property === 'transform') {
                this.applyTransform(animation, value);
              } else {
                animation[property](value);
              }
            });
          }
        });

        // 执行动画
        setTimeout(() => {
          resolve();
        }, duration + delay);
      } else {
        // Web环境动画实现
        resolve();
      }
    });
  }

  /**
   * 应用变换效果
   */
  applyTransform(animation, transformValue) {
    if (transformValue.includes('translateX')) {
      const match = transformValue.match(/translateX\(([^)]+)\)/);
      if (match) {
        animation.translateX(match[1]);
      }
    }
    
    if (transformValue.includes('translateY')) {
      const match = transformValue.match(/translateY\(([^)]+)\)/);
      if (match) {
        animation.translateY(match[1]);
      }
    }
    
    if (transformValue.includes('scale')) {
      const match = transformValue.match(/scale\(([^)]+)\)/);
      if (match) {
        animation.scale(parseFloat(match[1]));
      }
    }
  }

  /**
   * 智能触觉反馈
   * @param {string} type 反馈类型
   */
  hapticFeedback(type = 'light') { return; }

  /**
   * 语音反馈
   * @param {string} text 朗读文本
   * @param {object} options 选项
   */
  voiceFeedback(text, options = {}) {
    if (!this.config.voiceFeedbackEnabled) {
      return;
    }

    if (typeof wx !== 'undefined' && wx.createInnerAudioContext) {
      // 这里可以集成TTS服务
      console.log('语音反馈:', text);
    }
  }

  /**
   * 智能消息提示
   * @param {string} message 消息内容
   * @param {object} options 选项
   */
  showMessage(message, options = {}) {
    const {
      type = 'info',
      duration = this.config.autoHideDuration,
      icon = true,
      position = 'bottom',
      animation = 'slideInUp'
    } = options;

    // 添加到反馈队列
    this.feedbackQueue.push({
      message,
      type,
      duration,
      icon,
      position,
      animation
    });

    this.processFeedbackQueue();
  }

  /**
   * 处理反馈队列
   */
  processFeedbackQueue() {
    if (this.isFeedbackProcessing || this.feedbackQueue.length === 0) {
      return;
    }

    this.isFeedbackProcessing = true;
    const feedback = this.feedbackQueue.shift();

    // 显示消息
    this.displayMessage(feedback);

    // 触觉反馈
    this.hapticFeedback(feedback.type);

    // 语音反馈
    if (this.config.voiceFeedbackEnabled) {
      this.voiceFeedback(feedback.message);
    }

    // 自动隐藏
    setTimeout(() => {
      this.hideMessage(feedback);
      this.isFeedbackProcessing = false;
      this.processFeedbackQueue();
    }, feedback.duration);
  }

  /**
   * 显示消息
   */
  displayMessage(feedback) {
    // 微信小程序消息显示
    if (typeof wx !== 'undefined') {
      const iconMap = {
        success: 'success',
        error: 'error',
        warning: 'none',
        info: 'none'
      };

      wx.showToast({
        title: feedback.message,
        icon: feedback.icon ? iconMap[feedback.type] : 'none',
        duration: feedback.duration
      });
    }
  }

  /**
   * 隐藏消息
   */
  hideMessage(feedback) {
    if (typeof wx !== 'undefined') {
      wx.hideToast();
    }
  }

  /**
   * 创建进度指示器
   * @param {object} options 选项
   */
  createProgressIndicator(options = {}) {
    const {
      type = 'linear',
      value = 0,
      showText = true,
      color = '#409EFF'
    } = options;

    return {
      type,
      value,
      showText,
      color,
      update: (newValue) => {
        // 更新进度值
        console.log(`进度更新: ${newValue}%`);
      }
    };
  }

  /**
   * 创建加载指示器
   * @param {object} options 选项
   */
  createLoadingIndicator(options = {}) {
    const {
      text = '加载中...',
      mask = true,
      animation = 'spin'
    } = options;

    return {
      show: () => {
        if (typeof wx !== 'undefined') {
          wx.showLoading({
            title: text,
            mask: mask
          });
        }
      },
      hide: () => {
        if (typeof wx !== 'undefined') {
          wx.hideLoading();
        }
      }
    };
  }

  /**
   * 创建确认对话框
   * @param {string} title 标题
   * @param {string} content 内容
   * @param {object} options 选项
   */
  createConfirmDialog(title, content, options = {}) {
    return new Promise((resolve) => {
      if (typeof wx !== 'undefined') {
        wx.showModal({
          title: title,
          content: content,
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
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * 创建操作菜单
   * @param {array} items 菜单项
   * @param {object} options 选项
   */
  createActionSheet(items, options = {}) {
    return new Promise((resolve) => {
      if (typeof wx !== 'undefined') {
        wx.showActionSheet({
          itemList: items,
          ...options,
          success: (res) => {
            this.hapticFeedback('selection');
            resolve({
              index: res.tapIndex,
              item: items[res.tapIndex]
            });
          },
          fail: () => {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  /**
   * 配置用户体验增强器
   * @param {object} newConfig 新配置
   */
  configure(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    console.log('用户体验增强器配置已更新:', this.config);
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.animations.clear();
    this.feedbackQueue = [];
    this.isFeedbackProcessing = false;
    console.log('用户体验增强器已清理');
  }
}

// 创建全局实例
const userExperienceEnhancer = new UserExperienceEnhancer();

// 导出工具函数
module.exports = {
  UserExperienceEnhancer,
  
  // 便捷方法
  playAnimation: (presetName, selector, options) => 
    userExperienceEnhancer.playPresetAnimation(presetName, selector, options),
  
  hapticFeedback: (type) => 
    userExperienceEnhancer.hapticFeedback(type),
  
  voiceFeedback: (text, options) => 
    userExperienceEnhancer.voiceFeedback(text, options),
  
  showMessage: (message, options) => 
    userExperienceEnhancer.showMessage(message, options),
  
  createProgress: (options) => 
    userExperienceEnhancer.createProgressIndicator(options),
  
  createLoading: (options) => 
    userExperienceEnhancer.createLoadingIndicator(options),
  
  createConfirm: (title, content, options) => 
    userExperienceEnhancer.createConfirmDialog(title, content, options),
  
  createActionSheet: (items, options) => 
    userExperienceEnhancer.createActionSheet(items, options),
  
  configure: (config) => 
    userExperienceEnhancer.configure(config),
  
  cleanup: () => 
    userExperienceEnhancer.cleanup(),
  
  // 获取全局实例
  getInstance: () => userExperienceEnhancer
};
