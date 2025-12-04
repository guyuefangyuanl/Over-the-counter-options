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
      api.request('/auth/wechat/login', 'POST', {
        code: code,
        userInfo: userInfo
      }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '微信登录失败'));
        }
      }).catch(error => {
        console.error('微信登录接口调用失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
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
      api.request('/auth/qq/login', 'POST', {
        code: code,
        userInfo: userInfo
      }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || 'QQ登录失败'));
        }
      }).catch(error => {
        console.error('QQ登录接口调用失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
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
      api.request('/auth/phone/login', 'POST', {
        phone: phone,
        code: code
      }).then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || '手机号登录失败'));
        }
      }).catch(error => {
        console.error('手机号登录接口调用失败:', error);
        reject(new Error('网络连接失败，请检查网络后重试'));
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
      api.request('/auth/refresh-token', 'POST', {
        refreshToken: refreshToken
      }).then(result => {
        if (result.success) {
          // 更新本地token
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

      api.request('/auth/verify-token', 'GET').then(result => {
        if (result.success) {
          resolve(result.data);
        } else {
          reject(new Error(result.message || 'token验证失败'));
        }
      }).catch(error => {
        console.error('token验证失败:', error);
        reject(error);
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
          // 刷新失败，清除登录状态
          this.clearLoginState();
          reject(error);
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