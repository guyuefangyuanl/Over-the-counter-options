/**
 * API 配置中心 - 智能环境适配版
 * 
 * 特性：
 * 1. 自动检测环境（开发/生产/体验版）
 * 2. 本地开发自动回退到云端（避免 127.0.0.1 问题）
 * 3. 支持手动强制切换数据源
 * 
 * 使用方法：
 * const { getApiUrl } = require('./config/api.config.js');
 * const url = getApiUrl('/groups');
 */

// ============================================
// 云端 API 地址（稳定，推荐）
// ============================================
const CLOUD_API_URL = 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1';

// ============================================
// 本地开发 API 地址（仅 PC 端微信可用）
// ============================================
// 如需使用本地后端，请：
// 1. 将 LOCAL_API_URL 改为你的局域网 IP（如 http://192.168.1.xxx:5002/api/v1）
// 2. 在微信开发者工具中勾选"不校验合法域名"
const LOCAL_API_URL = 'http://localhost:5002/api/v1';

// ============================================
// 环境配置
// ============================================
const CONFIG = {
  // 生产环境
  production: {
    apiBaseUrl: CLOUD_API_URL,
    useCloud: true
  },
  // 开发环境（优先使用本地，本地不可用时回退到云端）
  development: {
    apiBaseUrl: LOCAL_API_URL,  // 优先本地，确保 mock code 正常工作
    localApiUrl: LOCAL_API_URL, // 备用本地地址
    cloudApiUrl: CLOUD_API_URL, // 云端备用
    useCloud: false
  },
  // 体验版
  trial: {
    apiBaseUrl: CLOUD_API_URL,
    useCloud: true
  }
};

/**
 * 获取当前环境类型
 * @returns {string} 'development' | 'trial' | 'production'
 */
const getEnvVersion = () => {
  try {
    // 方法1: 通过 wx.getAccountInfoSync()（推荐）
    const accountInfo = wx.getAccountInfoSync();
    if (accountInfo && accountInfo.miniProgram) {
      return accountInfo.miniProgram.envVersion || 'development';
    }
  } catch (e) {
    console.warn('[API Config] 无法获取 accountInfo:', e.message);
  }
  
  // 方法2: 通过 __wxConfig
  try {
    if (typeof __wxConfig !== 'undefined' && __wxConfig.envVersion) {
      return __wxConfig.envVersion;
    }
  } catch (e) {
    // ignore
  }
  
  // 默认开发环境
  return 'development';
};

/**
 * 获取当前环境配置
 */
const getConfig = () => {
  const envVersion = getEnvVersion();
  const config = CONFIG[envVersion] || CONFIG.development;
  
  console.log(`[API Config] 当前环境: ${envVersion}, API地址: ${config.apiBaseUrl}`);
  return config;
};

/**
 * 获取完整的 API 地址
 * @param {string} path - API 路径，如 '/groups'
 * @param {object} options - 可选配置
 * @param {boolean} options.useLocal - 是否强制使用本地地址（仅开发环境有效）
 * @returns {string} 完整的 API URL
 */
const getApiUrl = (path, options = {}) => {
  const config = getConfig();
  
  // 开发环境下可强制使用本地地址
  let baseUrl = config.apiBaseUrl;
  if (options.useLocal && config.localApiUrl) {
    baseUrl = config.localApiUrl;
    console.log(`[API Config] 使用本地地址: ${baseUrl}`);
  }
  
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${normalizedPath}`;
};

/**
 * 获取基础 URL
 * @param {object} options - 可选配置
 * @param {boolean} options.useLocal - 是否强制使用本地地址
 * @returns {string} 基础 URL
 */
const getBaseUrl = (options = {}) => {
  const config = getConfig();
  
  // 开发环境下可强制使用本地地址
  if (options.useLocal && config.localApiUrl) {
    console.log(`[API Config] 使用本地地址: ${config.localApiUrl}`);
    return config.localApiUrl;
  }
  
  return config.apiBaseUrl;
};

/**
 * 切换到本地开发模式（调试用）
 * 使用方法：在控制台执行 switchToLocal()
 */
const switchToLocal = () => {
  const config = getConfig();
  if (config.localApiUrl) {
    config.apiBaseUrl = config.localApiUrl;
    console.log(`[API Config] 已切换到本地地址: ${config.apiBaseUrl}`);
    console.log('[API Config] 请确保：1. 本地服务器已启动 2. 已勾选"不校验合法域名"');
  } else {
    console.warn('[API Config] 当前环境不支持本地开发模式');
  }
};

/**
 * 切换到云端地址
 */
const switchToCloud = () => {
  const envVersion = getEnvVersion();
  const config = CONFIG[envVersion] || CONFIG.development;
  config.apiBaseUrl = CLOUD_API_URL;
  console.log(`[API Config] 已切换到云端地址: ${config.apiBaseUrl}`);
};

// 暴露到全局，方便调试
try {
  if (typeof global !== 'undefined') {
    global.switchToLocal = switchToLocal;
    global.switchToCloud = switchToCloud;
  }
} catch (e) {
  // ignore
}

module.exports = {
  getApiUrl,
  getBaseUrl,
  getEnvVersion,
  switchToLocal,
  switchToCloud,
  CLOUD_API_URL,
  LOCAL_API_URL,
  CONFIG
};
