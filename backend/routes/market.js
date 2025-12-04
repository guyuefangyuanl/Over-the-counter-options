const express = require('express');
const router = express.Router();

// 模拟市场数据
const mockMarketData = {
  overview: {
    totalVolume: '128.5亿',
    dailyChange: '+2.3%',
    activeOptions: 156,
    topGainers: 23
  },
  hotStocks: [
    { code: '600519', name: '贵州茅台', price: '1850.00', change: '+3.2%', volume: '12.5万手' },
    { code: '000858', name: '五粮液', price: '220.50', change: '+2.8%', volume: '8.3万手' },
    { code: '600036', name: '招商银行', price: '45.20', change: '+1.5%', volume: '15.7万手' },
    { code: '600030', name: '中信证券', price: '28.60', change: '+4.1%', volume: '10.2万手' },
    { code: '000001', name: '平安银行', price: '18.90', change: '+0.8%', volume: '9.8万手' }
  ],
  indices: [
    { name: '上证指数', value: '3425.67', change: '+1.2%' },
    { name: '深证成指', value: '11890.34', change: '+0.8%' },
    { name: '创业板指', value: '2567.89', change: '+2.1%' },
    { name: '沪深300', value: '4210.56', change: '+1.0%' }
  ]
};

// 公告数据
const mockAnnouncements = [
  { id: 1, title: '关于期权交易时间调整的通知', time: '2025-11-03 15:30', type: 'notice' },
  { id: 2, title: '新增期权合约品种上线公告', time: '2025-11-02 10:15', type: 'product' },
  { id: 3, title: '系统维护通知', time: '2025-11-01 18:45', type: 'system' },
  { id: 4, title: '风险提示：近期市场波动较大', time: '2025-10-31 09:20', type: 'warning' }
];

// 获取市场概览
router.get('/overview', (req, res) => {
  console.log(`📈 获取市场概览 - 方法: ${req.method}, 路径: ${req.path}`);
  
  res.json({
    success: true,
    data: mockMarketData.overview
  });
});

// 获取热门股票
router.get('/hot-stocks', (req, res) => {
  console.log(`🔥 获取热门股票 - 方法: ${req.method}, 路径: ${req.path}`);
  
  res.json({
    success: true,
    data: mockMarketData.hotStocks
  });
});

// 获取市场指数
router.get('/indices', (req, res) => {
  console.log(`📊 获取市场指数 - 方法: ${req.method}, 路径: ${req.path}`);
  
  res.json({
    success: true,
    data: mockMarketData.indices
  });
});

// 获取公告列表
router.get('/announcements', (req, res) => {
  console.log(`📢 获取公告列表 - 方法: ${req.method}, 路径: ${req.path}`);
  
  res.json({
    success: true,
    data: mockAnnouncements
  });
});

// 搜索股票
router.get('/search', (req, res) => {
  console.log(`🔍 搜索股票 - 方法: ${req.method}, 路径: ${req.path}`, req.query);
  
  const { keyword } = req.query;
  
  if (!keyword) {
    return res.json({
      success: true,
      data: []
    });
  }
  
  // 简单的关键词匹配
  const results = mockMarketData.hotStocks.filter(stock => 
    stock.code.includes(keyword) || 
    stock.name.includes(keyword)
  );
  
  res.json({
    success: true,
    data: results
  });
});

module.exports = router;
