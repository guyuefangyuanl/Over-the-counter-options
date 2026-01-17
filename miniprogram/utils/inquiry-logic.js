// 纯逻辑函数，供页面调用与单元测试使用

function validateNewGroupName(name, allGroups) {
  const trimmed = (name || '').trim();
  let error = '';
  if (!trimmed) {
    error = '请输入分组名';
  } else if (trimmed.length > 20) {
    error = '分组名最多20个字';
  } else if ((allGroups || []).some(g => (g && g.name) === trimmed)) {
    error = '已存在同名分组';
  }
  return { error, canConfirm: !error };
}

function computeGroupCountsFromFavorites(favoritesById) {
  const favorites = favoritesById || {};
  const ids = Object.keys(favorites);
  const counts = { all: ids.length };
  // 仅对非 all 的分组进行累加，避免重复累加 all
  ids.forEach(id => {
    const fav = favorites[id];
    const gid = fav && fav.groupId ? fav.groupId : 'all';
    if (gid !== 'all') {
      counts[gid] = (counts[gid] || 0) + 1;
    }
  });
  // system group: holding 单独统计
  counts.holding = 0;
  ids.forEach(id => {
    const fav = favorites[id];
    if (fav && fav.groupId === 'holding') counts.holding += 1;
  });
  return counts;
}

// 验证分组重命名
function validateRenameGroupName(newName, groupId, allGroups) {
  const trimmed = (newName || '').trim();
  let error = '';
  if (!trimmed) {
    error = '请输入分组名';
  } else if (trimmed.length > 20) {
    error = '分组名最多20个字';
  } else if ((allGroups || []).some(g => g && g.name === trimmed && g.id !== groupId)) {
    error = '已存在同名分组';
  }
  return { error, canConfirm: !error };
}

// 获取可用于迁移的目标分组（排除当前分组和all）
function getAvailableTargetGroups(currentGroupId, systemGroups, customGroups) {
  const allGroups = [...(systemGroups || []), ...(customGroups || [])];
  return allGroups.filter(g => g && g.id !== currentGroupId && g.id !== 'all');
}

// 计算需要迁移的自选数量
function computeMigrationCount(groupId, favoritesById) {
  const favorites = favoritesById || {};
  return Object.keys(favorites).filter(id => {
    const fav = favorites[id];
    return fav && fav.groupId === groupId;
  }).length;
}

// 执行分组迁移
function migrateGroupItems(fromGroupId, toGroupId, favoritesById) {
  const favorites = favoritesById || {};
  const updated = {};
  Object.keys(favorites).forEach(id => {
    const fav = favorites[id];
    if (fav && fav.groupId === fromGroupId) {
      updated[id] = { ...fav, groupId: toGroupId };
    } else {
      updated[id] = fav;
    }
  });
  return updated;
}

function extractGroupMemberCodes(group) {
  const members = group && Array.isArray(group.members) ? group.members : [];
  return members
    .map(m => (m && (m.stock_code || m.stockCode)) || '')
    .map(s => String(s).trim())
    .filter(Boolean);
}

function removeFavoritesByCodes(favorites, codes) {
  const list = Array.isArray(favorites) ? favorites : [];
  const rawCodes = Array.isArray(codes) ? codes : [];

  const normalizedSet = new Set();
  rawCodes.forEach(c => {
    const s = String(c || '').trim();
    if (!s) return;
    normalizedSet.add(s);
    normalizedSet.add(s.split('.')[0]);
  });

  if (normalizedSet.size === 0) return list.slice();

  return list.filter(item => {
    const code = item && item.code ? String(item.code) : '';
    if (!code) return true;
    const codeNoSuffix = code.split('.')[0];
    return !normalizedSet.has(code) && !normalizedSet.has(codeNoSuffix);
  });
}

const PROTECTED_GROUP_NAMES = new Set(['全部', '系统分组', '持仓', '我的持仓', '沪深', '指数']);
const PROTECTED_GROUP_IDS = new Set(['all', 'system', 'holding', 'shsz', 'hs', 'index']);

function isProtectedGroup(group) {
  if (!group) return false;
  if (typeof group === 'string') {
    const name = group.trim();
    return PROTECTED_GROUP_NAMES.has(name);
  }
  const id = (group.id || '').trim();
  if (id && PROTECTED_GROUP_IDS.has(id)) return true;
  const name = (group.name || '').trim();
  if (!name) return false;
  if (PROTECTED_GROUP_NAMES.has(name)) return true;
  if (name === '沪深' || name === '指数') return true;
  if (name === '持仓' || name === '我的持仓') return true;
  if (name === '全部') return true;
  return false;
}

// --- Storage Helper Functions ---
const STORAGE_KEY_CUSTOM_GROUPS = 'customGroups';

function loadCustomGroups() {
  try {
    return wx.getStorageSync(STORAGE_KEY_CUSTOM_GROUPS) || [];
  } catch (e) {
    console.error('loadCustomGroups failed', e);
    return [];
  }
}

function saveCustomGroups(groups) {
  try {
    wx.setStorageSync(STORAGE_KEY_CUSTOM_GROUPS, groups);
    return true;
  } catch (e) {
    console.error('saveCustomGroups failed', e);
    return false;
  }
}

function createGroup(name) {
  const groups = loadCustomGroups();
  // Double check validation
  if (groups.some(g => g.name === name)) return null;
  
  const newGroup = {
    id: 'g_' + Date.now(),
    name: name,
    createTime: Date.now()
  };
  groups.push(newGroup);
  saveCustomGroups(groups);
  return newGroup;
}

function renameGroup(groupId, newName) {
  const groups = loadCustomGroups();
  const index = groups.findIndex(g => g.id === groupId);
  if (index === -1) return false;
  
  groups[index].name = newName;
  groups[index].updateTime = Date.now();
  return saveCustomGroups(groups);
}

function deleteGroup(groupId) {
  let groups = loadCustomGroups();
  const initialLen = groups.length;
  groups = groups.filter(g => g.id !== groupId);
  if (groups.length !== initialLen) {
    saveCustomGroups(groups);
    return true;
  }
  return false;
}

module.exports = {
  validateNewGroupName,
  computeGroupCountsFromFavorites,
  validateRenameGroupName,
  getAvailableTargetGroups,
  computeMigrationCount,
  migrateGroupItems,
  extractGroupMemberCodes,
  removeFavoritesByCodes,
  isProtectedGroup,
  loadCustomGroups,
  createGroup,
  renameGroup,
  deleteGroup
};
