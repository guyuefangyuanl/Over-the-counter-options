const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken } = require('../middleware/auth');

// 创建订单
router.post('/create', authenticateToken, orderController.createOrder);

// 我的订单列表
router.get('/my', authenticateToken, orderController.getMyOrders);

module.exports = router;