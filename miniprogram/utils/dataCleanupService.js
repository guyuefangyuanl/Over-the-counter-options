/**
 * 数据清理服务模块
 * 用于清理本地存储中的示例数据和测试数据
 * 
 * 使用场景：
 * 1. 用户首次登录真实账户时清理默认示例数据
 * 2. 手动触发数据清理
 * 3. 系统检测到测试数据时自动清理
 */

const { FAVORITES_STORAGE_KEY, CUSTOM_GROUPS_STORAGE_KEY, USER_INFO_STORAGE_KEY, TOKEN_STORAGE_KEY } = require('./storage-keys.js');

// 默认示例数据特征（用于识别需要清理的数据）
const DEFAULT_DATA_SIGNATURES = {
  // 默认自选股票代码
  stockCodes: ['300750', '300059', '000001', '603259', '600171'],
  // 默认股票名称
  stockNames: ['宁德时代', '东方财富', '平安银行', '药明康德', '上海贝岭'],
  // 测试用户特征
  testUserPatterns: ['test', 'demo', '测试', '示例', 'tmp_', 'temp_']
};

/**
 * 检测是否为测试用户
 * @param {Object} userInfo 用户信息
 * @returns {boolean}
 */
function isTestUser(userInfo) {
  if (!userInfo) return false;
  
  // 检查 openid
  if (userInfo.openid) {
    const openid = userInfo.openid.toLowerCase();
    if (DEFAULT_DATA_SIGNATURES.testUserPatterns.some(p => openid.startsWith(p))) {
      return true;
    }
  }
  
  // 检查昵称
  if (userInfo.nickname || userInfo.nickName) {
    const name = (userInfo.nickname || userInfo.nickName).toLowerCase();
    if (DEFAULT_DATA_SIGNATURES.testUserPatterns.some(p => name.includes(p))) {
      return true;
    }
  }
  
  // 检查明确标记
  if (userInfo.isTest === true) {
    return true;
  }
  
  return false;
}

/**
 * 检测自选数据是否为默认示例数据
 * @param {Array} favorites 自选列表
 * @returns {Object} { isDefault: boolean, matchCount: number, total: number }
 */
function detectDefaultFavorites(favorites) {
  if (!Array.isArray(favorites) || favorites.length === 0) {
    return { isDefault: false, matchCount: 0, total: 0 };
  }
  
  let matchCount = 0;
  
  favorites.forEach(item => {
    const code = (item.code || '').split('.')[0]; // 去掉市场后缀
    if (DEFAULT_DATA_SIGNATURES.stockCodes.includes(code)) {
      matchCount++;
    }
    if (DEFAULT_DATA_SIGNATURES.stockNames.includes(item.name)) {
      matchCount++;
    }
  });
  
  // 如果超过 80% 匹配默认数据特征，认为是示例数据
  const isDefault = favorites.length > 0 && (matchCount / favorites.length) >= 0.8;
  
  return { isDefault, matchCount, total: favorites.length };
}

/**
 * 清理本地示例数据
 * @param {Object} options 清理选项
 * @param {boolean} options.clearFavorites 是否清理自选
 * @param {boolean} options.clearGroups 是否清理分组
 * @param {boolean} options.force 是否强制清理（不检测）
 * @returns {Object} 清理结果
 */
function cleanupLocalData(options = {}) {
  const {
    clearFavorites = true,
    clearGroups = true,
    force = false
  } = options;
  
  const result = {
    favoritesCleared: false,
    groupsCleared: false,
    favoritesBefore: 0,
    groupsBefore: 0,
    wasDefaultData: false
  };
  
  try {
    // 检查并清理自选数据
    if (clearFavorites) {
      const favorites = wx.getStorageSync(FAVORITES_STORAGE_KEY);
      if (favorites) {
        const detection = detectDefaultFavorites(
          Array.isArray(favorites) ? favorites : Object.keys(favorites).map(k => ({ code: k, ...favorites[k] }))
        );
        
        result.favoritesBefore = detection.total;
        result.wasDefaultData = detection.isDefault;
        
        if (force || detection.isDefault) {
          wx.removeStorageSync(FAVORITES_STORAGE_KEY);
          // 同时清理旧版 key
          wx.removeStorageSync('favorites');
          result.favoritesCleared = true;
          console.log('[数据清理] 已清理示例自选数据，共', detection.total, '条');
        }
      }
    }
    
    // 检查并清理分组数据
    if (clearGroups) {
      const groups = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY);
      if (groups) {
        const groupCount = Array.isArray(groups) ? groups.length : Object.keys(groups).length;
        result.groupsBefore = groupCount;
        
        // 如果自选被清理，分组也应该清理
        if (force || result.favoritesCleared) {
          wx.removeStorageSync(CUSTOM_GROUPS_STORAGE_KEY);
          result.groupsCleared = true;
          console.log('[数据清理] 已清理分组数据，共', groupCount, '条');
        }
      }
    }
    
    return {
      success: true,
      ...result
    };
    
  } catch (err) {
    console.error('[数据清理] 清理失败:', err);
    return {
      success: false,
      error: err.message,
      ...result
    };
  }
}

/**
 * 用户登录后清理示例数据（自动检测）
 * 应在用户登录成功后调用
 * @param {Object} userInfo 登录用户信息
 * @returns {Object} 清理结果
 */
function cleanupOnLogin(userInfo) {
  // 如果是测试用户，不清理
  if (isTestUser(userInfo)) {
    console.log('[数据清理] 检测到测试用户，跳过清理');
    return { success: true, skipped: true, reason: 'test_user' };
  }
  
  // 检查是否已有真实数据
  const favorites = wx.getStorageSync(FAVORITES_STORAGE_KEY);
  const detection = detectDefaultFavorites(
    Array.isArray(favorites) ? favorites : (favorites ? Object.keys(favorites).map(k => ({ code: k, ...favorites[k] })) : [])
  );
  
  // 如果是示例数据，清理
  if (detection.isDefault) {
    console.log('[数据清理] 检测到示例数据，执行清理');
    return cleanupLocalData({ clearFavorites: true, clearGroups: true, force: false });
  }
  
  return { success: true, skipped: true, reason: 'real_data' };
}

/**
 * 获取数据清理统计信息
 * @returns {Object} 统计信息
 */
function getCleanupStats() {
  const stats = {
    favorites: { count: 0, isDefault: false },
    groups: { count: 0 },
    userInfo: { exists: false, isTest: false },
    token: { exists: false }
  };
  
  try {
    // 自选统计
    const favorites = wx.getStorageSync(FAVORITES_STORAGE_KEY);
    if (favorites) {
      const arr = Array.isArray(favorites) ? favorites : Object.keys(favorites).map(k => ({ code: k, ...favorites[k] }));
      stats.favorites.count = arr.length;
      stats.favorites.isDefault = detectDefaultFavorites(arr).isDefault;
    }
    
    // 分组统计
    const groups = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY);
    if (groups) {
      stats.groups.count = Array.isArray(groups) ? groups.length : Object.keys(groups).length;
    }
    
    // 用户信息统计
    const userInfo = wx.getStorageSync(USER_INFO_STORAGE_KEY);
    if (userInfo) {
      stats.userInfo.exists = true;
      stats.userInfo.isTest = isTestUser(userInfo);
    }
    
    // Token 统计
    stats.token.exists = !!wx.getStorageSync(TOKEN_STORAGE_KEY);
    
  } catch (err) {
    console.error('[数据清理] 获取统计信息失败:', err);
  }
  
  return stats;
}

module.exports = {
  isTestUser,
  detectDefaultFavorites,
  cleanupLocalData,
  cleanupOnLogin,
  getCleanupStats,
  DEFAULT_DATA_SIGNATURES
};