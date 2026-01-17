const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');

// 获取所有分组
router.get('/', groupController.getGroups);

// 创建分组
router.post('/', groupController.createGroup);

// 更新分组
router.put('/:id', groupController.updateGroup);

// 删除分组
router.delete('/:id', groupController.deleteGroup);

// 添加分组成员
router.post('/:id/members', groupController.addMember);

// 移除分组成员
router.delete('/:id/members/:stock_code', groupController.removeMember);

module.exports = router;
