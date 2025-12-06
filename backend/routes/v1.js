const express = require('express');
const router = express.Router();

// 导入数据库配置
const { getDatabase } = require('../config/database');

// 获取数据库实例
const db = getDatabase();

// 健康检查路由
router.get('/health', (req, res) => {
  res.success({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }, '服务运行正常');
});

// 交易相关路由
router.get('/trades', (req, res) => {
  try {
    // 从数据库获取交易数据
    const stmt = db.prepare('SELECT * FROM trades');
    const trades = stmt.all();
    res.success(trades, '获取交易列表成功');
  } catch (error) {
    console.error('获取交易列表失败:', error);
    res.error('获取交易列表失败', 500, 500);
  }
});

router.post('/trades', (req, res) => {
  try {
    const { tradeId, userId, optionType, direction, underlyingAsset, strikePrice, premium, quantity, expiryDate } = req.body;
    
    // 验证必需参数
    if (!tradeId || !userId || !optionType || !direction || !underlyingAsset || !strikePrice || !premium || !quantity || !expiryDate) {
      return res.error('缺少必要参数', 400, 400);
    }
    
    // 创建新的交易记录
    const stmt = db.prepare(`
      INSERT INTO trades (tradeId, userId, optionType, direction, underlyingAsset, strikePrice, premium, quantity, expiryDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(tradeId, userId, optionType, direction, underlyingAsset, strikePrice, premium, quantity, expiryDate);
    
    // 查询新创建的交易记录
    const newTradeStmt = db.prepare('SELECT * FROM trades WHERE id = ?');
    const newTrade = newTradeStmt.get(info.lastInsertRowid);
    
    res.success(newTrade, '创建交易成功', 201);
  } catch (error) {
    console.error('创建交易失败:', error);
    res.error('创建交易失败', 500, 500);
  }
});

// 行情相关路由
router.get('/quotes', (req, res) => {
  try {
    // 从数据库获取行情数据
    const stmt = db.prepare('SELECT * FROM quotes ORDER BY timestamp DESC LIMIT 50');
    const quotes = stmt.all();
    res.success(quotes, '获取行情数据成功');
  } catch (error) {
    console.error('获取行情数据失败:', error);
    res.error('获取行情数据失败', 500, 500);
  }
});

// 市场概览API（简化版本）
router.get('/market/overview', async (req, res) => {
  try {
    // 模拟市场概览数据
    const overview = {
      totalVolume: 12850000000, // 总成交量
      dailyChange: 2.35, // 日涨跌幅 %
      activeOptions: 156, // 活跃期权数
      leadingCount: 24 // 领涨个股数
    };
    
    res.success(overview, '获取市场概览成功');
  } catch (error) {
    console.error('获取市场概览失败:', error);
    res.error('获取市场概览失败', 500, 500);
  }
});

// 热门股票API（简化版本）
router.get('/stocks/hot', async (req, res) => {
  try {
    // 模拟热门股票数据
    const hotStocks = [
      { code: '000001', name: '平安银行', price: 12.65, change: 1.25, volume: 125800000 },
      { code: '600036', name: '招商银行', price: 35.20, change: -0.85, volume: 98500000 },
      { code: '600519', name: '贵州茅台', price: 1680.00, change: 2.30, volume: 52600000 },
      { code: '000858', name: '五粮液', price: 158.30, change: 1.80, volume: 78500000 },
      { code: '601318', name: '中国平安', price: 48.60, change: -0.50, volume: 156200000 }
    ];
    
    res.success(hotStocks, '获取热门股票成功');
  } catch (error) {
    console.error('获取热门股票失败:', error);
    res.error('获取热门股票失败', 500, 500);
  }
});

// 市场指数API（简化版本）
router.get('/market/indices', async (req, res) => {
  try {
    // 模拟市场指数数据
    const indices = [
      { name: '上证指数', value: 3245.78, change: 0.85, trend: 'up' },
      { name: '深证成指', value: 10872.36, change: 1.20, trend: 'up' },
      { name: '创业板指', value: 2189.45, change: -0.35, trend: 'down' },
      { name: '沪深300', value: 3987.65, change: 0.65, trend: 'up' },
      { name: '中证500', value: 6258.74, change: 0.95, trend: 'up' }
    ];
    
    res.success(indices, '获取市场指数成功');
  } catch (error) {
    console.error('获取市场指数失败:', error);
    res.error('获取市场指数失败', 500, 500);
  }
});

// 公告列表API（简化版本）
router.get('/announcements', async (req, res) => {
  try {
    // 模拟公告数据
    const announcements = [
      { id: 1, title: '关于期权交易时间调整的通知', time: '2025-11-03 15:30', type: 'notice' },
      { id: 2, title: '期权保证金比例调整公告', time: '2025-11-02 10:15', type: 'announcement' },
      { id: 3, title: '新增期权合约标的公告', time: '2025-11-01 14:20', type: 'notice' },
      { id: 4, title: '系统维护通知', time: '2025-10-30 09:00', type: 'maintenance' },
      { id: 5, title: '期权交易规则更新', time: '2025-10-28 16:45', type: 'update' }
    ];
    
    res.success(announcements, '获取公告列表成功');
  } catch (error) {
    console.error('获取公告列表失败:', error);
    res.error('获取公告列表失败', 500, 500);
  }
});

module.exports = router;