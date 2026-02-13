// 多端登录页面
const auth = require('../../utils/auth');
const api = require('../../utils/request');

Page({
  data: {
    currentTab: 'wechat', // 当前选中的登录方式: wechat, qq, phone
    isLoading: false,
    loadingText: '登录中...',
    agreedToTerms: false, // 是否同意用户协议
    
    // 手机号登录表单
    phoneForm: {
      phone: '',
      code: ''
    },
    
    // 验证码相关
    canSendCode: false,
    codeButtonText: '获取验证码',
    countdown: 0,
    countdownTimer: null
  },

  onLoad: function (options) {
    console.log('登录页面加载');
    
    // 先设置页面数据，快速显示
    if (options.type) {
      this.setData({
        currentTab: options.type
      });
    }
    
    // 🔧 修复：不再自动检查登录状态并跳转
    // 登录页面应该让用户主动选择登录方式，而不是自动跳转
    // 如果需要提示用户已登录，可以在页面显示提示信息
    this.checkAndShowLoginTip();
  },

  onUnload: function () {
    // 清理定时器
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
    }
  },

  // 检查登录状态（仅用于显示提示，不自动跳转）
  checkAndShowLoginTip: function() {
    const userInfo = wx.getStorageSync('userInfo');
    const token = wx.getStorageSync('token');
    
    if (userInfo && userInfo.isLoggedIn && token) {
      // 已登录，显示提示但不强制跳转
      wx.showModal({
        title: '您已登录',
        content: `当前账号：${userInfo.nickname || '微信用户'}\n是否返回首页？`,
        confirmText: '返回首页',
        cancelText: '重新登录',
        success: (res) => {
          if (res.confirm) {
            // 用户选择返回首页
            wx.switchTab({
              url: '/pages/index/index'
            });
          } else {
            // 用户选择重新登录，清除当前登录状态
            wx.removeStorageSync('userInfo');
            wx.removeStorageSync('token');
            wx.removeStorageSync('refresh_token');
            
            wx.showToast({
              title: '已退出登录，请重新登录',
              icon: 'none'
            });
          }
        }
      });
    }
  },

  // 切换登录方式
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });
  },

  // 微信授权登录按钮点击事件
  onWechatAuthLogin: function() {
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    // 先获取用户授权信息（必须在用户点击事件中同步调用）
    wx.getUserProfile({
      desc: '用于完善用户资料', // 声明获取用户个人信息后的用途
      success: (profileRes) => {
        console.log('获取用户信息成功');
        this.setData({
          isLoading: true,
          loadingText: '微信授权中...'
        });
        
        // 获取用户信息成功后，再获取登录凭证
        wx.login({
          success: (loginRes) => {
            if (loginRes.code) {
              this.setData({
                loadingText: '登录处理中...'
              });
              
              // 调用登录服务，将 code 和 userInfo 一起发送到服务器
              auth.login()
                .then(result => {
                  this.handleLoginSuccess(result, 'wechat');
                })
                .catch(error => {
                  this.handleLoginError(error);
                });
            } else {
              this.setData({ isLoading: false });
              wx.showToast({
                title: '获取登录凭证失败',
                icon: 'none'
              });
            }
          },
          fail: (err) => {
            console.error('微信登录失败', err);
            this.setData({ isLoading: false });
            wx.showToast({
              title: '微信登录失败',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        console.error('获取用户信息失败', err);
        
        if (err.errMsg && err.errMsg.includes('fail cancel')) {
          wx.showToast({
            title: '用户取消授权',
            icon: 'none'
          });
        } else if (err.errMsg && err.errMsg.includes('user deny')) {
          wx.showToast({
            title: '需要授权才能登录',
            icon: 'none'
          });
        } else {
          wx.showToast({
            title: '获取用户信息失败',
            icon: 'none'
          });
        }
      }
    });
  },

  // QQ登录
  onQQLogin: function() {
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isLoading: true,
      loadingText: 'QQ授权中...'
    });

    // QQ登录逻辑
    // 注意：小程序中QQ登录需要特殊配置，这里提供示例代码
    wx.login({
      provider: 'qq', // 如果支持QQ登录
      success: (loginRes) => {
        if (loginRes.code) {
          // 获取QQ用户信息
          wx.getUserInfo({
            provider: 'qq',
            success: (userRes) => {
              this.setData({
                loadingText: '登录处理中...'
              });

              // 调用QQ登录接口
              loginService.qqLogin(loginRes.code, userRes.userInfo)
                .then(result => {
                  this.handleLoginSuccess(result, 'qq');
                })
                .catch(error => {
                  this.handleLoginError(error);
                });
            },
            fail: (err) => {
              console.error('获取QQ用户信息失败', err);
              this.setData({ isLoading: false });
              wx.showToast({
                title: '获取QQ用户信息失败',
                icon: 'none'
              });
            }
          });
        } else {
          this.setData({ isLoading: false });
          wx.showToast({
            title: '获取QQ登录凭证失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.error('QQ登录失败', err);
        this.setData({ isLoading: false });
        // 检查是否是404错误（接口不存在）
        if (err.errMsg && err.errMsg.includes('404')) {
          wx.showModal({
            title: '暂不支持',
            content: '当前环境暂不支持QQ登录，请使用微信登录或手机号登录',
            showCancel: false
          });
        } else {
          // 如果不支持QQ登录，显示提示信息
          wx.showModal({
            title: '暂不支持',
            content: '当前环境暂不支持QQ登录，请使用微信登录或手机号登录',
            showCancel: false
          });
        }
      }
    });
  },

  // 手机号输入
  onPhoneInput: function(e) {
    const phone = e.detail.value;
    this.setData({
      'phoneForm.phone': phone,
      canSendCode: this.isValidPhone(phone) && this.data.countdown === 0
    });
  },

  // 验证码输入
  onCodeInput: function(e) {
    this.setData({
      'phoneForm.code': e.detail.value
    });
  },

  // 发送短信验证码
  sendSmsCode: function() {
    if (!this.data.canSendCode) {
      return;
    }

    if (!this.isValidPhone(this.data.phoneForm.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '发送中...' });

    // 调用发送验证码接口
    api.request('/auth/send-sms-code', 'POST', {
      phone: this.data.phoneForm.phone,
      type: 'login'
    }).then(result => {
      wx.hideLoading();
      wx.showToast({
        title: '验证码已发送',
        icon: 'success'
      });

      // 开始倒计时
      this.startCountdown();
      
    }).catch(error => {
      wx.hideLoading();
      console.error('发送验证码失败:', error);
      wx.showToast({
        title: error.message || '发送失败，请重试',
        icon: 'none'
      });
    });
  },

  // 手机号登录
  onPhoneLogin: function() {
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    if (!this.isValidPhone(this.data.phoneForm.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    if (!this.data.phoneForm.code || this.data.phoneForm.code.length !== 6) {
      wx.showToast({
        title: '请输入6位验证码',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isLoading: true,
      loadingText: '验证登录中...'
    });

    // 调用手机号登录接口
    loginService.phoneLogin(this.data.phoneForm.phone, this.data.phoneForm.code)
      .then(result => {
        this.handleLoginSuccess(result, 'phone');
      })
      .catch(error => {
        this.handleLoginError(error);
      });
  },

  // 游客登录
  onGuestLogin: function() {
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '游客模式',
      content: '游客模式下功能受限，部分交易功能无法使用。建议您注册登录获得完整体验。',
      confirmText: '继续',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            isLoading: true,
            loadingText: '进入游客模式...'
          });

          // 调用后端游客登录接口
          api.post('/auth/guest/login', {})
            .then(result => {
              // 保存游客信息
              const guestInfo = {
                isLoggedIn: true,
                isGuest: true,
                nickname: result.nickname || '游客用户',
                avatar: '',
                userId: result.userId,
                role: 'guest',
                loginTime: new Date().toISOString(),
                loginType: 'guest'
              };

              wx.setStorageSync('userInfo', guestInfo);
              wx.setStorageSync('token', result.token || result.access_token);
              if (result.refresh_token) {
                wx.setStorageSync('refresh_token', result.refresh_token);
              }

              this.setData({ isLoading: false });
              
              wx.showToast({
                title: '进入游客模式',
                icon: 'success'
              });

              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/index/index'
                });
              }, 1500);
            })
            .catch(error => {
              console.error('游客登录失败:', error);
              this.setData({ isLoading: false });
              
              wx.showToast({
                title: error.message || '游客登录失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  // 验证手机号格式
  isValidPhone: function(phone) {
    return /^1[3-9]\d{9}$/.test(phone);
  },

  // 开始倒计时
  startCountdown: function() {
    let countdown = 60;
    this.setData({
      countdown: countdown,
      canSendCode: false,
      codeButtonText: `${countdown}秒后重发`
    });

    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({
          countdown: 0,
          canSendCode: this.isValidPhone(this.data.phoneForm.phone),
          codeButtonText: '获取验证码'
        });
        this.data.countdownTimer = null;
      } else {
        this.setData({
          countdown: countdown,
          codeButtonText: `${countdown}秒后重发`
        });
      }
    }, 1000);

    this.data.countdownTimer = timer;
  },

  // 处理登录成功
  handleLoginSuccess: function(result, loginType) {
    console.log('[Login] handleLoginSuccess 接收到的数据:', result);
    
    // 🔧 修复：兼容多种 token 字段名和响应结构
    // 后端返回格式：{ success: true, data: { token: '...', ... } }
    let resultData = result.data || result;
    
    // 如果 resultData 是字符串，尝试解析
    if (typeof resultData === 'string') {
      try {
        resultData = JSON.parse(resultData);
      } catch (e) {
        resultData = { token: resultData };
      }
    }
    
    console.log('[Login] 提取的 resultData:', resultData);
    
    // 提取 token（可能在多个字段中）
    let token = resultData.token || resultData.access_token || resultData.accessToken;
    
    // 如果 token 还是对象，尝试提取其中的 token 字段
    if (typeof token === 'object' && token !== null) {
      token = token.token || token.access_token || token.accessToken;
    }
    
    console.log('[Login] 提取的 token:', token, '类型:', typeof token);
    
    if (!token) {
      console.error('[Login] 登录结果中没有 token:', result);
      wx.showToast({
        title: '登录失败：未获取到身份令牌',
        icon: 'none'
      });
      this.setData({ isLoading: false });
      return;
    }
    
    // 确保 token 是字符串
    const tokenStr = String(token);
    
    // 保存用户信息和token
    const userInfo = {
      isLoggedIn: true,
      isGuest: false,
      userId: resultData.openid || resultData.userId,
      openid: resultData.openid || resultData.userId,
      nickname: resultData.nickname || resultData.nickName || '微信用户',
      avatar: resultData.avatar || resultData.avatarUrl || '',
      loginTime: new Date().toISOString(),
      loginType: loginType
    };

    wx.setStorageSync('userInfo', userInfo);
    wx.setStorageSync('token', tokenStr);
    
    // 保存 refresh token
    if (resultData.refresh_token || resultData.refreshToken) {
      wx.setStorageSync('refresh_token', resultData.refresh_token || resultData.refreshToken);
    }
    
    console.log('[Login] 登录成功，已保存 token:', tokenStr.substring(0, 20) + '...');
    console.log('[Login] 用户信息:', userInfo);

    this.setData({ isLoading: false });
    
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    });

    // 延迟跳转到首页
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 1500);
  },

  // 处理登录错误
  handleLoginError: function(error) {
    console.error('登录失败:', error);
    this.setData({ isLoading: false });
    
    wx.showToast({
      title: error.message || '登录失败，请重试',
      icon: 'none'
    });
  },

  // 切换用户协议同意状态
  toggleAgreement: function() {
    this.setData({
      agreedToTerms: !this.data.agreedToTerms
    });
  },

  // 显示用户协议
  showUserAgreement: function() {
    // TODO: 创建用户协议页面
    wx.showModal({
      title: '用户协议',
      content: '《场外期权交易平台用户协议》\n\n1. 服务条款\n2. 用户权利与义务\n3. 隐私保护\n4. 免责声明\n\n详细内容请访问官网查看。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 显示隐私政策
  showPrivacyPolicy: function() {
    // TODO: 创建隐私政策页面
    wx.showModal({
      title: '隐私政策',
      content: '《场外期权交易平台隐私政策》\n\n我们重视您的隐私保护：\n1. 信息收集范围\n2. 信息使用方式\n3. 信息安全保障\n4. 用户权利\n\n详细内容请访问官网查看。',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  // 显示登录帮助
  showLoginHelp: function() {
    wx.showModal({
      title: '登录帮助',
      content: '1. 微信登录：使用微信授权快速登录\n2. QQ登录：使用QQ账号快速登录\n3. 手机号登录：输入手机号和验证码登录\n\n如遇到登录问题，请联系客服。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 联系客服
  contactService: function() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-123-4567\n服务时间：9:00-21:00',
      showCancel: false,
      confirmText: '知道了'
    });
  }
});