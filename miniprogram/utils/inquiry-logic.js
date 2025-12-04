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

module.exports = {
  validateNewGroupName,
  computeGroupCountsFromFavorites,
  validateRenameGroupName,
  getAvailableTargetGroups,
  computeMigrationCount,
  migrateGroupItems,
};