const express = require('express');
const router = express.Router();
const { getDatabase } = require('../../config/database');

// 获取数据库连接
const db = getDatabase();

/**
 * V1 API 健康检查
 */
router.get('/health', (req, res) => {
  res.success({
    status: 'healthy',
    version: 'v1',
    uptime: process.uptime(),
    database: db ? 'connected' : 'disconnected'
  }, 'API v1 运行正常');
});

/**
 * 获取所有交易记录
 */
router.get('/trades', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // 获取总数
    const countResult = db.prepare('SELECT COUNT(*) as total FROM trades').get();
    const total = countResult.total;

    // 获取分页数据
    const trades = db.prepare(`
      SELECT * FROM trades 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    res.paginate(trades, total, page, pageSize);
  } catch (error) {
    console.error('获取交易列表失败:', error);
    res.error('获取交易列表失败', 500);
  }
});

/**
 * 创建交易记录
 */
router.post('/trades', (req, res) => {
  try {
    const { stock_code, stock_name, action, price, quantity } = req.body;

    // 参数验证
    if (!stock_code || !stock_name || !action || !price || !quantity) {
      return res.error('缺少必要参数', 400, 400);
    }

    if (!['buy', 'sell'].includes(action)) {
      return res.error('交易类型只能是 buy 或 sell', 400, 400);
    }

    const total = price * quantity;
    const timestamp = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO trades (stock_code, stock_name, action, price, quantity, total, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(stock_code, stock_name, action, price, quantity, total, timestamp);

    res.success({
      id: result.lastInsertRowid,
      stock_code,
      stock_name,
      action,
      price,
      quantity,
      total,
      timestamp
    }, '交易创建成功', 201);
  } catch (error) {
    console.error('创建交易失败:', error);
    res.error('创建交易失败', 500);
  }
});

/**
 * 获取单个交易记录
 */
router.get('/trades/:id', (req, res) => {
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);

    if (!trade) {
      return res.error('交易记录不存在', 404, 404);
    }

    res.success(trade, '获取交易记录成功');
  } catch (error) {
    console.error('获取交易记录失败:', error);
    res.error('获取交易记录失败', 500);
  }
});

/**
 * 删除交易记录
 */
router.delete('/trades/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.error('交易记录不存在', 404, 404);
    }

    res.success(null, '交易删除成功');
  } catch (error) {
    console.error('删除交易失败:', error);
    res.error('删除交易失败', 500);
  }
});

/**
 * 获取实时行情（模拟数据）
 */
router.get('/quotes', (req, res) => {
  const quotes = [
    {
      code: '000001',
      name: '平安银行',
      price: (Math.random() * 20 + 10).toFixed(2),
      change: (Math.random() * 2 - 1).toFixed(2),
      volume: Math.floor(Math.random() * 1000000)
    },
    {
      code: '600000',
      name: '浦发银行',
      price: (Math.random() * 15 + 8).toFixed(2),
      change: (Math.random() * 2 - 1).toFixed(2),
      volume: Math.floor(Math.random() * 1000000)
    }
  ];

  res.success(quotes, '获取行情成功');
});

module.exports = router;