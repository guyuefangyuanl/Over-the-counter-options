/**
 * 分组管理模块
 * 处理自定义分组的创建、重命名、删除等操作
 */

const { CUSTOM_GROUPS_STORAGE_KEY, SYSTEM_GROUPS, VALIDATION_RULES } = require('./inquiry-constants');
const { validateGroupName, generateId } = require('./inquiry-utils');

/**
 * 加载自定义分组
 * @returns {Array} 分组列表
 */
function loadCustomGroups() {
  try {
    const stored = wx.getStorageSync(CUSTOM_GROUPS_STORAGE_KEY);
    if (stored && Array.isArray(stored)) {
      return stored;
    }
  } catch (e) {
    console.error('加载自定义分组失败:', e);
  }
  return [];
}

/**
 * 保存自定义分组
 * @param {Array} groups 分组列表
 */
function saveCustomGroups(groups) {
  try {
    wx.setStorageSync(CUSTOM_GROUPS_STORAGE_KEY, groups);
  } catch (e) {
    console.error('保存自定义分组失败:', e);
  }
}

/**
 * 创建新分组
 * @param {string} name 分组名称
 * @param {Array} existingGroups 已有分组
 * @returns {{ success: boolean, error?: string, group?: Object }}
 */
function createGroup(name, existingGroups) {
  // 验证名称
  const validation = validateGroupName(name);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  // 检查重名
  const trimmedName = name.trim();
  const allGroups = [...SYSTEM_GROUPS, ...(existingGroups || [])];
  if (allGroups.some(g => g.name === trimmedName)) {
    return { success: false, error: '分组名称已存在' };
  }
  
  // 创建分组
  const newGroup = {
    id: generateId('group'),
    name: trimmedName,
    createdAt: new Date().toISOString(),
    isCustom: true
  };
  
  return { success: true, group: newGroup };
}

/**
 * 重命名分组
 * @param {string} groupId 分组ID
 * @param {string} newName 新名称
 * @param {Array} existingGroups 已有分组
 * @returns {{ success: boolean, error?: string }}
 */
function renameGroup(groupId, newName, existingGroups) {
  // 验证名称
  const validation = validateGroupName(newName);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  // 检查是否为系统分组
  if (SYSTEM_GROUPS.some(g => g.id === groupId)) {
    return { success: false, error: '系统分组不能修改' };
  }
  
  // 检查重名
  const trimmedName = newName.trim();
  const allGroups = [...SYSTEM_GROUPS, ...(existingGroups || [])];
  const isDuplicate = allGroups.some(g => g.id !== groupId && g.name === trimmedName);
  if (isDuplicate) {
    return { success: false, error: '分组名称已存在' };
  }
  
  // 找到并更新分组
  const groupIndex = (existingGroups || []).findIndex(g => g.id === groupId);
  if (groupIndex === -1) {
    return { success: false, error: '分组不存在' };
  }
  
  existingGroups[groupIndex].name = trimmedName;
  existingGroups[groupIndex].updatedAt = new Date().toISOString();
  
  return { success: true };
}

/**
 * 删除分组
 * @param {string} groupId 分组ID
 * @param {Array} existingGroups 已有分组
 * @param {Object} favoritesById 自选数据
 * @returns {{ success: boolean, error?: string, migrationCount?: number }}
 */
function deleteGroup(groupId, existingGroups, favoritesById) {
  // 检查是否为系统分组
  if (SYSTEM_GROUPS.some(g => g.id === groupId)) {
    return { success: false, error: '系统分组不能删除' };
  }
  
  // 检查分组是否存在
  const groupIndex = (existingGroups || []).findIndex(g => g.id === groupId);
  if (groupIndex === -1) {
    return { success: false, error: '分组不存在' };
  }
  
  // 统计该分组下的自选数量
  let migrationCount = 0;
  for (const key in favoritesById) {
    const fav = favoritesById[key];
    if (fav && fav.groupId === groupId) {
      migrationCount++;
    }
  }
  
  // 删除分组
  existingGroups.splice(groupIndex, 1);
  
  return { success: true, migrationCount };
}

/**
 * 将自选迁移到其他分组
 * @param {string} fromGroupId 源分组ID
 * @param {string} toGroupId 目标分组ID
 * @param {Object} favoritesById 自选数据
 * @returns {Object} 更新后的自选数据
 */
function migrateFavorites(fromGroupId, toGroupId, favoritesById) {
  const updated = { ...favoritesById };
  
  for (const key in updated) {
    if (updated[key] && updated[key].groupId === fromGroupId) {
      updated[key].groupId = toGroupId === 'all' ? null : toGroupId;
    }
  }
  
  return updated;
}

/**
 * 获取分组统计信息
 * @param {Array} groups 分组列表
 * @param {Object} favoritesById 自选数据
 * @returns {Object} 分组ID -> 数量的映射
 */
function getGroupCounts(groups, favoritesById) {
  const counts = {};
  
  // 初始化所有分组计数为0
  const allGroups = [...SYSTEM_GROUPS, ...(groups || [])];
  allGroups.forEach(g => {
    counts[g.id] = 0;
  });
  
  // 统计每个分组的自选数量
  for (const key in favoritesById) {
    const fav = favoritesById[key];
    if (fav && fav.groupId && counts.hasOwnProperty(fav.groupId)) {
      counts[fav.groupId]++;
    }
  }
  
  // 计算全部数量
  counts['all'] = Object.keys(favoritesById || {}).length;
  
  return counts;
}

/**
 * 获取可用于迁移的目标分组
 * @param {string} excludeGroupId 排除的分组ID
 * @param {Array} customGroups 自定义分组
 * @returns {Array}
 */
function getAvailableTargetGroups(excludeGroupId, customGroups) {
  const targets = [...SYSTEM_GROUPS.filter(g => g.id !== 'all')];
  
  (customGroups || []).forEach(g => {
    if (g.id !== excludeGroupId) {
      targets.push(g);
    }
  });
  
  return targets;
}

module.exports = {
  loadCustomGroups,
  saveCustomGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  migrateFavorites,
  getGroupCounts,
  getAvailableTargetGroups
};