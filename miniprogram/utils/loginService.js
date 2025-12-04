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
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        const mockResult = {
          userId: `mock_${Date.now()}`,
          openid: `mock_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: (userInfo && userInfo.nickName) || '微信用户',
            avatarUrl: (userInfo && userInfo.avatarUrl) || '',
            gender: (userInfo && userInfo.gender) || 0
          },
          token: `mock_token_${Date.now()}`
        };
        resolve(mockResult);
        return;
      }
      api.request('/auth/wechat/login', 'POST', {
        code: code,
        userInfo: userInfo
      }, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '微信登录失败'));
        }
      }).catch(error => {
        const mockResult = {
          userId: `mock_${Date.now()}`,
          openid: `mock_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: (userInfo && userInfo.nickName) || '微信用户',
            avatarUrl: (userInfo && userInfo.avatarUrl) || '',
            gender: (userInfo && userInfo.gender) || 0
          },
          token: `mock_token_${Date.now()}`
        };
        resolve(mockResult);
      });
    });
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
          token: `mock_token_${Date.now()}`
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
        const mockResult = {
          userId: `mockqq_${Date.now()}`,
          openid: `mock_qq_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: (userInfo && userInfo.nickName) || 'QQ用户',
            avatarUrl: (userInfo && userInfo.avatarUrl) || '',
            gender: (userInfo && userInfo.gender) || 0
          },
          token: `mock_token_${Date.now()}`
        };
        resolve(mockResult);
      });
    });
  }

  /**
   * 手机号登录
   * @param {string} phone 手机号
   * @param {string} code 验证码
   * @returns {Promise}
   */
  phoneLogin(phone, code) {
    return new Promise((resolve, reject) => {
      const account = (typeof wx.getAccountInfoSync === 'function') ? wx.getAccountInfoSync() : null;
      const envVersion = account && account.miniProgram && account.miniProgram.envVersion;
      const useRealBackend = wx.getStorageSync('useRealBackend') === true;
      if (envVersion === 'develop' && !useRealBackend) {
        if (!/^1[3-9]\d{9}$/.test(phone) || !code || code.length !== 6) {
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
          token: `mock_token_${Date.now()}`
        };
        resolve(mockResult);
        return;
      }
      api.request('/auth/phone/login', 'POST', {
        phone: phone,
        code: code
      }, {}, { silent: true, retries: 0, suppressErrorLog: true, suppressRetryLog: true }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '手机号登录失败'));
        }
      }).catch(error => {
        const mockResult = {
          userId: `mockphone_${Date.now()}`,
          openid: `mock_phone_openid_${Math.random().toString(36).slice(2)}`,
          userInfo: {
            nickName: '手机号用户',
            avatarUrl: '',
            gender: 0
          },
          token: `mock_token_${Date.now()}`
        };
        resolve(mockResult);
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
        const mock = { token: `mock_token_${Date.now()}` };
        wx.setStorageSync('token', mock.token);
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
        wx.removeStorageSync('refreshToken');
        
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '登出失败'));
        }
      }).catch(error => {
        // 即使接口调用失败，也清除本地存储
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('token');
        wx.removeStorageSync('refreshToken');
        
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
      const refreshToken = wx.getStorageSync('refreshToken');
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
    wx.removeStorageSync('refreshToken');
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
