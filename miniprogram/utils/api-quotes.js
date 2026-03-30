/**
 * 期权报价API模块
 * 提供批量获取期权报价的能力
 */

const { getBaseUrl } = require('../config/api.config.js');

const BASE_URL = getBaseUrl();

/**
 * 获取用户ID
 */
const getUserId = () => {
  let userId = wx.getStorageSync('userId');
  if (!userId) {
    userId = 'user_' + Date.now() + Math.random().toString(36).substr(2, 5);
    wx.setStorageSync('userId', userId);
  }
  return userId;
};

/**
 * 通用请求方法
 */
const request = (url, method, data, options = {}) => {
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 200;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;

  const maxAttempts = Math.max(1, retries + 1);

  const attemptOnce = (attemptIndex) => {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      const headers = {
        'content-type': 'application/json',
        'X-User-ID': getUserId()
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      wx.request({
        url: `${BASE_URL}${url}`,
        method,
        data,
        timeout: timeoutMs,
        header: headers,
        success: (res) => {
          console.log(`[Quotes API] ${method} ${url} status=${res.statusCode}`);
          const payload = res.data;

          // 处理401未授权
          if (res.statusCode === 401 || (payload && (payload.code === 401 || payload.code === '401'))) {
            console.warn('[Quotes API] 401 Unauthorized - 清除token并跳转登录');
            wx.removeStorageSync('token');
            wx.removeStorageSync('userInfo');
            wx.removeStorageSync('refresh_token');

            wx.redirectTo({
              url: '/pages/login/login?from=api_401',
              fail: () => {
                wx.reLaunch({ url: '/pages/login/login?from=api_401' });
              }
            });

            reject({
              message: payload?.message || '登录已过期，请重新登录',
              statusCode: 401,
              needLogin: true
            });
            return;
          }

          // 成功响应
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (payload && payload.success === false) {
              reject({ ...(payload || {}), statusCode: res.statusCode });
              return;
            }
            resolve(payload);
            return;
          }

          // 其他错误
          const baseErr = (payload && typeof payload === 'object') ? { ...payload } : { message: '请求失败' };
          reject({ ...baseErr, statusCode: res.statusCode });
        },
        fail: (err) => {
          reject({ message: err.errMsg || '网络请求失败', statusCode: 0 });
        }
      });
    }).catch(async (err) => {
      // 重试逻辑
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

/**
 * 判断是否应该重试
 */
const shouldRetry = (err) => {
  const status = err && (err.statusCode || err.code);
  if (status === 0) return true;  // 网络错误
  if (status === 408 || status === 429) return true;  // 超时或限流
  return typeof status === 'number' && status >= 500;  // 服务器错误
};

/**
 * 延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 期权报价API
 */
const quotesApi = {
  /**
   * 批量获取期权报价
   * @param {Array<string>} stockCodes 股票代码列表（最多50个）
   * @param {string} term 期限，默认'1M'，可选: 2W, 1M, 2M, 3M, 6M, 9M, 1Y
   * @param {string} optionType 期权类型，默认'call'，可选: call, put
   * @returns {Promise} 返回期权报价数据
   *
   * @example
   * const result = await quotesApi.getBatchOptionQuotes(['300750.SZ', '600519.SH'], '1M', 'call');
   * // result.data.quotes 包含每个股票的 atm, otm105, otm110 报价
   */
  getBatchOptionQuotes: (stockCodes, term = '1M', optionType = 'call') => {
    if (!stockCodes || !Array.isArray(stockCodes) || stockCodes.length === 0) {
      return Promise.reject({ message: '股票代码列表不能为空' });
    }

    if (stockCodes.length > 50) {
      return Promise.reject({ message: '股票代码数量超过限制（最多50个）' });
    }

    return request('/api/stock/option-quotes/batch', 'POST', {
      stockCodes,
      term,
      optionType
    }, { retries: 2, timeoutMs: 15000 });
  },

  /**
   * 获取单个股票的期权报价
   * @param {string} stockCode 股票代码，如 '300750.SZ'
   * @param {string} term 期限，默认'1M'
   * @param {string} optionType 期权类型，默认'call'
   * @returns {Promise} 返回单个股票的期权报价
   */
  getSingleOptionQuote: (stockCode, term = '1M', optionType = 'call') => {
    if (!stockCode) {
      return Promise.reject({ message: '股票代码不能为空' });
    }

    return request('/api/stock/option-quotes/single', 'GET', {
      code: stockCode,
      term,
      optionType
    }, { retries: 2, timeoutMs: 10000 });
  },

  /**
   * 获取支持的期限列表
   * @returns {Promise} 返回期限列表
   */
  getSupportedTerms: () => {
    return request('/api/stock/option-quotes/terms', 'GET', {}, { retries: 1, timeoutMs: 5000 });
  }
};

module.exports = quotesApi;