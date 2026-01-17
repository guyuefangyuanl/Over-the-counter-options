/**
 * API 配置中心
 * 
 * 用途：统一管理所有 API 地址，防止硬编码，便于环境切换
 * 
 * 使用方法：
 * const { getApiUrl } = require('./config/api.config.js');
 * const url = getApiUrl('/groups');
 */

// 开发环境配置
const DEV_CONFIG = {
  // 后端 API 服务地址（根据实际启动的服务调整）
  // 推荐配置：Flask 后端在 5002，Node.js 后端在 5000
  apiBaseUrl: 'http://localhost:5002/api/v1',
  
  // 云端环境（生产/测试）
  cloudApiBaseUrl: 'https://your-cloud-api.com/api/v1'
};

// 生产环境配置
const PROD_CONFIG = {
  apiBaseUrl: 'https://your-production-api.com/api/v1'
};

/**
 * 获取当前环境配置
 */
const getConfig = () => {
  // 微信小程序可以通过 __wxConfig 判断环境
  // 或者在编译时通过条件编译判断
  
  // 方法1: 通过 __wxConfig（如果存在）
  try {
    if (typeof __wxConfig !== 'undefined' && __wxConfig.envVersion) {
      // envVersion: 'develop' | 'trial' | 'release'
      if (__wxConfig.envVersion === 'release') {
        return PROD_CONFIG;
      }
    }
  } catch (e) {
    console.warn('无法获取 __wxConfig', e);
  }
  
  // 方法2: 通过 wx.getAccountInfoSync()（推荐）
  try {
    const accountInfo = wx.getAccountInfoSync();
    if (accountInfo.miniProgram.envVersion === 'release') {
      return PROD_CONFIG;
    }
  } catch (e) {
    console.warn('无法获取 accountInfo', e);
  }
  
  // 默认返回开发环境配置
  return DEV_CONFIG;
};

/**
 * 获取完整的 API 地址
 * @param {string} path - API 路径，如 '/groups'
 * @param {object} options - 可选配置
 * @param {boolean} options.useCloud - 是否使用云端地址
 * @returns {string} 完整的 API URL
 */
const getApiUrl = (path, options = {}) => {
  const config = getConfig();
  const baseUrl = options.useCloud ? config.cloudApiBaseUrl : config.apiBaseUrl;
  
  // 确保 path 以 / 开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${normalizedPath}`;
};

/**
 * 获取基础 URL
 */
const getBaseUrl = (options = {}) => {
  const config = getConfig();
  return options.useCloud ? config.cloudApiBaseUrl : config.apiBaseUrl;
};

module.exports = {
  getApiUrl,
  getBaseUrl,
  DEV_CONFIG,
  PROD_CONFIG
};
