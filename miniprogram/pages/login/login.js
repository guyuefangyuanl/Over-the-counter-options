// 多端登录页面
const loginService = require('../../utils/loginService');
const api = require('../../utils/api');
const realAvatarFetcher = require('../../utils/realAvatarFetcher'); // 🔧 引入真正的头像获取工具

Page({
  data: {
    currentTab: 'wechat', // 当前选中的登录方式: wechat, qq, phone
    isLoading: false,
    loadingText: '登录中...',
    agreedToTerms: false, // 是否同意用户协议
    
    // 手机号登录表单
    phoneForm: {
      phone: '',
      smsCode: ''  // 短信验证码
    },
    
    // 验证码相关
    canSendCode: false,
    codeButtonText: '获取验证码',
    countdown: 0,
    countdownTimer: null
  },

  onLoad: function (options) {
    console.log('登录页面加载');
    // 检查是否有传入的登录方式
    if (options.type) {
      this.setData({
        currentTab: options.type
      });
    }
    
    // 检查用户是否已登录
    this.checkLoginStatus();
  },

  onUnload: function () {
    // 清理定时器
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer);
    }
  },

  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    const token = wx.getStorageSync('token');
    
    if (userInfo && userInfo.isLoggedIn && token) {
      // 已登录，直接跳转
      wx.switchTab({
        url: '/pages/index/index'
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
  // 关键修复：wx.getUserProfile() 必须在用户点击事件的同步上下文中调用
  // 不能放在 wx.login() 的异步回调中，否则会报错 "can only be invoked by user TAP gesture"
  onWechatAuthLogin: function() {
    if (!this.data.agreedToTerms) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isLoading: true,
      loadingText: '微信授权中...'
    });

    // 并行调用 wx.login 和 wx.getUserProfile
    // 两者都必须在用户点击事件的同步上下文中执行
    Promise.all([
      // 获取微信登录凭证
      new Promise((resolve, reject) => {
        wx.login({
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      }),
      // 获取用户信息（必须在用户点击事件中直接调用）
      new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: (res) => resolve(res),
          fail: (err) => reject(err)
        });
      })
    ])
    .then(([loginRes, profileRes]) => {
      // 两者都成功，继续登录流程
      if (loginRes.code) {
        console.log('获取登录凭证和用户信息成功');
        this.setData({ loadingText: '登录处理中...' });

        // 验证头像URL有效性
        const userInfo = profileRes.userInfo;
        if (userInfo.avatarUrl && this.isAvatarUrlValid(userInfo.avatarUrl)) {
          this.proceedWithLogin(loginRes.code, userInfo);
        } else {
          const cleanUserInfo = {
            ...userInfo,
            avatarUrl: ''
          };
          this.proceedWithLogin(loginRes.code, cleanUserInfo);
        }
      } else {
        this.handleLoginFailure('获取登录凭证失败');
      }
    })
    .catch((error) => {
      console.error('微信授权失败:', error);

      // 判断是哪个接口失败
      const isUserProfileError = error && error.errMsg &&
        error.errMsg.includes('getUserProfile');

      if (isUserProfileError) {
        // 用户拒绝授权用户信息，降级到最小化登录
        this.handleUserProfileDenied(error);
      } else {
        this.handleLoginFailure('微信授权失败，请重试');
      }
    });
  },

  // 🔧 验证头像URL有效性
  isAvatarUrlValid: function(avatarUrl) {
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return false;
    }
    
    // 检查是否为空字符串或占位符
    if (avatarUrl.trim() === '' || 
        avatarUrl.includes('default') || 
        avatarUrl.includes('placeholder') ||
        avatarUrl.startsWith('data:image')) {
      return false;
    }
    
    // 检查URL格式
    try {
      new URL(avatarUrl);
      return true;
    } catch {
      return false;
    }
  },

  // 🔧 正常流程登录
  proceedWithLogin: function(loginCode, userInfo) {
    loginService.wechatLogin(loginCode, userInfo)
      .then(result => {
        this.handleLoginSuccess(result, 'wechat');
      })
      .catch(error => {
        this.handleLoginError(error);
      });
  },

  // 🔧 处理用户拒绝授权用户信息（降级登录）
  handleUserProfileDenied: function(error) {
    console.log('用户拒绝授权用户信息，尝试最小化登录');

    // 重新获取登录凭证（之前的可能已过期）
    wx.login({
      success: (loginRes) => {
        if (loginRes.code) {
          // 使用最小化用户信息登录
          const minimalUserInfo = {
            nickName: '微信用户',
            avatarUrl: '',
            gender: 0,
            city: '',
            province: '',
            country: 'CN'
          };

          this.setData({ loadingText: '登录处理中...' });
          this.proceedWithLogin(loginRes.code, minimalUserInfo);
        } else {
          this.handleLoginFailure('获取登录凭证失败');
        }
      },
      fail: () => {
        this.handleLoginFailure('微信登录失败');
      }
    });
  },

  // 🔧 统一的登录失败处理
  handleLoginFailure: function(errorMessage) {
    this.setData({ isLoading: false });
    wx.showToast({
      title: errorMessage,
      icon: 'none'
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
  onSmsCodeInput: function(e) {
    this.setData({
      'phoneForm.smsCode': e.detail.value
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
    loginService.sendSmsCode(this.data.phoneForm.phone, 'login')
      .then(() => {
        wx.hideLoading();
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        });
        this.startCountdown();
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({
          title: error && error.message ? error.message : '发送失败',
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
    
    // 验证码校验
    if (!this.data.phoneForm.smsCode || this.data.phoneForm.smsCode.length !== 6) {
      wx.showToast({
        title: '请输入6位短信验证码',
        icon: 'none'
      });
      return;
    }

    this.setData({
      isLoading: true,
      loadingText: '验证登录中...'
    });

    // 调用手机号验证码登录接口
    loginService.phoneLogin(this.data.phoneForm.phone, this.data.phoneForm.smsCode)
      .then(result => {
        this.handleLoginSuccess(result, 'phone');
      })
      .catch(error => {
        this.handleLoginError(error);
      });
  },

  // 游客登录
  onGuestLogin: function() {
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

          // 调用后端游客登录接口，获取真实的受限 token
          api.post('/auth/guest/login', {}, { silent: true, retries: 0 })
            .then((result) => {
              // result 是后端返回的完整响应体 { success, code, data: {...} }
              const payload = (result && result.data) ? result.data : (result || {});
              const token = payload.token || payload.access_token;

              if (token) {
                wx.setStorageSync('token', String(token));
              }
              if (payload.refresh_token) {
                wx.setStorageSync('refresh_token', String(payload.refresh_token));
              }

              const guestInfo = {
                isLoggedIn: true,
                isGuest: true,
                nickname: payload.nickname || '游客用户',
                avatar: '',
                userId: payload.userId || `guest_${Date.now()}`,
                openid: payload.userId || '',
                loginTime: new Date().toISOString(),
                loginType: 'guest'
              };
              wx.setStorageSync('userInfo', guestInfo);

              this.setData({ isLoading: false });
              wx.showToast({ title: '进入游客模式', icon: 'success' });
              setTimeout(() => {
                wx.switchTab({ url: '/pages/index/index' });
              }, 1500);
            })
            .catch((err) => {
              console.warn('[GuestLogin] 后端游客接口失败，使用本地模式:', err && err.message);
              // 降级：本地游客模式（无 token，仅可浏览已缓存内容）
              const guestInfo = {
                isLoggedIn: true,
                isGuest: true,
                nickname: '游客用户',
                avatar: '',
                userId: `guest_${Date.now()}`,
                openid: '',
                loginTime: new Date().toISOString(),
                loginType: 'guest'
              };
              wx.setStorageSync('userInfo', guestInfo);
              // 清除任何旧 token，避免用过期/错误 token 发请求
              wx.removeStorageSync('token');
              wx.removeStorageSync('refresh_token');

              this.setData({ isLoading: false });
              wx.showToast({ title: '进入游客模式', icon: 'success' });
              setTimeout(() => {
                wx.switchTab({ url: '/pages/index/index' });
              }, 1500);
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
    
    // 确保 userInfo 对象存在
    const rawUserInfo = result.userInfo || {};
    
    // 🔧 修复：提取 token（可能是字符串或对象）
    let token = result.token || result.access_token || result.accessToken;
    
    // 如果 token 是对象，提取其中的 token 字段
    if (typeof token === 'object' && token !== null) {
      console.log('[Login] token 是对象，提取内部字段:', token);
      token = token.token || token.access_token || token.accessToken;
    }
    
    // 确保 token 是字符串
    if (token && typeof token !== 'string') {
      token = String(token);
    }
    
    console.log('[Login] 最终提取的 token:', token ? token.substring(0, 30) + '...' : '无', '类型:', typeof token);
    
    // 保存用户信息和token
    const userInfo = {
      isLoggedIn: true,
      isGuest: false,
      userId: result.userId || result.openid, // 兼容不同返回格式
      openid: result.openid,
      nickname: rawUserInfo.nickName || rawUserInfo.nickname || '微信用户', // 兼容大小写和不同字段名
      avatar: rawUserInfo.avatarUrl || rawUserInfo.avatar || '',
      gender: rawUserInfo.gender || 0,
      loginTime: new Date().toISOString(),
      loginType: loginType
    };

    wx.setStorageSync('userInfo', userInfo);
    
    // 🔧 修复：保存字符串格式的 token
    if (token) {
      wx.setStorageSync('token', token);
      console.log('[Login] Token 已保存为字符串');
    } else {
      console.error('[Login] 警告：没有提取到有效的 token');
    }
    
    // 保存 refresh_token（如果有）
    let refreshToken = result.refresh_token || result.refreshToken;
    if (!refreshToken && result.token && typeof result.token === 'object') {
      refreshToken = result.token.refresh_token || result.token.refreshToken;
    }
    if (refreshToken) {
      wx.setStorageSync('refresh_token', String(refreshToken));
    }

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
    wx.navigateTo({
      url: '/pages/agreement/user-agreement',
      fail: (err) => {
        console.error('跳转用户协议失败', err);
        wx.showToast({
          title: '无法打开用户协议',
          icon: 'none'
        });
      }
    });
  },

  // 显示隐私政策
  showPrivacyPolicy: function() {
    wx.navigateTo({
      url: '/pages/agreement/privacy-policy',
      fail: (err) => {
        console.error('跳转隐私政策失败', err);
        wx.showToast({
          title: '无法打开隐私政策',
          icon: 'none'
        });
      }
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
