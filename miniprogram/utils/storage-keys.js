/**
 * 存储 Key 常量定义
 * 统一管理本地存储的 key，避免不同页面使用不同 key 导致数据不一致
 */

// 自选股票存储 Key（统一使用此 key）
const FAVORITES_STORAGE_KEY = 'INQUIRY_FAVORITES_V1';

// 自定义分组存储 Key
const CUSTOM_GROUPS_STORAGE_KEY = 'INQUIRY_CUSTOM_GROUPS_V1';

// 用户信息存储 Key
const USER_INFO_STORAGE_KEY = 'userInfo';

// Token 存储 Key
const TOKEN_STORAGE_KEY = 'token';

module.exports = {
  FAVORITES_STORAGE_KEY,
  CUSTOM_GROUPS_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
  TOKEN_STORAGE_KEY
};