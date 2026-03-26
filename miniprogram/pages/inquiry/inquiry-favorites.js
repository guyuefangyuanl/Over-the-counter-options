/**
 * 自选管理模块
 * 处理自选的加载、保存、添加、删除等操作
 */

const { FAVORITES_STORAGE_KEY, SYSTEM_GROUPS } = require('./inquiry-constants');
const { generateId, deepClone } = require('./inquiry-utils');

/**
 * 加载自选数据
 * @returns {Object} favoritesById
 */
function loadFavorites() {
  try {
    const stored = wx.getStorageSync(FAVORITES_STORAGE_KEY);
    if (stored && typeof stored === 'object') {
      return stored;
    }
  } catch (e) {
    console.error('加载自选数据失败:', e);
  }
  return {};
}

/**
 * 保存自选数据
 * @param {Object} favoritesById 自选数据
 */
function saveFavorites(favoritesById) {
  try {
    wx.setStorageSync(FAVORITES_STORAGE_KEY, favoritesById);
  } catch (e) {
    console.error('保存自选数据失败:', e);
  }
}

/**
 * 添加自选
 * @param {Object} product 产品信息
 * @param {string} groupId 分组ID（可选）
 * @param {Object} favoritesById 当前自选数据
 * @returns {{ success: boolean, error?: string, favoritesById?: Object }}
 */
function addFavorite(product, groupId, favoritesById) {
  const code = product.code || product.productCode;
  if (!code) {
    return { success: false, error: '产品代码无效' };
  }
  
  const updated = deepClone(favoritesById || {});
  
  // 检查是否已存在
  if (updated[code]) {
    return { success: false, error: '已在自选中' };
  }
  
  // 添加自选
  updated[code] = {
    code,
    name: product.name || product.productName,
    market: product.market || 'SH',
    groupId: groupId || null,
    addedAt: new Date().toISOString()
  };
  
  return { success: true, favoritesById: updated };
}

/**
 * 移除自选
 * @param {string} code 产品代码
 * @param {Object} favoritesById 当前自选数据
 * @returns {{ success: boolean, favoritesById?: Object }}
 */
function removeFavorite(code, favoritesById) {
  const updated = deepClone(favoritesById || {});
  
  if (!updated[code]) {
    return { success: false, error: '不在自选中' };
  }
  
  delete updated[code];
  return { success: true, favoritesById: updated };
}

/**
 * 批量移除自选
 * @param {Array} codes 产品代码列表
 * @param {Object} favoritesById 当前自选数据
 * @returns {{ success: boolean, removedCount: number, favoritesById: Object }}
 */
function removeFavorites(codes, favoritesById) {
  const updated = deepClone(favoritesById || {});
  let removedCount = 0;
  
  for (const code of codes) {
    if (updated[code]) {
      delete updated[code];
      removedCount++;
    }
  }
  
  return { success: true, removedCount, favoritesById: updated };
}

/**
 * 移动自选到其他分组
 * @param {string} code 产品代码
 * @param {string} newGroupId 新分组ID
 * @param {Object} favoritesById 当前自选数据
 * @returns {{ success: boolean, favoritesById?: Object }}
 */
function moveFavoriteToGroup(code, newGroupId, favoritesById) {
  const updated = deepClone(favoritesById || {});
  
  if (!updated[code]) {
    return { success: false, error: '不在自选中' };
  }
  
  updated[code].groupId = newGroupId === 'all' ? null : newGroupId;
  updated[code].updatedAt = new Date().toISOString();
  
  return { success: true, favoritesById: updated };
}

/**
 * 批量移动自选到其他分组
 * @param {Array} codes 产品代码列表
 * @param {string} newGroupId 新分组ID
 * @param {Object} favoritesById 当前自选数据
 * @returns {{ success: boolean, movedCount: number, favoritesById: Object }}
 */
function moveFavoritesToGroup(codes, newGroupId, favoritesById) {
  const updated = deepClone(favoritesById || {});
  let movedCount = 0;
  
  for (const code of codes) {
    if (updated[code]) {
      updated[code].groupId = newGroupId === 'all' ? null : newGroupId;
      updated[code].updatedAt = new Date().toISOString();
      movedCount++;
    }
  }
  
  return { success: true, movedCount, favoritesById: updated };
}

/**
 * 检查是否为自选
 * @param {string} code 产品代码
 * @param {Object} favoritesById 自选数据
 * @returns {boolean}
 */
function isFavorite(code, favoritesById) {
  return !!(favoritesById && favoritesById[code]);
}

/**
 * 获取分组内的自选列表
 * @param {string} groupId 分组ID ('all' 表示全部)
 * @param {Object} favoritesById 自选数据
 * @returns {Array}
 */
function getFavoritesByGroup(groupId, favoritesById) {
  const list = [];
  
  for (const code in favoritesById) {
    const fav = favoritesById[code];
    if (groupId === 'all' || fav.groupId === groupId) {
      list.push(fav);
    }
  }
  
  // 按添加时间倒序
  list.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  
  return list;
}

/**
 * 过滤自选列表
 * @param {string} keyword 关键词
 * @param {Object} favoritesById 自选数据
 * @returns {Array}
 */
function filterFavorites(keyword, favoritesById) {
  if (!keyword || !keyword.trim()) {
    return Object.values(favoritesById || {});
  }
  
  const kw = keyword.trim().toLowerCase();
  const list = [];
  
  for (const code in favoritesById) {
    const fav = favoritesById[code];
    const name = (fav.name || '').toLowerCase();
    const codeLower = (fav.code || '').toLowerCase();
    
    if (name.includes(kw) || codeLower.includes(kw)) {
      list.push(fav);
    }
  }
  
  return list;
}

module.exports = {
  loadFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  removeFavorites,
  moveFavoriteToGroup,
  moveFavoritesToGroup,
  isFavorite,
  getFavoritesByGroup,
  filterFavorites
};