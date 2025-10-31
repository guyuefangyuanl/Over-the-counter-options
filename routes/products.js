const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../middleware/auth');

// 产品列表（分页）
router.get('/list', productController.getProductList);

// 产品详情
router.get('/:id', authenticateToken, productController.getProductDetail);

module.exports = router;