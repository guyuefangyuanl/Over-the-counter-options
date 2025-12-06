// utils/api.js
/**
 * API 请求工具类（增强版）
 * 功能：请求重试、缓存、队列管理、并发控制、统计
 */

// ==================== 配置 ====================

let BASE_URL = 'http://localhost:3000/api/v1'; // 可配置的基础URL

// API响应缓存
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 请求队列和并发控制
const requestQueue = [];
let maxConcurrentRequests = 6; // 最大并发请求数
let activeRequests = 0;

// 请求重试配置
const retryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  exponentialBackoff: true
};

// API统计信息
const apiStats = {
  totalRequests: 0,
  successCount: 0,
  errorCount: 0,
  averageResponseTime: 0,
  retryCount: 0
};

// 错误码映射
const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN'
};

// ==================== 核心请求方法 ====================

/**
 * HTTP 请求工具（增强版）
 * @param {string} url 请求路径
 * @param {string} method 请求方法
 * @param {object} data 请求数据
 * @param {object} header 请求头
 * @param {object} options 额外选项
 * @returns {Promise}
 */
function request(url, method = 'GET', data = {}, header = {}, options = {}) {
  const { 
    enableCache = false, 
    cacheKey, 
    timeout = 10000,
    retries = retryConfig.maxRetries,
    priority = 'normal', // normal, high, low
    dedupe = false, // 是否去重
    interceptors = {} // 请求拦截器
  } = options;
  
  // 请求去重
  if (dedupe) {
    const dedupeKey = `${method}_${url}_${JSON.stringify(data)}`;
    const existingRequest = requestQueue.find(req => req.key === dedupeKey && !req.completed);
    
    if (existingRequest) {
      console.log(`[API] 请求去重: ${dedupeKey}`);
      return existingRequest.promise;
    }
  }
  
  // 检查缓存 (仅GET请求)
  if (method === 'GET' && enableCache) {
    const finalCacheKey = cacheKey || generateCacheKey(url, data);
    const cachedData = getCachedData(finalCacheKey);
    
    if (cachedData) {
      console.log(`[API] 缓存命中: ${url}`);
      apiStats.successCount++;
      return Promise.resolve(cachedData);
    }
  }
  
  // 创建请求Promise
  const requestPromise = processRequestWithQueue(url, method, data, header, {
    enableCache, cacheKey, timeout, retries, priority, interceptors
  });
  
  // 添加到请求队列用于去重
  if (dedupe) {
    const dedupeKey = `${method}_${url}_${JSON.stringify(data)}`;
    const queueItem = {
      key: dedupeKey,
      promise: requestPromise,
      completed: false
    };
    
    requestQueue.push(queueItem);
    
    requestPromise.finally(() => {
      queueItem.completed = true;
      // 清理已完成的请求
      const index = requestQueue.indexOf(queueItem);
      if (index > -1) {
        requestQueue.splice(index, 1);
      }
    });
  }
  
  return requestPromise;
}

/**
 * 生成缓存键
 */
function generateCacheKey(url, data) {
  return `${url}_${JSON.stringify(data)}`;
}

/**
 * 获取缓存数据
 */
function getCachedData(cacheKey) {
  if (apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    } else {
      apiCache.delete(cacheKey);
    }
  }
  return null;
}

/**
 * 设置缓存数据
 */
function setCachedData(cacheKey, data) {
  apiCache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
}

// ==================== 认证处理 ====================

/**
 * 处理未授权响应
 */
function handleUnauthorized() {
  console.warn('[API] 检测到401未授权，尝试刷新Token');
  
  const refreshToken = wx.getStorageSync('refreshToken');
  
  if (refreshToken) {
    // 刷新token
    request('/auth/refresh-token', 'POST', { refreshToken }, {}, { enableCache: false })
      .then(result => {
        console.log('[API] Token刷新成功');
        wx.setStorageSync('token', result.token);
        
        // 可选：刷新成功后重新加载页面
        // getCurrentPages()[getCurrentPages().length - 1].onLoad();
      })
      .catch(error => {
        console.error('[API] Token刷新失败:', error);
        clearAuthData();
        redirectToLogin();
      });
  } else {
    console.warn('[API] 没有RefreshToken，清除认证数据');
    clearAuthData();
    redirectToLogin();
  }
}

/**
 * 清除认证数据
 */
function clearAuthData() {
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('token');
  wx.removeStorageSync('refreshToken');
  console.log('[API] 认证数据已清除');
}

/**
 * 跳转到登录页
 */
function redirectToLogin() {
  wx.reLaunch({
    url: '/pages/login/login',
    fail: (error) => {
      console.error('[API] 跳转登录页失败:', error);
      // 降级方案：显示模态框
      wx.showModal({
        title: '登录已过期',
        content: '请重新登录',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          // 手动跳转
          wx.switchTab({
            url: '/pages/profile/profile'
          });
        }
      });
    }
  });
}

// ==================== 请求队列管理 ====================

/**
 * 处理请求队列和并发控制
 */
function processRequestWithQueue(url, method, data, header, options) {
  return new Promise((resolve, reject) => {
    const queueItem = {
      url,
      method,
      data,
      header,
      options,
      resolve,
      reject,
      timestamp: Date.now()
    };
    
    requestQueue.push(queueItem);
    processQueue();
  });
}

/**
 * 处理请求队列
 */
function processQueue() {
  // 检查是否达到最大并发数
  if (activeRequests >= maxConcurrentRequests || requestQueue.length === 0) {
    return;
  }
  
  // 按优先级排序（从队列中找出未开始的请求）
  const pendingRequests = requestQueue.filter(req => !req.started);
  
  pendingRequests.sort((a, b) => {
    const priorityMap = { high: 3, normal: 2, low: 1 };
    const aPriority = priorityMap[a.options.priority] || 2;
    const bPriority = priorityMap[b.options.priority] || 2;
    
    // 优先级相同时按时间排序
    if (aPriority === bPriority) {
      return a.timestamp - b.timestamp;
    }
    
    return bPriority - aPriority;
  });
  
  // 处理下一个请求
  const nextRequest = pendingRequests[0];
  
  if (nextRequest) {
    nextRequest.started = true;
    activeRequests++;
    
    executeRequest(nextRequest)
      .then(result => {
        activeRequests--;
        nextRequest.resolve(result);
        
        // 从队列中移除
        const index = requestQueue.indexOf(nextRequest);
        if (index > -1) {
          requestQueue.splice(index, 1);
        }
        
        processQueue(); // 处理下一个请求
      })
      .catch(error => {
        activeRequests--;
        nextRequest.reject(error);
        
        // 从队列中移除
        const index = requestQueue.indexOf(nextRequest);
        if (index > -1) {
          requestQueue.splice(index, 1);
        }
        
        processQueue(); // 处理下一个请求
      });
  }
}

// ==================== 请求执行 ====================

/**
 * 执行请求
 */
async function executeRequest(requestItem) {
  const { url, method, data, header, options } = requestItem;
  const { timeout, retries, interceptors } = options;
  
  // 更新统计
  apiStats.totalRequests++;
  
  // 请求拦截器
  if (interceptors.request) {
    try {
      await interceptors.request(requestItem);
    } catch (error) {
      throw new Error(`请求拦截器错误: ${error.message}`);
    }
  }
  
  // 获取token
  const token = wx.getStorageSync('token');
  
  // 设置默认请求头
  const defaultHeader = {
    'content-type': 'application/json',
    ...header
  };
  
  // 如果有token，添加到请求头
  if (token) {
    defaultHeader['Authorization'] = `Bearer ${token}`;
  }

  // 完整的请求URL
  const requestUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  
  // 记录开始时间
  const startTime = Date.now();
  
  try {
    const result = await performRequestWithRetry(
      requestUrl, 
      method, 
      data, 
      defaultHeader, 
      timeout, 
      retries, 
      requestItem
    );
    
    // 记录响应时间
    const responseTime = Date.now() - startTime;
    updateResponseTime(responseTime);
    apiStats.successCount++;
    
    // 响应拦截器
    if (interceptors.response) {
      try {
        return await interceptors.response(result);
      } catch (error) {
        throw new Error(`响应拦截器错误: ${error.message}`);
      }
    }
    
    return result;
    
  } catch (error) {
    apiStats.errorCount++;
    throw error;
  }
}

/**
 * 更新平均响应时间
 */
function updateResponseTime(responseTime) {
  const totalTime = apiStats.averageResponseTime * (apiStats.successCount);
  apiStats.averageResponseTime = (totalTime + responseTime) / (apiStats.successCount + 1);
}

// ==================== 请求重试 ====================

/**
 * 带重试机制的请求执行
 */
async function performRequestWithRetry(url, method, data, header, timeout, retriesLeft, requestItem) {
  try {
    const result = await performSingleRequest(url, method, data, header, timeout);
    
    // 缓存GET请求结果
    if (method === 'GET' && requestItem.options.enableCache && result) {
      const cacheKey = requestItem.options.cacheKey || generateCacheKey(url, data);
      setCachedData(cacheKey, result);
    }
    
    return result;
    
  } catch (error) {
    // 判断是否需要重试
    const shouldRetry = retriesLeft > 0 && isRetriableError(error);
    
    if (shouldRetry) {
      apiStats.retryCount++;
      console.log(`[API] 请求重试 (${retriesLeft} 次剩余): ${url}`);
      
      // 指数退避延迟
      const delay = calculateRetryDelay(retriesLeft);
      await sleep(delay);
      
      return performRequestWithRetry(url, method, data, header, timeout, retriesLeft - 1, requestItem);
    }
    
    throw error;
  }
}

/**
 * 执行单次请求
 */
function performSingleRequest(url, method, data, header, timeout) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: method,
      data: data,
      header: header,
      timeout: timeout,
      success: (res) => {
        console.log(`[API] 请求成功 ${method} ${url}:`, res.statusCode);
        
        // 处理HTTP状态码
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          handleUnauthorized();
          const error = new Error('登录已过期，请重新登录');
          error.code = ERROR_CODES.UNAUTHORIZED;
          reject(error);
        } else if (res.statusCode === 403) {
          const error = new Error('没有权限访问该资源');
          error.code = ERROR_CODES.FORBIDDEN;
          reject(error);
        } else if (res.statusCode === 404) {
          const error = new Error('请求的资源不存在');
          error.code = ERROR_CODES.NOT_FOUND;
          reject(error);
        } else if (res.statusCode >= 500) {
          const error = new Error('服务器内部错误，请稍后重试');
          error.code = ERROR_CODES.SERVER_ERROR;
          reject(error);
        } else {
          const error = new Error(res.data.message || `请求失败: ${res.statusCode}`);
          error.code = ERROR_CODES.UNKNOWN;
          reject(error);
        }
      },
      fail: (err) => {
        console.error(`[API] 请求失败 ${method} ${url}:`, err);
        
        let error;
        // 处理网络错误
        if (err.errMsg.includes('timeout')) {
          error = new Error('请求超时，请检查网络连接');
          error.code = ERROR_CODES.TIMEOUT;
        } else if (err.errMsg.includes('fail')) {
          error = new Error('网络连接失败，请检查网络设置');
          error.code = ERROR_CODES.NETWORK_ERROR;
        } else {
          error = new Error(err.errMsg || '网络请求失败');
          error.code = ERROR_CODES.UNKNOWN;
        }
        
        reject(error);
      }
    });
  });
}

/**
 * 判断是否为可重试的错误
 */
function isRetriableError(error) {
  return error.code === ERROR_CODES.TIMEOUT || 
         error.code === ERROR_CODES.NETWORK_ERROR ||
         error.code === ERROR_CODES.SERVER_ERROR;
}

/**
 * 计算重试延迟
 */
function calculateRetryDelay(retriesLeft) {
  if (retryConfig.exponentialBackoff) {
    return retryConfig.retryDelay * Math.pow(2, retryConfig.maxRetries - retriesLeft);
  }
  return retryConfig.retryDelay;
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 便捷方法 ====================

/**
 * GET 请求 (支持缓存)
 */
function get(url, params = {}, header = {}, options = {}) {
  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const requestUrl = queryString ? `${url}?${queryString}` : url;
  const requestOptions = { enableCache: true, ...options };
  
  return request(requestUrl, 'GET', {}, header, requestOptions);
}

/**
 * POST 请求
 */
function post(url, data = {}, header = {}, options = {}) {
  return request(url, 'POST', data, header, options);
}

/**
 * PUT 请求
 */
function put(url, data = {}, header = {}, options = {}) {
  return request(url, 'PUT', data, header, options);
}

/**
 * DELETE 请求
 */
function del(url, header = {}, options = {}) {
  return request(url, 'DELETE', {}, header, options);
}

/**
 * 文件上传
 */
function upload(url, filePath, name = 'file', formData = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    const header = {};
    
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }

    const requestUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    wx.uploadFile({
      url: requestUrl,
      filePath: filePath,
      name: name,
      formData: formData,
      header: header,
      success: (res) => {
        console.log(`[API] 文件上传成功 ${url}:`, res.statusCode);
        
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(data.message || '上传失败'));
          }
        } catch (e) {
          reject(new Error('服务器返回数据格式错误'));
        }
      },
      fail: (err) => {
        console.error(`[API] 文件上传失败 ${url}:`, err);
        reject(new Error(err.errMsg || '文件上传失败'));
      }
    });
  });
}

/**
 * 文件下载
 */
function download(url) {
  return new Promise((resolve, reject) => {
    const requestUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    wx.downloadFile({
      url: requestUrl,
      success: (res) => {
        console.log(`[API] 文件下载成功 ${url}:`, res.statusCode);
        
        if (res.statusCode === 200) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error('下载失败'));
        }
      },
      fail: (err) => {
        console.error(`[API] 文件下载失败 ${url}:`, err);
        reject(new Error(err.errMsg || '文件下载失败'));
      }
    });
  });
}

// ==================== 业务API方法 ====================

/**
 * 获取市场概览
 * @returns {Promise<Object>} 市场概览数据
 */
async function getMarketOverview() {
  try {
    // 使用真实API调用
    const result = await get('/market/overview');
    return result;
  } catch (error) {
    console.error('获取市场概览失败:', error);
    throw error;
  }
}

/**
 * 获取热门股票
 * @returns {Promise<Array>} 热门股票列表
 */
async function getHotStocks() {
  try {
    // 使用真实API调用
    const result = await get('/stocks/hot');
    return result;
  } catch (error) {
    console.error('获取热门股票失败:', error);
    throw error;
  }
}

/**
 * 获取市场指数
 * @returns {Promise<Array>} 市场指数列表
 */
async function getMarketIndices() {
  try {
    // 使用真实API调用
    const result = await get('/market/indices');
    return result;
  } catch (error) {
    console.error('获取市场指数失败:', error);
    throw error;
  }
}

/**
 * 获取公告列表
 * @returns {Promise<Array>} 公告列表
 */
async function getAnnouncements() {
  try {
    // 使用真实API调用
    const result = await get('/announcements');
    return result;
  } catch (error) {
    console.error('获取公告列表失败:', error);
    throw error;
  }
}

// ==================== 工具方法 ====================

/**
 * 获取API统计信息
 */
function getApiStats() {
  return {
    ...apiStats,
    cacheSize: apiCache.size,
    queueSize: requestQueue.length,
    activeRequests: activeRequests,
    successRate: apiStats.totalRequests > 0 ? 
      (apiStats.successCount / apiStats.totalRequests * 100).toFixed(2) + '%' : '0%',
    averageResponseTime: Math.round(apiStats.averageResponseTime) + 'ms'
  };
}

/**
 * 重置API统计
 */
function resetApiStats() {
  apiStats.totalRequests = 0;
  apiStats.successCount = 0;
  apiStats.errorCount = 0;
  apiStats.averageResponseTime = 0;
  apiStats.retryCount = 0;
  console.log('[API] 统计已重置');
}

/**
 * 清理API缓存
 */
function clearApiCache(pattern) {
  if (pattern) {
    for (const [key] of apiCache.entries()) {
      if (key.includes(pattern)) {
        apiCache.delete(key);
      }
    }
    console.log(`[API] 缓存已清理（模式: ${pattern}）`);
  } else {
    apiCache.clear();
    console.log('[API] 所有缓存已清理');
  }
}

/**
 * 获取缓存统计信息
 */
function getCacheStats() {
  return {
    size: apiCache.size,
    keys: Array.from(apiCache.keys())
  };
}

/**
 * 设置基础URL
 */
function setBaseUrl(baseUrl) {
  BASE_URL = baseUrl;
  console.log(`[API] 基础URL已更新: ${BASE_URL}`);
}

/**
 * 获取基础URL
 */
function getBaseUrl() {
  return BASE_URL;
}

/**
 * 配置重试参数
 */
function configureRetry(config) {
  Object.assign(retryConfig, config);
  console.log('[API] 重试配置已更新:', retryConfig);
}

/**
 * 配置并发参数
 */
function configureConcurrency(config) {
  if (config.maxConcurrentRequests !== undefined) {
    maxConcurrentRequests = config.maxConcurrentRequests;
    console.log('[API] 并发配置已更新:', { maxConcurrentRequests });
  }
}

// ==================== 导出 ====================

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  upload,
  download,
  setBaseUrl,
  getBaseUrl,
  handleUnauthorized,
  clearAuthData,
  clearApiCache,
  getCacheStats,
  getApiStats,
  resetApiStats,
  configureRetry,
  configureConcurrency,
  ERROR_CODES,
  // 业务API方法
  getMarketOverview,
  getHotStocks,
  getMarketIndices,
  getAnnouncements
};