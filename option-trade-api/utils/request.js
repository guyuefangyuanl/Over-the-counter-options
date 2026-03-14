/**
 * utils/request.js - 樹目层页面HTTP请求封装（P3-4技术债务备注）
 *
 * 当前项目存在两套HTTP封装：
 *   - 本文件（utils/request.js）：供 pages/ 目录下页面使用，简洁实用
 *   - miniprogram/utils/api.js：小程序主体封装，含缓存/队列/并发控制/重试
 *
 * 对齐行为（与 miniprogram/utils/api.js 保持一致）：
 *   - Token键名: 'token' / 'refresh_token'（均为下划线格式）
 *   - 超时: 60000ms（与 app.json networkTimeout.request 一致）
 *   - Mock Token 检测: 拦截 __MOCK__ 前缀 Token 不向后端发送
 *   - 响应格式: { success, data, message }
 *
 * @deprecated 新页面建议统一迁移到 miniprogram/utils/api.js
 */
const config = require('../config.js');

// Base URL配置 - 支持环境切换
const getBaseURL = () => {
  try {
    const accountInfo = wx.getAccountInfoSync();
    const env = accountInfo.miniProgram.envVersion;
    
    if (env === 'release') {
      // 生产环境 - 使用云托管服务
      return 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';
    } else if (env === 'trial') {
      // 体验版 - 同样使用云托管
      return 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';
    } else {
      // 开发环境 - 优先使用云托管，如果配置了本地开发则使用本地
      return config.API_BASE_URL || 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';
    }
  } catch (e) {
    // 如果获取环境信息失败，使用云托管地址
    return 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';
  }
};

const BASE_URL = getBaseURL();
console.log('[Request] API Base URL:', BASE_URL);

// Token刷新状态
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (newToken) => {
  refreshSubscribers.forEach(cb => cb(newToken));
  refreshSubscribers = [];
};

const refreshToken = () => {
  return new Promise((resolve, reject) => {
    const refresh_token = wx.getStorageSync('refresh_token');
    
    if (!refresh_token) {
      reject(new Error('No refresh token'));
      return;
    }

    wx.request({
      url: `${BASE_URL}/auth/token/refresh`,
      method: 'POST',
      data: { refresh_token },
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.success) {
          const tokenData = res.data.data;
          wx.setStorageSync('token', tokenData.access_token || tokenData.token);
          if (tokenData.refresh_token) {
            wx.setStorageSync('refresh_token', tokenData.refresh_token);
          }
          resolve(tokenData.access_token || tokenData.token);
        } else {
          reject(new Error('Token refresh failed'));
        }
      },
      fail: reject
    });
  });
};

/**
 * 统一API请求封装
 * 支持自动Token刷新、请求重试、超时处理
 */
const request = (url, method = 'GET', data = {}, retryCount = 0, options = {}) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    const { timeout = 60000 } = options; // 与 app.json networkTimeout.request 保持一致

    // 拦截Mock Token，不向后端发送（防止开发模式 Mock 出地化请求）
    if (token && token.startsWith('__MOCK__')) {
      console.warn('[Request] 检测到 Mock Token，已拦截请求:', url);
      reject(new Error('当前为 Mock 登录状态，无法发送真实请求'));
      return;
    }
    
    // 构建完整URL
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    
    console.log(`[Request] ${method} ${url}`, { retryCount, hasToken: !!token });
    
    const requestTask = wx.request({
      url: fullUrl,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      timeout: timeout,
      success: (res) => {
        console.log(`[Request] ${method} ${url} 响应:`, res.statusCode);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 检查后端返回的业务错误码
          if (res.data && res.data.code === 401) {
            console.log('[Request] Token过期，尝试刷新...');
            // Token过期，尝试刷新
            if (retryCount < 1 && !isRefreshing) {
              isRefreshing = true;
              refreshToken()
                .then((newToken) => {
                  isRefreshing = false;
                  onTokenRefreshed(newToken);
                  request(url, method, data, retryCount + 1, options).then(resolve).catch(reject);
                })
                .catch((err) => {
                  isRefreshing = false;
                  handleUnauthorized();
                  reject(new Error('登录已过期，请重新登录'));
                });
            } else if (isRefreshing) {
              subscribeTokenRefresh(() => {
                request(url, method, data, retryCount + 1, options).then(resolve).catch(reject);
              });
            } else {
              handleUnauthorized();
              reject(new Error('登录已过期，请重新登录'));
            }
          } else if (res.data && res.data.success === false) {
            // 业务逻辑错误
            console.error('[Request] 业务错误:', res.data.message);
            reject(new Error(res.data.message || '请求失败'));
          } else {
            // 请求成功
            resolve(res.data.data !== undefined ? res.data.data : res.data);
          }
        } else if (res.statusCode === 401) {
          // HTTP 401 未授权
          console.log('[Request] HTTP 401，尝试刷新Token...');
          if (retryCount < 1 && !isRefreshing) {
            isRefreshing = true;
            refreshToken()
              .then((newToken) => {
                isRefreshing = false;
                onTokenRefreshed(newToken);
                request(url, method, data, retryCount + 1, options).then(resolve).catch(reject);
              })
              .catch(() => {
                isRefreshing = false;
                handleUnauthorized();
                reject(new Error('登录已过期，请重新登录'));
              });
          } else {
            handleUnauthorized();
            reject(new Error('登录已过期，请重新登录'));
          }
        } else if (res.statusCode >= 500) {
          // 服务器错误
          console.error('[Request] 服务器错误:', res.statusCode, res.data);
          reject(new Error(res.data?.message || '服务器内部错误，请稍后重试'));
        } else {
          // 其他HTTP错误
          console.error('[Request] HTTP错误:', res.statusCode, res.data);
          reject(new Error(res.data?.message || `请求失败 (${res.statusCode})`));
        }
      },
      fail: (err) => {
        console.error(`[Request] ${method} ${url} 失败:`, err);
        
        // 处理不同类型的网络错误
        let errorMessage = '网络请求失败';
        
        if (err.errMsg) {
          if (err.errMsg.includes('timeout')) {
            errorMessage = '请求超时，请检查网络连接';
          } else if (err.errMsg.includes('fail')) {
            errorMessage = '网络连接失败，请检查网络设置';
          } else if (err.errMsg.includes('cancel')) {
            errorMessage = '请求已取消';
          } else {
            errorMessage = err.errMsg;
          }
        }
        
        reject(new Error(errorMessage));
      }
    });
  });
};

const handleUnauthorized = () => {
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  // Navigate to login page or show modal
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route !== 'pages/login/login') {
      wx.navigateTo({
        url: '/pages/login/login'
      });
  }
};

const get = (url, data) => request(url, 'GET', data);
const post = (url, data) => request(url, 'POST', data);
const put = (url, data) => request(url, 'PUT', data);
const del = (url, data) => request(url, 'DELETE', data);

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  BASE_URL
};
