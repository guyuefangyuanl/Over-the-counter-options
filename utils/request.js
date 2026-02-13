const config = require('../config.js');

// Base URL配置 - 支持环境切换
const getBaseURL = () => {
  try {
    const accountInfo = wx.getAccountInfoSync();
    const env = accountInfo.miniProgram.envVersion;
    
    if (env === 'release') {
      return 'https://api.your-domain.com/api/v1'; // 生产环境
    } else if (env === 'trial') {
      return 'https://test-api.your-domain.com/api/v1'; // 体验版
    } else {
      return 'http://localhost:5002/api/v1'; // 开发环境
    }
  } catch (e) {
    return 'http://localhost:5002/api/v1';
  }
};

const BASE_URL = getBaseURL();

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

const request = (url, method = 'GET', data = {}, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    
    wx.request({
      url: `${BASE_URL}${url}`,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            if (res.data && res.data.code === 401) {
                // Token过期，尝试刷新
                if (retryCount < 1 && !isRefreshing) {
                  isRefreshing = true;
                  refreshToken()
                    .then((newToken) => {
                      isRefreshing = false;
                      onTokenRefreshed(newToken);
                      request(url, method, data, retryCount + 1).then(resolve).catch(reject);
                    })
                    .catch(() => {
                      isRefreshing = false;
                      handleUnauthorized();
                      reject(new Error('Token refresh failed'));
                    });
                } else if (isRefreshing) {
                  subscribeTokenRefresh(() => {
                    request(url, method, data, retryCount + 1).then(resolve).catch(reject);
                  });
                } else {
                  handleUnauthorized();
                  reject(res.data);
                }
            } else if (res.data && res.data.success === false) {
                 reject(res.data);
            } else {
                 resolve(res.data.data || res.data);
            }
        } else if (res.statusCode === 401) {
          if (retryCount < 1 && !isRefreshing) {
            isRefreshing = true;
            refreshToken()
              .then((newToken) => {
                isRefreshing = false;
                onTokenRefreshed(newToken);
                request(url, method, data, retryCount + 1).then(resolve).catch(reject);
              })
              .catch(() => {
                isRefreshing = false;
                handleUnauthorized();
                reject({ message: 'Unauthorized' });
              });
          } else {
            handleUnauthorized();
            reject({ message: 'Unauthorized' });
          }
        } else {
          reject(res.data || { message: `Request failed with status ${res.statusCode}` });
        }
      },
      fail: (err) => {
        reject(err);
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
