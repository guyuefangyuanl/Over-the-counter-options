const { getBaseUrl } = require('../config/api.config.js');

const BASE_URL = getBaseUrl();

const getUserId = () => {
  let userId = wx.getStorageSync('userId');
  if (!userId) {
    userId = 'user_' + Date.now() + Math.random().toString(36).substr(2, 5);
    wx.setStorageSync('userId', userId);
  }
  return userId;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeError = (err) => {
  if (!err) return { message: '请求失败' };
  if (typeof err === 'string') return { message: err };
  if (err.message) return err;
  if (err.errMsg) return { message: err.errMsg };
  return { message: '请求失败' };
};

const shouldRetry = (err) => {
  const status = err && (err.statusCode || err.code);
  if (status === 0) return true;
  if (status === 408 || status === 429) return true;
  return typeof status === 'number' && status >= 500;
};

const request = (url, method, data, options = {}) => {
  const retries = Number.isFinite(options.retries) ? options.retries : 1;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 200;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;

  const maxAttempts = Math.max(1, retries + 1);

  const attemptOnce = (attemptIndex) => {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${BASE_URL}${url}`,
        method,
        data,
        timeout: timeoutMs,
        header: {
          'content-type': 'application/json',
          'X-User-ID': getUserId()
        },
        success: (res) => {
          const payload = res.data;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (payload && payload.success === false) {
              reject({ ...(payload || {}), statusCode: res.statusCode });
              return;
            }
            resolve(payload);
            return;
          }
          const baseErr = (payload && typeof payload === 'object') ? { ...payload } : { message: '请求失败' };
          reject({ ...baseErr, statusCode: res.statusCode });
        },
        fail: (err) => {
          reject({ ...normalizeError(err), statusCode: 0 });
        }
      });
    }).catch(async (err) => {
      if (attemptIndex < maxAttempts - 1 && shouldRetry(err)) {
        const backoff = retryDelayMs * Math.pow(2, attemptIndex);
        await sleep(backoff);
        return attemptOnce(attemptIndex + 1);
      }
      throw err;
    });
  };

  return attemptOnce(0);
};

const api = {
  // 获取分组列表
  getGroups: () => {
    return request('/groups', 'GET', undefined, { retries: 2 });
  },

  // 创建分组
  createGroup: (name) => {
    return request('/groups', 'POST', { name }, { retries: 1 });
  },

  // 更新分组
  updateGroup: (groupId, data) => {
    return request(`/groups/${groupId}`, 'PUT', data, { retries: 1 });
  },

  // 删除分组
  deleteGroup: (groupId, options = {}) => {
    const removeFavorites = options && (options.removeFavorites === true || options.removeFavorites === 1 || options.removeFavorites === '1');
    const query = `?remove_favorites=${removeFavorites ? 1 : 0}`;
    return request(`/groups/${groupId}${query}`, 'DELETE', undefined, { retries: 1 });
  },

  // 添加成员
  addMember: (groupId, stockCode, market = '', name = '') => {
    return request(`/groups/${groupId}/members`, 'POST', { 
      stock_code: stockCode,
      market: market,
      name: name
    }, { retries: 1 });
  },

  // 移除成员
  removeMember: (groupId, stockCode) => {
    return request(`/groups/${groupId}/members/${stockCode}`, 'DELETE', undefined, { retries: 1 });
  }
};

module.exports = api;
