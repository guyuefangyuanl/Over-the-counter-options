/**
 * 自选服务模块
 * 统一管理自选数据的读写，解决不同页面数据结构不一致的问题
 * 
 * v2.0 新增功能：
 * - 并发写入保护（锁机制）
 * - 回收站功能（删除数据可恢复）
 * - 存储空间检测
 * - 操作日志记录
 * 
 * v2.1 新增功能：
 * - 云端同步机制
 * - 离线支持
 */

const { FAVORITES_STORAGE_KEY, CUSTOM_GROUPS_STORAGE_KEY } = require('./storage-keys.js');

// ========== 云端同步状态 ==========
let _syncPending = false;
let _lastSyncTime = 0;
const SYNC_INTERVAL = 60000; // 同步间隔60秒

// ========== 常量定义 ==========

// 回收站存储 Key
const RECYCLE_BIN_KEY = 'INQUIRY_FAVORITES_RECYCLE_BIN_V1';
// 操作日志 Key
const OPERATION_LOG_KEY = 'INQUIRY_FAVORITES_LOG_V1';
// 回收站保留时间（7天）
const RECYCLE_BIN_RETAIN_DAYS = 7;
// 最大回收站条目数
const MAX_RECYCLE_BIN_ITEMS = 50;
// 最大日志条目数
const MAX_LOG_ITEMS = 100;

// ========== 并发锁机制 ==========

let _writeLock = false;
let _writeQueue = [];

/**
 * 获取写入锁
 * @returns {Promise<void>}
 */
function acquireLock() {
  return new Promise((resolve) => {
    if (!_writeLock) {
      _writeLock = true;
      resolve();
    } else {
      _writeQueue.push(resolve);
    }
  });
}

/**
 * 释放写入锁
 */
function releaseLock() {
  _writeLock = false;
  const next = _writeQueue.shift();
  if (next) {
    _writeLock = true;
    next();
  }
}

/**
 * 使用锁执行操作
 * @param {Function} operation 要执行的操作
 * @returns {any} 操作结果
 */
async function withLock(operation) {
  await acquireLock();
  try {
    return operation();
  } finally {
    releaseLock();
  }
}

// ========== 回收站功能 ==========

/**
 * 获取回收站数据
 * @returns {Array} 回收站数据
 */
function getRecycleBin() {
  try {
    const data = wx.getStorageSync(RECYCLE_BIN_KEY);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('getRecycleBin failed', e);
    return [];
  }
}

/**
 * 添加到回收站
 * @param {Object|Array} items 要删除的项目
 */
function addToRecycleBin(items) {
  try {
    const recycleBin = getRecycleBin();
    const itemsArray = Array.isArray(items) ? items : [items];
    const now = Date.now();
    
    // 为每个项目添加删除时间和过期时间
    const recycledItems = itemsArray.map(item => ({
      ...item,
      deletedAt: now,
      expiresAt: now + RECYCLE_BIN_RETAIN_DAYS * 24 * 60 * 60 * 1000
    }));
    
    recycleBin.unshift(...recycledItems);
    
    // 清理过期数据和超出上限的数据
    const validItems = recycleBin
      .filter(item => item.expiresAt > now)
      .slice(0, MAX_RECYCLE_BIN_ITEMS);
    
    wx.setStorageSync(RECYCLE_BIN_KEY, validItems);
    console.log('[回收站] 已添加', itemsArray.length, '条数据');
  } catch (e) {
    console.error('addToRecycleBin failed', e);
  }
}

/**
 * 从回收站恢复
 * @param {string} code 股票代码（可选，不传则恢复所有）
 * @returns {Array} 恢复的项目
 */
function recoverFromRecycleBin(code) {
  try {
    const recycleBin = getRecycleBin();
    let recoveredItems = [];
    
    if (code) {
      // 恢复指定项目
      const normalizedCode = normalizeCode(code);
      const index = recycleBin.findIndex(item => normalizeCode(item.code) === normalizedCode);
      
      if (index > -1) {
        recoveredItems = [recycleBin.splice(index, 1)[0]];
      }
    } else {
      // 恢复所有未过期项目
      const now = Date.now();
      recoveredItems = recycleBin.filter(item => item.expiresAt > now);
      recycleBin.length = 0; // 清空回收站
    }
    
    // 更新回收站
    wx.setStorageSync(RECYCLE_BIN_KEY, recycleBin);
    
    // 将恢复的项目添加回自选列表
    const favorites = getFavorites();
    recoveredItems.forEach(item => {
      const normalizedCode = normalizeCode(item.code);
      if (!favorites.some(f => normalizeCode(f.code) === normalizedCode)) {
        const { deletedAt, expiresAt, ...originalItem } = item;
        favorites.push({
          ...originalItem,
          recoveredAt: Date.now()
        });
      }
    });
    saveFavorites(favorites);
    
    console.log('[回收站] 已恢复', recoveredItems.length, '条数据');
    return recoveredItems;
  } catch (e) {
    console.error('recoverFromRecycleBin failed', e);
    return [];
  }
}

/**
 * 清空回收站
 */
function clearRecycleBin() {
  try {
    wx.removeStorageSync(RECYCLE_BIN_KEY);
    console.log('[回收站] 已清空');
  } catch (e) {
    console.error('clearRecycleBin failed', e);
  }
}

/**
 * 清理回收站过期数据
 */
function cleanExpiredRecycleBin() {
  try {
    const recycleBin = getRecycleBin();
    const now = Date.now();
    const validItems = recycleBin.filter(item => item.expiresAt > now);
    
    if (validItems.length !== recycleBin.length) {
      wx.setStorageSync(RECYCLE_BIN_KEY, validItems);
      console.log('[回收站] 已清理', recycleBin.length - validItems.length, '条过期数据');
    }
  } catch (e) {
    console.error('cleanExpiredRecycleBin failed', e);
  }
}

// ========== 操作日志 ==========

/**
 * 记录操作日志
 * @param {string} action 操作类型
 * @param {Object} data 操作数据
 */
function logOperation(action, data) {
  try {
    const logs = wx.getStorageSync(OPERATION_LOG_KEY) || [];
    logs.unshift({
      action,
      data,
      timestamp: Date.now()
    });
    
    // 限制日志数量
    if (logs.length > MAX_LOG_ITEMS) {
      logs.length = MAX_LOG_ITEMS;
    }
    
    wx.setStorageSync(OPERATION_LOG_KEY, logs);
  } catch (e) {
    console.error('logOperation failed', e);
  }
}

// ========== 存储空间检测 ==========

/**
 * 检查存储空间
 * @returns {Object} { available: boolean, message: string }
 */
function checkStorageSpace() {
  try {
    const info = wx.getStorageInfoSync();
    const usedMB = (info.currentSize / 1024).toFixed(2);
    const limitMB = (info.limitSize / 1024).toFixed(2);
    const usedPercent = (info.currentSize / info.limitSize * 100).toFixed(1);
    
    if (usedPercent > 90) {
      return {
        available: false,
        message: `存储空间不足（已用 ${usedPercent}%），请清理后重试`,
        usedMB,
        limitMB
      };
    }
    
    return {
      available: true,
      message: `存储空间充足（已用 ${usedPercent}%）`,
      usedMB,
      limitMB
    };
  } catch (e) {
    console.error('checkStorageSpace failed', e);
    return { available: true, message: '无法检测存储空间' };
  }
}

// ========== 核心功能 ==========

/**
 * 获取自选列表（统一返回数组格式）
 * @returns {Array} 自选股票数组
 */
function getFavorites() {
  try {
    const data = wx.getStorageSync(FAVORITES_STORAGE_KEY);
    
    // 处理空数据
    if (!data) {
      return [];
    }
    
    // 如果是对象格式，转换为数组
    if (typeof data === 'object' && !Array.isArray(data)) {
      return Object.keys(data).map(code => ({
        code: code,
        ...data[code]
      }));
    }
    
    // 已经是数组格式
    if (Array.isArray(data)) {
      return data;
    }
    
    return [];
  } catch (e) {
    console.error('getFavorites failed', e);
    return [];
  }
}

/**
 * 获取自选 Map（用于快速查找）
 * @returns {Object} 以 code 为 key 的自选 Map
 */
function getFavoritesMap() {
  const list = getFavorites();
  const map = {};
  list.forEach(item => {
    if (item && item.code) {
      map[item.code] = item;
    }
  });
  return map;
}

/**
 * 检查是否已收藏
 * @param {string} code 股票代码
 * @returns {boolean}
 */
function isFavorite(code) {
  if (!code) return false;
  const list = getFavorites();
  const normalizedCode = normalizeCode(code);
  return list.some(item => normalizeCode(item.code) === normalizedCode);
}

/**
 * 添加自选
 * @param {Object} stock 股票信息 { code, name, price, changePercent, market, groupId }
 * @returns {boolean} 是否成功
 */
function addFavorite(stock) {
  if (!stock || !stock.code) {
    return false;
  }
  
  const list = getFavorites();
  const normalizedCode = normalizeCode(stock.code);
  
  // 检查是否已存在
  if (list.some(item => normalizeCode(item.code) === normalizedCode)) {
    return false;
  }
  
  // 构建自选项
  const favoriteItem = {
    code: stock.code,
    name: stock.name || '',
    price: stock.price || 0,
    changePercent: stock.changePercent || 0,
    change: stock.change || 0,
    market: stock.market || getMarketByCode(stock.code),
    groupId: stock.groupId || 'all',
    addedTime: Date.now()
  };
  
  list.push(favoriteItem);
  return saveFavorites(list);
}

/**
 * 移除自选（支持回收站）
 * @param {string} code 股票代码
 * @param {Object} options 选项 { useRecycleBin: boolean }
 * @returns {Object} { success: boolean, recycled: boolean, message: string }
 */
function removeFavorite(code, options = {}) {
  const { useRecycleBin = true } = options;
  
  if (!code) {
    return { success: false, recycled: false, message: '股票代码不能为空' };
  }
  
  // 检查存储空间
  const storageCheck = checkStorageSpace();
  if (!storageCheck.available) {
    return { success: false, recycled: false, message: storageCheck.message };
  }
  
  const list = getFavorites();
  const normalizedCode = normalizeCode(code);
  const itemToRemove = list.find(item => normalizeCode(item.code) === normalizedCode);
  
  if (!itemToRemove) {
    return { success: false, recycled: false, message: '未找到该股票' };
  }
  
  const newList = list.filter(item => normalizeCode(item.code) !== normalizedCode);
  
  // 添加到回收站
  if (useRecycleBin) {
    addToRecycleBin(itemToRemove);
  }
  
  const saved = saveFavorites(newList);
  
  if (saved) {
    logOperation('remove', { code, name: itemToRemove.name, useRecycleBin });
    return { 
      success: true, 
      recycled: useRecycleBin, 
      message: useRecycleBin ? '已移除，可在回收站恢复' : '已删除' 
    };
  }
  
  return { success: false, recycled: false, message: '保存失败' };
}

/**
 * 批量移除自选（支持回收站）
 * @param {Array<string>} codes 股票代码数组
 * @param {Object} options 选项 { useRecycleBin: boolean }
 * @returns {Object} { success: boolean, count: number, recycled: boolean, message: string }
 */
function removeFavorites(codes, options = {}) {
  const { useRecycleBin = true } = options;
  
  if (!Array.isArray(codes) || codes.length === 0) {
    return { success: false, count: 0, recycled: false, message: '请选择要删除的股票' };
  }
  
  // 检查存储空间
  const storageCheck = checkStorageSpace();
  if (!storageCheck.available) {
    return { success: false, count: 0, recycled: false, message: storageCheck.message };
  }
  
  const list = getFavorites();
  const normalizedCodes = new Set(codes.map(c => normalizeCode(c)));
  
  // 找出要删除的项目
  const itemsToRemove = list.filter(item => normalizedCodes.has(normalizeCode(item.code)));
  
  if (itemsToRemove.length === 0) {
    return { success: false, count: 0, recycled: false, message: '未找到要删除的股票' };
  }
  
  const newList = list.filter(item => !normalizedCodes.has(normalizeCode(item.code)));
  
  // 添加到回收站
  if (useRecycleBin) {
    addToRecycleBin(itemsToRemove);
  }
  
  const saved = saveFavorites(newList);
  
  if (saved) {
    logOperation('batchRemove', { codes, count: itemsToRemove.length, useRecycleBin });
    return { 
      success: true, 
      count: itemsToRemove.length, 
      recycled: useRecycleBin, 
      message: useRecycleBin 
        ? `已移除 ${itemsToRemove.length} 条，可在回收站恢复` 
        : `已删除 ${itemsToRemove.length} 条`
    };
  }
  
  return { success: false, count: 0, recycled: false, message: '保存失败' };
}

/**
 * 更新自选的分组
 * @param {string} code 股票代码
 * @param {string} groupId 分组ID
 * @returns {boolean} 是否成功
 */
function updateFavoriteGroup(code, groupId) {
  if (!code || !groupId) return false;
  
  const list = getFavorites();
  const normalizedCode = normalizeCode(code);
  const index = list.findIndex(item => normalizeCode(item.code) === normalizedCode);
  
  if (index === -1) return false;
  
  list[index].groupId = groupId;
  return saveFavorites(list);
}

/**
 * 保存自选列表（统一保存为数组格式）
 * @param {Array} list 自选列表
 * @returns {boolean} 是否成功
 */
function saveFavorites(list) {
  try {
    wx.setStorageSync(FAVORITES_STORAGE_KEY, list);
    return true;
  } catch (e) {
    console.error('saveFavorites failed', e);
    return false;
  }
}

/**
 * 标准化股票代码（统一大小写）
 * @param {string} code 
 * @returns {string}
 */
function normalizeCode(code) {
  if (!code) return '';
  return String(code).toUpperCase();
}

/**
 * 根据股票代码判断市场
 * @param {string} code 
 * @returns {string} 'SH' | 'SZ'
 */
function getMarketByCode(code) {
  if (!code) return 'SZ';
  const c = String(code).toUpperCase();
  // 6 开头为上海
  if (c.startsWith('6')) return 'SH';
  // 0、3 开头为深圳
  return 'SZ';
}

/**
 * 获取带后缀的显示代码
 * @param {string} code 
 * @param {string} market 
 * @returns {string}
 */
function getDisplayCode(code, market) {
  if (!code) return '';
  if (code.includes('.')) return code;
  const m = market || getMarketByCode(code);
  return `${code}.${m}`;
}

/**
 * 根据分组筛选自选
 * @param {string} groupId 分组ID
 * @param {Array} customGroups 自定义分组列表
 * @returns {Array}
 */
function filterByGroup(groupId, customGroups) {
  const allFavorites = getFavorites();
  
  if (groupId === 'all') {
    return allFavorites;
  }
  
  if (groupId === 'holding') {
    return allFavorites.filter(item => item.groupId === 'holding' || item.isHolding);
  }
  
  // 查找自定义分组
  const group = (customGroups || []).find(g => g.id === groupId);
  if (group && group.members) {
    const memberCodes = new Set(
      group.members.map(m => normalizeCode(m.stock_code || m.stockCode))
    );
    return allFavorites.filter(item => 
      memberCodes.has(normalizeCode(item.code)) || 
      memberCodes.has(normalizeCode(item.code.split('.')[0]))
    );
  }
  
  // 按 groupId 字段筛选
  return allFavorites.filter(item => item.groupId === groupId);
}

/**
 * 迁移旧数据格式
 * 将旧的 'favorites' key 数据迁移到新的 FAVORITES_STORAGE_KEY
 */
function migrateOldData() {
  try {
    const oldData = wx.getStorageSync('favorites');
    const newData = wx.getStorageSync(FAVORITES_STORAGE_KEY);
    
    // 如果新数据已存在，不迁移
    if (newData && (Array.isArray(newData) && newData.length > 0 || Object.keys(newData || {}).length > 0)) {
      return;
    }
    
    // 如果旧数据存在
    if (oldData) {
      let migratedData;
      
      if (Array.isArray(oldData)) {
        migratedData = oldData;
      } else if (typeof oldData === 'object') {
        migratedData = Object.keys(oldData).map(code => ({
          code: code,
          ...oldData[code]
        }));
      } else {
        return;
      }
      
      if (migratedData && migratedData.length > 0) {
        saveFavorites(migratedData);
        console.log('自选数据迁移成功，共', migratedData.length, '条');
      }
    }
  } catch (e) {
    console.error('migrateOldData failed', e);
  }
}

// ========== 云端同步功能 v2.1 ==========

/**
 * 添加自选并同步到云端
 */
async function addFavoriteWithSync(stock) {
  const success = addFavorite(stock);
  if (!success) return false;
  
  try {
    await syncFavoritesToCloud();
    console.log('[自选同步] 云端同步成功');
  } catch (error) {
    console.warn('[自选同步] 云端同步失败，数据已保存本地:', error.message);
  }
  
  return true;
}

/**
 * 删除自选并同步到云端
 */
async function removeFavoriteWithSync(code, options = {}) {
  const result = removeFavorite(code, options);
  if (!result.success) return result;
  
  try {
    await syncFavoritesToCloud();
  } catch (error) {
    console.warn('[自选同步] 删除云端同步失败:', error.message);
  }
  
  return result;
}

/**
 * 同步自选数据到云端
 */
async function syncFavoritesToCloud() {
  if (_syncPending) {
    console.log('[自选同步] 已有同步任务进行中');
    return false;
  }
  
  const token = wx.getStorageSync('token');
  if (!token) {
    console.log('[自选同步] 未登录，跳过云端同步');
    return false;
  }
  
  _syncPending = true;
  
  try {
    const favorites = getFavorites();
    const favoritesById = {};
    
    favorites.forEach(item => {
      const normalizedCode = normalizeCode(item.code);
      favoritesById[normalizedCode] = {
        name: item.name || '',
        price: item.price || 0,
        changePercent: item.changePercent || 0,
        change: item.change || 0,
        market: item.market || getMarketByCode(item.code),
        groupId: item.groupId || 'all',
        updatedAt: Date.now()
      };
    });
    
    const { getBaseUrl } = require('../config/api.config.js');
    const baseUrl = getBaseUrl();
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/favorites`,
        method: 'PUT',
        data: { favoritesById },
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.success) {
            _lastSyncTime = Date.now();
            console.log('[自选同步] 云端同步成功，共', favorites.length, '条');
            resolve(true);
          } else {
            reject(new Error(res.data?.message || '同步失败'));
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '网络请求失败'));
        }
      });
    });
  } catch (error) {
    console.error('[自选同步] 同步异常:', error);
    throw error;
  } finally {
    _syncPending = false;
  }
}

/**
 * 从云端拉取自选数据
 */
async function pullFavoritesFromCloud(mergeWithLocal = true) {
  const token = wx.getStorageSync('token');
  if (!token) {
    console.log('[自选同步] 未登录，使用本地数据');
    return getFavorites();
  }
  
  try {
    const { getBaseUrl } = require('../config/api.config.js');
    const baseUrl = getBaseUrl();
    
    return new Promise((resolve) => {
      wx.request({
        url: `${baseUrl}/favorites`,
        method: 'GET',
        header: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.success) {
            const cloudData = res.data.data || {};
            const cloudFavorites = Object.keys(cloudData).map(code => ({
              code,
              ...cloudData[code]
            }));
            
            if (mergeWithLocal) {
              const localFavorites = getFavorites();
              const merged = mergeFavorites(localFavorites, cloudFavorites);
              saveFavorites(merged);
              console.log('[自选同步] 云端拉取成功，合并后', merged.length, '条');
              resolve(merged);
            } else {
              saveFavorites(cloudFavorites);
              console.log('[自选同步] 云端拉取成功', cloudFavorites.length, '条');
              resolve(cloudFavorites);
            }
            _lastSyncTime = Date.now();
          } else {
            resolve(getFavorites());
          }
        },
        fail: (err) => {
          console.warn('[自选同步] 云端拉取失败，使用本地:', err.errMsg);
          resolve(getFavorites());
        }
      });
    });
  } catch (error) {
    console.error('[自选同步] 拉取异常:', error);
    return getFavorites();
  }
}

/**
 * 合并本地和云端数据
 */
function mergeFavorites(local, cloud) {
  const mergedMap = {};
  
  local.forEach(item => {
    const normalizedCode = normalizeCode(item.code);
    mergedMap[normalizedCode] = {
      ...item,
      code: normalizedCode,
      source: 'local',
      updatedAt: item.updatedAt || item.addedTime || 0
    };
  });
  
  cloud.forEach(item => {
    const normalizedCode = normalizeCode(item.code);
    const existing = mergedMap[normalizedCode];
    
    if (!existing) {
      mergedMap[normalizedCode] = { ...item, code: normalizedCode, source: 'cloud' };
    } else {
      const cloudTime = item.updatedAt || 0;
      const localTime = existing.updatedAt || 0;
      
      if (cloudTime > localTime) {
        mergedMap[normalizedCode] = { ...item, code: normalizedCode, source: 'cloud' };
      }
    }
  });
  
  return Object.values(mergedMap);
}

/**
 * 检查是否需要同步
 */
function shouldSync() {
  const token = wx.getStorageSync('token');
  if (!token) return false;
  
  return Date.now() - _lastSyncTime > SYNC_INTERVAL;
}

// 初始化时自动迁移旧数据和清理回收站
migrateOldData();
cleanExpiredRecycleBin();

module.exports = {
  // 核心功能
  getFavorites,
  getFavoritesMap,
  isFavorite,
  addFavorite,
  removeFavorite,
  removeFavorites,
  updateFavoriteGroup,
  saveFavorites,
  normalizeCode,
  getMarketByCode,
  getDisplayCode,
  filterByGroup,
  migrateOldData,
  
  // 新增功能 v2.0
  getRecycleBin,
  recoverFromRecycleBin,
  clearRecycleBin,
  cleanExpiredRecycleBin,
  checkStorageSpace,
  logOperation,
  withLock,
  
  // 云端同步功能 v2.1
  addFavoriteWithSync,
  removeFavoriteWithSync,
  syncFavoritesToCloud,
  pullFavoritesFromCloud,
  mergeFavorites,
  shouldSync
};