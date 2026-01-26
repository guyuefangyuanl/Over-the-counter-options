const { cloudDb, loadMockDb, writeMockDb } = require('../backend_utils/db');
const response = require('../backend_utils/response');

/**
 * 获取所有分组
 */
exports.getGroups = async (req, res) => {
  let cloudGroups = [];
  if (cloudDb) {
    try {
      const results = await cloudDb.query('db.collection("groups").get()');
      cloudGroups = results.map((g) => ({
        ...g,
        id: g._id || g.id,
        _source: 'cloud',
      }));
    } catch (e) {
      console.error('❌ 获取云端分组失败:', e.message);
    }
  }

  const db = loadMockDb();
  const localGroups = (Array.isArray(db.groups) ? db.groups : []).map((g) => ({
    ...g,
    _source: 'local',
  }));

  const mergedGroups = [...cloudGroups];
  localGroups.forEach((local) => {
    if (!mergedGroups.some((cloud) => cloud.id === local.id)) {
      mergedGroups.push(local);
    }
  });

  return response.success(res, mergedGroups, cloudDb ? '获取成功 (云端+本地)' : '获取成功 (本地)');
};

/**
 * 创建分组
 */
exports.createGroup = async (req, res) => {
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return response.error(res, '分组名称不能为空', 400);
  }

  if (cloudDb) {
    try {
      const newGroup = {
        name,
        members: [],
        created_at: new Date().toISOString(),
      };
      const ids = await cloudDb.add('groups', newGroup);
      return response.success(res, { id: ids[0], ...newGroup }, '创建成功 (云端)');
    } catch (e) {
      console.error('❌ 创建云端分组失败:', e.message);
    }
  }

  const db = loadMockDb();
  if (!Array.isArray(db.groups)) {
    db.groups = [];
  }

  const newGroup = {
    id: `g_${Date.now()}`,
    name,
    members: [],
    created_at: new Date().toISOString(),
  };

  db.groups.push(newGroup);
  writeMockDb(db);

  return response.success(res, newGroup, '创建成功 (本地)');
};

/**
 * 更新分组
 */
exports.updateGroup = async (req, res) => {
  const id = req.params.id;
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';

  if (cloudDb) {
    try {
      const updateData = {};
      if (name) updateData.name = name;
      updateData.updated_at = new Date().toISOString();

      const updatedCount = await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), updateData);
      if (updatedCount > 0) {
        return response.success(res, { id, ...updateData }, '更新成功 (云端)');
      }
    } catch (e) {
      console.error('❌ 更新云端分组失败:', e.message);
    }
  }

  const db = loadMockDb();
  const groups = Array.isArray(db.groups) ? db.groups : [];
  const groupIndex = groups.findIndex((g) => g.id === id);

  if (groupIndex === -1) {
    return response.error(res, '分组不存在', 404);
  }

  if (name) {
    groups[groupIndex].name = name;
  }
  groups[groupIndex].updated_at = new Date().toISOString();

  writeMockDb(db);
  return response.success(res, groups[groupIndex], '更新成功 (本地)');
};

/**
 * 删除分组
 */
exports.deleteGroup = async (req, res) => {
  const id = req.params.id;
  
  if (cloudDb) {
    try {
      const deletedCount = await cloudDb.deleteWhere('groups', JSON.stringify({ _id: id }));
      if (deletedCount > 0) {
        return response.success(res, null, '删除成功 (云端)');
      }
    } catch (e) {
      console.error('❌ 删除云端分组失败:', e.message);
    }
  }

  const db = loadMockDb();
  const groups = Array.isArray(db.groups) ? db.groups : [];
  const groupIndex = groups.findIndex((g) => g.id === id);

  if (groupIndex === -1) {
    return response.error(res, '分组不存在', 404);
  }

  db.groups.splice(groupIndex, 1);
  writeMockDb(db);

  return response.success(res, null, '删除成功 (本地)');
};

/**
 * 添加分组成员
 */
exports.addMember = async (req, res) => {
  const id = req.params.id;
  const { stock_code, market, name } = req.body || {};

  if (!stock_code) {
    return response.error(res, '股票代码不能为空', 400);
  }

  if (cloudDb) {
    try {
      const groups = await cloudDb.query(`db.collection("groups").where({_id: "${id}"}).get()`);
      if (groups && groups.length > 0) {
        const group = groups[0];
        const members = group.members || [];
        if (members.some((m) => m.stock_code === stock_code)) {
          return response.error(res, '成员已存在', 400);
        }

        const newMember = {
          stock_code,
          market: market || '',
          name: name || '',
          added_at: new Date().toISOString(),
        };

        await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), {
          members: [...members, newMember],
          updated_at: new Date().toISOString(),
        });

        return response.success(res, { id: group._id, ...group, members: [...members, newMember] }, '添加成功 (云端)');
      }
    } catch (e) {
      console.error('❌ 添加云端成员失败:', e.message);
    }
  }

  const db = loadMockDb();
  const groups = Array.isArray(db.groups) ? db.groups : [];
  const groupIndex = groups.findIndex((g) => g.id === id);

  if (groupIndex === -1) {
    return response.error(res, '分组不存在', 404);
  }

  if (!Array.isArray(groups[groupIndex].members)) {
    groups[groupIndex].members = [];
  }

  if (groups[groupIndex].members.some((m) => m.stock_code === stock_code)) {
    return response.error(res, '成员已存在', 400);
  }

  const newMember = {
    stock_code,
    market: market || '',
    name: name || '',
    added_at: new Date().toISOString(),
  };

  groups[groupIndex].members.push(newMember);
  writeMockDb(db);

  return response.success(res, groups[groupIndex], '添加成功 (本地)');
};

/**
 * 移除分组成员
 */
exports.removeMember = async (req, res) => {
  const { id, stock_code } = req.params;

  if (cloudDb) {
    try {
      const groups = await cloudDb.query(`db.collection("groups").where({_id: "${id}"}).get()`);
      if (groups && groups.length > 0) {
        const group = groups[0];
        const members = group.members || [];
        const memberIndex = members.findIndex((m) => m.stock_code === stock_code);

        if (memberIndex !== -1) {
          members.splice(memberIndex, 1);
          await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), {
            members,
            updated_at: new Date().toISOString(),
          });
          return response.success(res, null, '移除成功 (云端)');
        }
      }
    } catch (e) {
      console.error('❌ 移除云端成员失败:', e.message);
    }
  }

  const db = loadMockDb();
  const groups = Array.isArray(db.groups) ? db.groups : [];
  const groupIndex = groups.findIndex((g) => g.id === id);

  if (groupIndex === -1) {
    return response.error(res, '分组不存在', 404);
  }

  if (!Array.isArray(groups[groupIndex].members)) {
    return response.error(res, '该分组无成员', 400);
  }

  const memberIndex = groups[groupIndex].members.findIndex((m) => m.stock_code === stock_code);
  if (memberIndex === -1) {
    return response.error(res, '成员不在该分组中', 404);
  }

  groups[groupIndex].members.splice(memberIndex, 1);
  writeMockDb(db);

  return response.success(res, null, '移除成功 (本地)');
};
