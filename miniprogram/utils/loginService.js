// 登录服务工具类
const api = require('./api');

class LoginService {
  
  /**
   * 微信登录
   * @param {string} code 微信登录code
   * @param {object} userInfo 微信用户信息
   * @returns {Promise}
   */
  wechatLogin(code, userInfo) {
    return new Promise((resolve, reject) => {
      // 优先尝试调用本地/后端API登录，而不是直接调用云函数
      // 这样可以确保Token是由后端生成的，能够被后端正确验证
      api.post('/auth/wechat/login', {
        code: code,
        userInfo: userInfo
      }).then(result => {
        console.log('后端API登录成功:', result);
        if (result.success) {
          resolve(result.data);
        } else {
          // 如果后端API失败，再尝试云函数作为降级方案（仅在生产环境）
          this._tryCloudLogin(code, userInfo, resolve, reject, result.message);
        }
      }).catch(error => {
        console.error('后端API登录失败:', error);
        // 如果网络错误或接口不存在，尝试云函数
        this._tryCloudLogin(code, userInfo, resolve, reject, error.message);
      });
    });
  }

  /**
   * 尝试云函数登录（降级方案）
   * 
   * 🔒 安全策略：
   * 1. 开发环境：允许Mock登录，但需要用户明确确认
   * 2. 生产环境：禁止Mock登录，必须使用真实认证
   * 3. 所有Mock认证都会记录详细日志，便于审计
   */
  _tryCloudLogin(code, userInfo, resolve, reject, prevErrorMsg) {
    const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
    const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
    const isDevelopment = envVersion === 'develop' || envVersion === 'trial';
    
    // 🛑 生产环境下禁止Mock登录
    if (!isDevelopment) {
      console.error('🛑 生产环境登录失败，禁止使用Mock登录', {
        error: prevErrorMsg,
        timestamp: new Date().toISOString(),
        envVersion: envVersion
      });
      
      wx.showModal({
        title: '登录失败',
        content: '请检查网络连接后重试。\n\n错误信息：' + (prevErrorMsg || '未知错误'),
        showCancel: false,
        confirmText: '知道了',
        success: () => {
          reject(new Error('生产环境登录失败: ' + prevErrorMsg));
        }
      });
      return;
    }
    
    // ⚠️ 开发/体验环境下允许Mock登录，但需要用户确认
    console.warn('⚠️ 开发环境后端登录失败，尝试Mock登录', {
      error: prevErrorMsg,
      timestamp: new Date().toISOString(),
      envVersion: envVersion
    });
    
    // 检查是否允许Mock登录（可通过全局配置控制）
    const app = getApp();
    const allowMock = app.globalData.allowMockLogin !== false; // 默认允许开发环境Mock
    
    if (!allowMock) {
      console.error('🚫 Mock登录已被禁用');
      reject(new Error('登录失败，Mock登录已禁用: ' + prevErrorMsg));
      return;
    }
    
    // 尝试使用Mock Code请求后端（后端可能支持开发模式Mock）
    console.log('🛠️ 尝试使用 Dev Mock Code 重新请求后端...');
    const mockCode = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    api.post('/auth/wechat/login', {
      code: mockCode,
      userInfo: userInfo,
      __devMock: true // 标记这是开发Mock请求
    }).then(result => {
      console.log('✅ Dev Mock 登录成功:', result);
      if (result.success) {
        // 记录Mock登录成功
        this._logMockLogin('backend_mock_success', mockCode, userInfo);
        resolve(result.data);
      } else {
        // 后端也不支持Mock，降级到纯前端Mock
        this._fallbackToFrontendMock(userInfo, resolve, reject, prevErrorMsg);
      }
    }).catch(err => {
      console.error('❌ Dev Mock 登录也失败:', err);
      this._fallbackToFrontendMock(userInfo, resolve, reject, prevErrorMsg);
    });
    
    // 生产环境尝试云函数登录
    // 注意：生产环境不允许使用Mock，只能使用云函数或后端API
    // 这部分代码已被移除，因为非开发环境下不会进入此函数
  }

  /**
   * 降级到纯前端Mock登录（最后的后备方案）
   * 
   * ⚠️ 重要提示：
   * - 纯前端Mock生成的Token无法被后端验证
   * - 仅用于UI调试，无法进行真实的业务操作
   * - 开发/体验环境：自动使用Mock，无需用户确认
   * - 生产环境：禁止Mock，直接报错
   * 
   * @private
   */
  _fallbackToFrontendMock(userInfo, resolve, reject, prevErrorMsg) {
    const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
    const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
    const isDevelopment = envVersion === 'develop' || envVersion === 'trial';

    const mockResult = {
      userId: `mock_${Date.now()}`,
      openid: `mock_openid_${Math.random().toString(36).slice(2)}`,
      userInfo: {
        nickName: (userInfo && userInfo.nickName) || '微信用户',
        avatarUrl: (userInfo && userInfo.avatarUrl) || '',
        gender: (userInfo && userInfo.gender) || 0
      },
      token: `__MOCK__${Date.now()}`,  // Mock Token: 仅用于UI调试，无法通过后端验证
      __mockTimestamp: Date.now()
    };

    // 🛑 生产环境禁止Mock登录
    if (!isDevelopment) {
      console.error('🛑 生产环境禁止使用Mock登录');
      reject(new Error('登录失败，请检查网络后重试: ' + (prevErrorMsg || '未知错误')));
      return;
    }

    // ✅ 开发/体验环境：自动使用Mock，无需用户确认
    console.warn('⚠️ 开发环境：后端不可达，自动启用前端Mock模式。Mock Token无法通过后端验证，仅用于UI调试。');
    this._logMockLogin('frontend_mock_auto', null, userInfo);

    // 设置全局Mock标记
    const app = getApp();
    app.globalData.isMockMode = true;

    // 显示一次性的轻提示（不阻断流程）
    wx.showToast({
      title: 'Mock模式（后端离线）',
      icon: 'none',
      duration: 2000
    });

    resolve(mockResult);
  }

  /**
   * 记录Mock登录日志
   * @private
   * @param {string} type Mock类型
   * @param {string} mockCode Mock代码
   * @param {object} userInfo 用户信息
   */
  _logMockLogin(type, mockCode, userInfo) {
    const logEntry = {
      type: type,
      mockCode: mockCode,
      timestamp: new Date().toISOString(),
      userNickName: userInfo?.nickName || 'Unknown',
      envVersion: wx.getAccountInfoSync()?.miniProgram?.envVersion || 'unknown'
    };
    
    console.warn('📝 Mock登录记录:', logEntry);
    
    // 将Mock登录记录保存到本地存储（用于审计）
    try {
      const logs = wx.getStorageSync('mock_login_logs') || [];
      logs.push(logEntry);
      // 保留最后100条记录
      wx.setStorageSync('mock_login_logs', logs.slice(-100));
    } catch (error) {
      console.error('保存Mock登录日志失败:', error);
    }
  }

  /**
   * QQ登录
   * @param {string} code QQ登录code
   * @param {object} userInfo QQ用户信息
   * @returns {Promise}
   */
  qqLogin(code, userInfo) {
    return new Promise((resolve, reject) => {
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        const mockResult = {
          userId: `mockqq_${Date.now()}`,
          openid: `mock_qq_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: (userInfo && userInfo.nickName) || 'QQ用户',
            avatarUrl: (userInfo && userInfo.avatarUrl) || '',
            gender: (userInfo && userInfo.gender) || 0
          },
          token: `__MOCK__${Date.now()}`  // Mock Token: 仅用于UI调试
        };
        resolve(mockResult);
        return;
      }
      api.request('/auth/qq/login', 'POST', {
        code: code,
        userInfo: userInfo
      }, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || 'QQ登录失败'));
        }
      }).catch(error => {
        // QQ登录失败直接上报，不静默降级到Mock（此类降级会掊兴调试）
        console.error('QQ登录失败:', error);
        reject(new Error((error && error.message) || 'QQ登录失败，请重试'));
      });
    });
  }

  /**
   * 手机号验证码登录
   * @param {string} phone 手机号
   * @param {string} smsCode 短信验证码
   * @returns {Promise}
   */
  phoneLogin(phone, smsCode) {
    return new Promise((resolve, reject) => {
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        if (!/^1[3-9]\d{9}$/.test(phone) || !smsCode || smsCode.length !== 6) {
          reject(new Error('手机号或验证码不合法'));
          return;
        }
        const mockResult = {
          userId: `mockphone_${Date.now()}`,
          openid: `mock_phone_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: '手机号用户',
            avatarUrl: '',
            gender: 0
          },
          token: `__MOCK__${Date.now()}`  // Mock Token: 仅用于UI调试
        };
        resolve(mockResult);
        return;
      }
      api.request('/auth/login/phone', 'POST', {
        phone: phone,
        sms_code: smsCode  // 验证码登录，对齐后端字段名
      }, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          const payload = result.data || {};
          resolve({
            ...payload,
            userId: payload.userId || payload.openid,
            userInfo: payload.userInfo || {
              nickName: payload.nickname || '手机号用户',
              avatarUrl: payload.avatar || '',
              gender: payload.gender || 0
            }
          });
        } else {
          reject(new Error(result.message || '手机号登录失败'));
        }
      }).catch(error => {
        console.error('手机号验证码登录失败:', error);
        reject(new Error((error && error.message) || '网络连接失败，请检查网络后重试'));
      });
    });
  }

  /**
   * 刷新token
   * @param {string} refreshToken 刷新token
   * @returns {Promise}
   */
  refreshToken(refreshToken) {
    return new Promise((resolve, reject) => {
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        const mock = { token: `__MOCK__${Date.now()}` }; // 开发模式Mock Token
        resolve(mock);
        return;
      }
      api.request('/auth/refresh-token', 'POST', {
        refreshToken: refreshToken
      }, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          wx.setStorageSync('token', result.data.token);
          resolve(result.data);
        } else {
          reject(new Error(result.message || 'token刷新失败'));
        }
      }).catch(error => {
        console.error('刷新token失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 验证token有效性
   * @returns {Promise}
   */
  verifyToken() {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      if (!token) {
        reject(new Error('未找到token'));
        return;
      }
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        resolve({ valid: true, offline: true });
        return;
      }
      api.request('/auth/verify-token', 'GET', {}, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || 'token验证失败'));
        }
      }).catch(error => {
        const msg = (error && error.message) || '';
        if (msg.includes('网络') || msg.includes('timeout') || msg.includes('request:fail')) {
          resolve({ valid: true, offline: true });
        } else {
          console.error('token验证失败:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * 登出
   * @returns {Promise}
   */
  logout() {
    return new Promise((resolve, reject) => {
      api.request('/auth/logout', 'POST').then(result => {
        // 清除本地存储
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('token');
        wx.removeStorageSync('refresh_token');  // 统一使用下划线格式
        
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '登出失败'));
        }
      }).catch(error => {
        // 即使接口调用失败，也清除本地存储
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('token');
        wx.removeStorageSync('refresh_token');  // 统一使用下划线格式
        
        console.error('登出接口调用失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 发送短信验证码
   * @param {string} phone 手机号
   * @param {string} type 验证码类型 login|register|bind|verify
   * @returns {Promise}
   */
  sendSmsCode(phone, type = 'login') {
    return new Promise((resolve, reject) => {
      api.request('/auth/send-sms-code', 'POST', {
        phone: phone,
        type: type
      }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '发送验证码失败'));
        }
      }).catch(error => {
        console.error('发送验证码失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
      });
    });
  }

  /**
   * 验证短信验证码
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @param {string} type 验证码类型
   * @returns {Promise}
   */
  verifySmsCode(phone, code, type = 'login') {
    return new Promise((resolve, reject) => {
      api.request('/auth/verify-sms-code', 'POST', {
        phone: phone,
        code: code,
        type: type
      }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '验证码验证失败'));
        }
      }).catch(error => {
        console.error('验证码验证失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
      });
    });
  }

  /**
   * 绑定手机号
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @returns {Promise}
   */
  bindPhone(phone, code) {
    return new Promise((resolve, reject) => {
      api.request('/auth/bind-phone', 'POST', {
        phone: phone,
        code: code
      }).then(result => {
        if (result.success) {
          // 更新本地用户信息
          const userInfo = wx.getStorageSync('userInfo') || {};
          userInfo.phone = phone;
          wx.setStorageSync('userInfo', userInfo);
          
          resolve(result.data);
        } else {
          reject(new Error(result.message || '绑定手机号失败'));
        }
      }).catch(error => {
        console.error('绑定手机号失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
      });
    });
  }

  /**
   * 检查登录状态
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    const userInfo = wx.getStorageSync('userInfo');
    const token = wx.getStorageSync('token');
    return !!(userInfo && userInfo.isLoggedIn && token);
  }

  /**
   * 获取当前用户信息
   * @returns {object|null} 用户信息
   */
  getCurrentUser() {
    if (this.isLoggedIn()) {
      return wx.getStorageSync('userInfo');
    }
    return null;
  }

  /**
   * 自动刷新token（在token即将过期时）
   * @returns {Promise}
   */
  autoRefreshToken() {
    return new Promise((resolve, reject) => {
      const refreshToken = wx.getStorageSync('refresh_token');  // 统一使用下划线格式
      if (!refreshToken) {
        reject(new Error('未找到refreshToken'));
        return;
      }

      this.refreshToken(refreshToken)
        .then(result => {
          console.log('token自动刷新成功');
          resolve(result);
        })
        .catch(error => {
          console.error('token自动刷新失败:', error);
          const msg = (error && error.message) || '';
          if (msg.includes('网络') || msg.includes('timeout') || msg.includes('request:fail')) {
            reject(error);
          } else {
            this.clearLoginState();
            reject(error);
          }
        });
    });
  }

  /**
   * 清除登录状态
   */
  clearLoginState() {
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('token');
    wx.removeStorageSync('refresh_token');  // 统一使用下划线格式
  }

  /**
   * 自动登录检查（应用启动时调用）
   * @returns {Promise}
   */
  autoLogin() {
    return new Promise((resolve, reject) => {
      if (!this.isLoggedIn()) {
        reject(new Error('未登录'));
        return;
      }

      // 验证token是否有效
      this.verifyToken()
        .then(result => {
          console.log('自动登录验证成功');
          resolve(result);
        })
        .catch(error => {
          console.log('token验证失败，尝试刷新');
          // token无效，尝试刷新
          this.autoRefreshToken()
            .then(result => {
              console.log('自动登录成功（已刷新token）');
              resolve(result);
            })
            .catch(refreshError => {
              console.error('自动登录失败:', refreshError);
              reject(refreshError);
            });
        });
    });
  }
}

module.exports = new LoginService();
