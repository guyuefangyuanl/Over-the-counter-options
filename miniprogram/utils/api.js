// API 工具类
const { getBaseUrl: getConfigBaseUrl } = require('../config/api.config.js');
let BASE_URL = getConfigBaseUrl();
const performanceOptimizer = require('./performance-optimizer.js').getInstance();

// API响应缓存
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 请求队列和并发控制
const requestQueue = [];
const maxConcurrentRequests = 6; // 最大并发请求数
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

// 环境配置
const ENV = 'development'; // 可以从配置文件读取

// API基础URL配置
const API_CONFIG = {
  development: {
    nodeBase: getConfigBaseUrl(), // 使用配置中心的地址
    flaskBase: getConfigBaseUrl() // 使用配置中心的地址
  },
  production: {
    nodeBase: 'https://api.yourdomain.com/api/v1',
    flaskBase: 'https://flask.yourdomain.com/api/v1'
  }
};

const NODE_BASE_URL = API_CONFIG[ENV].nodeBase;
const FLASK_BASE_URL = API_CONFIG[ENV].flaskBase;

/**
 * HTTP 请求工具（增强版）
 * @param {string} url 请求路径
 * @param {string} method 请求方法
 * @param {object} data 请求数据
 * @param {object} header 请求头
 * @param {object} options 额外选项 (cache, timeout等)
 * @returns {Promise}
 */
function request(url, method = 'GET', data = {}, header = {}, options = {}) {
  // 处理统一请求方法的兼容性
  if (arguments.length === 1 && typeof url === 'string' && !method) {
    // 这是旧的request(url, options)调用方式
    const options = arguments[1] || {};
    return new Promise((resolve, reject) => {
      const defaultOptions = {
        timeout: 10000,
        header: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        ...options
      };

      // 显示加载提示
      if (!options.silent) {
        wx.showLoading({
          title: '加载中...',
          mask: true
        });
      }

      wx.request({
        url,
        ...defaultOptions,
        success: (res) => {
          wx.hideLoading();

          // 统一响应格式处理
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // 检查业务状态码
            if (res.data && res.data.success !== undefined) {
              if (res.data.success) {
                resolve(res.data.data); // 返回data字段
              } else {
                // 业务错误
                reject(new Error(res.data.message || '请求失败'));
                wx.showToast({
                  title: res.data.message || '请求失败',
                  icon: 'none',
                  duration: 2000
                });
              }
            } else {
              // 兼容无包装的响应
              resolve(res.data);
            }
          } else {
            // HTTP错误
            reject(new Error(`HTTP ${res.statusCode}: ${res.errMsg}`));
            wx.showToast({
              title: `请求失败(${res.statusCode})`,
              icon: 'none',
              duration: 2000
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          reject(new Error('网络请求失败'));
          wx.showToast({
            title: '网络请求失败',
            icon: 'none',
            duration: 2000
          });
        }
      });
    });
  }

  // 这是新的增强版请求方式
  const { 
    enableCache = false, 
    cacheKey, 
    // 🔧 修复：增加默认超时时间到 15秒，避免云托管冷启动时超时
    timeout = 15000,
    retries = retryConfig.maxRetries,
    priority = 'normal', // normal, high, low
    dedupe = false, // 是否去重
    interceptors = {}, // 请求拦截器
    silent = false, // 是否显示加载提示
    suppressErrorLog = false, // 关闭错误日志
    suppressRetryLog = false // 关闭重试日志
  } = options;
  
  // 请求去重
  if (dedupe) {
    const dedupeKey = `${method}_${url}_${JSON.stringify(data)}`;
    const existingRequest = requestQueue.find(req => req.key === dedupeKey && !req.completed);
    
    if (existingRequest) {
      console.log(`请求去重: ${dedupeKey}`);
      return existingRequest.promise;
    }
  }
  
  // 检查缓存 (仅GET请求)
  if (method === 'GET' && enableCache) {
    const finalCacheKey = cacheKey || `${url}_${JSON.stringify(data)}`;
    if (apiCache.has(finalCacheKey)) {
      const cached = apiCache.get(finalCacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`API缓存命中: ${url}`);
        apiStats.successCount++;
        return Promise.resolve(cached.data);
      } else {
        apiCache.delete(finalCacheKey);
      }
    }
  }
  
  // 创建请求Promise
  const requestPromise = processRequestWithQueue(url, method, data, header, {
    enableCache, cacheKey, timeout, retries, priority, interceptors, silent, suppressErrorLog, suppressRetryLog
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
    
    // 请求完成后标记为完成
    requestPromise.finally(() => {
      queueItem.completed = true;
    });
  }
  
  return requestPromise;
}

/**
 * 跳转到登录页
 */
function redirectToLogin() {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  
  // 🔧 修复：如果当前已经是登录页，就不再跳转
  if (currentPage && currentPage.route.includes('pages/login/login')) {
    console.log('当前已在登录页，不重复跳转');
    return;
  }

  // 🔧 修复：使用 redirectTo 而不是 navigateTo，避免页面栈过深
  wx.redirectTo({
    url: '/pages/login/login',
    fail: (err) => {
      console.error('跳转登录页失败:', err);
      // 如果 redirectTo 失败（可能是因为在 tabbar 页面），尝试 reLaunch
      wx.reLaunch({
        url: '/pages/login/login',
        fail: (err2) => {
          console.error('reLaunch也失败:', err2);
          wx.showToast({
            title: '请手动返回登录页',
            icon: 'none'
          });
        }
      });
    }
  });
}

/**
 * 处理未授权响应
 */
function handleUnauthorized() {
  // 尝试使用refreshToken刷新token
  const refreshToken = wx.getStorageSync('refreshToken');
  
  if (refreshToken) {
    // 刷新token
    request('/auth/refresh-token', 'POST', { refreshToken })
      .then(result => {
        console.log('Token刷新成功');
        wx.setStorageSync('token', result.token);
      })
      .catch(error => {
        console.error('Token刷新失败:', error);
        clearAuthData();
        redirectToLogin();
      });
  } else {
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
}

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
  
  // 按优先级排序
  requestQueue.sort((a, b) => {
    const priorityMap = { high: 3, normal: 2, low: 1 };
    return (priorityMap[b.options.priority] || 2) - (priorityMap[a.options.priority] || 2);
  });
  
  // 处理下一个请求
  const nextRequest = requestQueue.shift();
  if (nextRequest) {
    activeRequests++;
    executeRequest(nextRequest)
      .then(result => {
        activeRequests--;
        nextRequest.resolve(result);
        processQueue(); // 处理下一个请求
      })
      .catch(error => {
        activeRequests--;
        nextRequest.reject(error);
        processQueue(); // 处理下一个请求
      });
  }
}

/**
 * 执行请求
 */
async function executeRequest(requestItem) {
  const { url, method, data, header, options } = requestItem;
  const { timeout, retries, interceptors, silent } = options;
  
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
    const result = await performRequestWithRetry(requestUrl, method, data, defaultHeader, timeout, retries, requestItem);
    
    // 记录响应时间
    const responseTime = Date.now() - startTime;
    apiStats.averageResponseTime = (apiStats.averageResponseTime * (apiStats.successCount) + responseTime) / (apiStats.successCount + 1);
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
 * 带重试机制的请求执行
 */
async function performRequestWithRetry(url, method, data, header, timeout, retriesLeft, requestItem) {
  try {
    const result = await new Promise((resolve, reject) => {
      // 显示加载提示（除非设置了silent）
      if (!requestItem.options.silent) {
        wx.showLoading({
          title: '加载中...',
          mask: true
        });
      }

      wx.request({
        url: url,
        method: method,
        data: data,
        header: header,
        timeout: timeout,
        success: (res) => {
          // 隐藏加载提示
          if (!requestItem.options.silent) {
            wx.hideLoading();
          }

          if (!requestItem.options.suppressRetryLog) {
            console.log(`API请求成功 ${method} ${url}:`, res.data);
          }
          
          // 🔧 修复：处理HTTP状态码和响应体中的code字段
          if (res.statusCode === 200 || res.statusCode === 201) {
            // 检查响应体中的code字段（后端可能返回HTTP 200但body中code为401）
            if (res.data && (res.data.code === 401 || res.data.code === '401')) {
              console.warn('[API] 响应体中code=401，视为未授权');
              handleUnauthorized();
              const authError = new Error(res.data.message || '登录已过期，请重新登录');
              authError.noRetry = true;
              reject(authError);
              return;
            }
            
            resolve(res.data);
          } else if (res.statusCode === 401) {
            // token失效，跳转登录，标记为不可重试
            handleUnauthorized();
            const authError = new Error('登录已过期，请重新登录');
            authError.noRetry = true;
            reject(authError);
          } else if (res.statusCode === 403) {
            // 检查是否是业务层返回的403（HTTP 200但code=403）
            console.warn('[API] 403 Forbidden:', res.data);
            const forbiddenError = new Error(res.data?.message || '没有权限访问该资源');
            forbiddenError.noRetry = true;
            forbiddenError.details = res.data;
            reject(forbiddenError);
          } else if (res.statusCode === 404) {
            reject(new Error('请求的资源不存在'));
          } else if (res.statusCode >= 500) {
            reject(new Error('服务器内部错误，请稍后重试'));
          } else {
            reject(new Error(res.data.message || `请求失败: ${res.statusCode}`));
          }
        },
        fail: (err) => {
          // 隐藏加载提示
          if (!requestItem.options.silent) {
            wx.hideLoading();
          }

          if (!requestItem.options.suppressErrorLog) {
            console.error(`API请求失败 ${method} ${url}:`, err);
          }
          
          // 处理网络错误
          if (err.errMsg.includes('timeout')) {
            reject(new Error('请求超时，请检查网络连接'));
          } else if (err.errMsg.includes('fail')) {
            reject(new Error('网络连接失败，请检查网络设置'));
          } else {
            reject(new Error(err.errMsg || '网络请求失败'));
          }
        }
      });
    });
    
    // 缓存GET请求结果
    if (method === 'GET' && requestItem.options.enableCache && result) {
      const cacheKey = requestItem.options.cacheKey || `${url}_${JSON.stringify(data)}`;
      apiCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
    }
    
    return result;
  } catch (error) {
    // 认证错误等不可重试的错误，直接抛出
    if (error.noRetry) {
      throw error;
    }

    // 重试逻辑
    if (retriesLeft > 0) {
      apiStats.retryCount++;
      if (!requestItem.options.suppressRetryLog) {
        console.log(`请求重试 (${retriesLeft} 次剩余): ${url}`);
      }
      
      // 指数退避延迟
      const delay = retryConfig.exponentialBackoff ? 
        retryConfig.retryDelay * Math.pow(2, retryConfig.maxRetries - retriesLeft) : 
        retryConfig.retryDelay;
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return performRequestWithRetry(url, method, data, header, timeout, retriesLeft - 1, requestItem);
    }
    
    throw error;
  }
}

/**
 * GET 请求 (支持缓存)
 * @param {string} url 请求路径
 * @param {object} params 查询参数
 * @param {object} header 请求头
 * @param {object} options 选项 (enableCache, cacheKey等)
 * @returns {Promise}
 */
function get(url, params = {}, header = {}, options = {}) {
  // 将参数添加到URL
  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  
  const requestUrl = queryString ? `${url}?${queryString}` : url;
  
  // 默认启用GET请求缓存
  const requestOptions = { enableCache: true, ...options };
  
  return request(requestUrl, 'GET', {}, header, requestOptions);
}

/**
 * POST 请求
 * @param {string} url 请求路径
 * @param {object} data 请求数据
 * @param {object} header 请求头
 * @returns {Promise}
 */
function post(url, data = {}, header = {}) {
  return request(url, 'POST', data, header);
}

/**
 * PUT 请求
 * @param {string} url 请求路径
 * @param {object} data 请求数据
 * @param {object} header 请求头
 * @returns {Promise}
 */
function put(url, data = {}, header = {}) {
  return request(url, 'PUT', data, header);
}

/**
 * DELETE 请求
 * @param {string} url 请求路径
 * @param {object} header 请求头
 * @returns {Promise}
 */
function del(url, header = {}) {
  return request(url, 'DELETE', {}, header);
}

/**
 * 文件上传
 * @param {string} url 上传地址
 * @param {string} filePath 文件路径
 * @param {string} name 文件对应的 key
 * @param {object} formData 其他表单数据
 * @returns {Promise}
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
        console.log(`文件上传成功 ${url}:`, res);
        
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
        console.error(`文件上传失败 ${url}:`, err);
        reject(new Error(err.errMsg || '文件上传失败'));
      }
    });
  });
}

/**
 * 文件下载
 * @param {string} url 下载地址
 * @returns {Promise}
 */
function download(url) {
  return new Promise((resolve, reject) => {
    const requestUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    wx.downloadFile({
      url: requestUrl,
      success: (res) => {
        console.log(`文件下载成功 ${url}:`, res);
        
        if (res.statusCode === 200) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error('下载失败'));
        }
      },
      fail: (err) => {
        console.error(`文件下载失败 ${url}:`, err);
        reject(new Error(err.errMsg || '文件下载失败'));
      }
    });
  });
}

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
  console.log('API统计已重置');
}

/**
 * 清理API缓存
 * @param {string} pattern 缓存key模式（可选）
 */
function clearApiCache(pattern) {
  if (pattern) {
    // 清理匹配模式的缓存
    for (const [key] of apiCache.entries()) {
      if (key.includes(pattern)) {
        apiCache.delete(key);
      }
    }
  } else {
    // 清理所有缓存
    apiCache.clear();
  }
  console.log('API缓存已清理');
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
 * @param {string} baseUrl 基础URL
 */
function setBaseUrl(baseUrl) {
  BASE_URL = baseUrl;
}

/**
 * 获取当前基础URL
 * @returns {string} 基础URL
 */
function getCurrentBaseUrl() {
  return BASE_URL;
}

/**
 * 配置重试参数
 * @param {object} config 重试配置
 */
function configureRetry(config) {
  Object.assign(retryConfig, config);
  console.log('重试配置已更新:', retryConfig);
}

/**
 * 配置并发参数
 * @param {object} config 并发配置
 */
function configureConcurrency(config) {
  if (config.maxConcurrentRequests !== undefined) {
    maxConcurrentRequests = config.maxConcurrentRequests;
  }
  console.log('并发配置已更新:', { maxConcurrentRequests });
}

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  upload,
  download,
  BASE_URL: NODE_BASE_URL,
  FLASK_BASE_URL,
  getApiStats,
  resetApiStats,
  clearApiCache,
  getCacheStats,
  setBaseUrl,
  getBaseUrl: getCurrentBaseUrl,
  configureRetry,
  configureConcurrency
};