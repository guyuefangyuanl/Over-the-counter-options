const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// 创建 Express 应用
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// 环境变量
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// 中间件
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
const { getDatabase } = require('./config/database');
const db = getDatabase();

// ==================== 基础路由 ====================

// 首页
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '欢迎使用期权交易平台 API',
    version: '1.0.0',
    environment: NODE_ENV,
    endpoints: {
      health: '/health',
      trades: '/api/trades',
      quotes: '/api/quotes',
      users: '/api/users'
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'SQLite connected',
    uptime: process.uptime()
  });
});

// ==================== 交易相关 API ====================

// 获取所有交易
app.get('/api/trades', (req, res) => {
  try {
    const { userId, status, limit = 50 } = req.query;
    
    let sql = 'SELECT * FROM trades WHERE 1=1';
    const params = [];
    
    if (userId) {
      sql += ' AND userId = ?';
      params.push(userId);
    }
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    sql += ' ORDER BY tradeDate DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const trades = db.prepare(sql).all(...params);
    
    res.json({
      success: true,
      count: trades.length,
      data: trades
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取单个交易
app.get('/api/trades/:tradeId', (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = db.prepare('SELECT * FROM trades WHERE tradeId = ?').get(tradeId);
    
    if (!trade) {
      return res.status(404).json({
        success: false,
        error: '交易不存在'
      });
    }
    
    res.json({
      success: true,
      data: trade
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 创建新交易
app.post('/api/trades', (req, res) => {
  try {
    const { 
      userId, 
      optionType, 
      direction, 
      underlyingAsset, 
      strikePrice, 
      premium, 
      quantity, 
      expiryDate,
      notes 
    } = req.body;
    
    // 验证必填字段
    if (!userId || !optionType || !direction || !underlyingAsset || !strikePrice || !premium || !quantity || !expiryDate) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段'
      });
    }
    
    const tradeId = 'TRD' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    const stmt = db.prepare(`
      INSERT INTO trades (
        tradeId, userId, optionType, direction, underlyingAsset, 
        strikePrice, premium, quantity, expiryDate, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    
    const result = stmt.run(
      tradeId, userId, optionType, direction, underlyingAsset,
      strikePrice, premium, quantity, expiryDate, notes || null
    );
    
    // 广播新交易
    io.emit('newTrade', {
      tradeId,
      userId,
      optionType,
      underlyingAsset,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        tradeId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新交易状态
app.put('/api/trades/:tradeId', (req, res) => {
  try {
    const { tradeId } = req.params;
    const { status, exercisePrice, closePrice, profit } = req.body;
    
    const updates = [];
    const params = [];
    
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (exercisePrice !== undefined) {
      updates.push('exercisePrice = ?', 'exercisedAt = CURRENT_TIMESTAMP');
      params.push(exercisePrice);
    }
    
    if (closePrice !== undefined) {
      updates.push('closePrice = ?', 'closedAt = CURRENT_TIMESTAMP');
      params.push(closePrice);
    }
    
    if (profit !== undefined) {
      updates.push('profit = ?');
      params.push(profit);
    }
    
    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(tradeId);
    
    const sql = `UPDATE trades SET ${updates.join(', ')} WHERE tradeId = ?`;
    const result = db.prepare(sql).run(...params);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: '交易不存在'
      });
    }
    
    res.json({
      success: true,
      message: '交易已更新'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 报价相关 API ====================

// 获取最新报价
app.get('/api/quotes', (req, res) => {
  try {
    const { symbol } = req.query;
    
    let sql = 'SELECT * FROM quotes';
    const params = [];
    
    if (symbol) {
      sql += ' WHERE symbol = ?';
      params.push(symbol);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT 100';
    
    const quotes = db.prepare(sql).all(...params);
    
    res.json({
      success: true,
      count: quotes.length,
      data: quotes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 添加报价
app.post('/api/quotes', (req, res) => {
  try {
    const { symbol, price, bid, ask, volume } = req.body;
    
    if (!symbol || !price) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段'
      });
    }
    
    const stmt = db.prepare(`
      INSERT INTO quotes (symbol, price, bid, ask, volume)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(symbol, price, bid || null, ask || null, volume || null);
    
    // 广播新报价
    io.emit('quote', {
      symbol,
      price,
      bid,
      ask,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== Socket.IO ====================

io.on('connection', (socket) => {
  console.log('✅ 客户端已连接:', socket.id);
  
  // 订阅报价
  socket.on('subscribe', (symbols) => {
    console.log('📊 客户端订阅报价:', symbols);
    socket.join('quotes');
    socket.emit('subscribed', { symbols, timestamp: new Date().toISOString() });
  });
  
  // 取消订阅
  socket.on('unsubscribe', () => {
    socket.leave('quotes');
    console.log('📊 客户端取消订阅');
  });
  
  socket.on('disconnect', () => {
    console.log('❌ 客户端已断开:', socket.id);
  });
});

// 模拟实时报价推送
const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
setInterval(() => {
  const symbol = symbols[Math.floor(Math.random() * symbols.length)];
  const basePrice = { AAPL: 150, GOOGL: 2800, MSFT: 300, TSLA: 700, AMZN: 3200 };
  const price = basePrice[symbol] + (Math.random() - 0.5) * 10;
  
  const mockQuote = {
    symbol,
    price: parseFloat(price.toFixed(2)),
    bid: parseFloat((price - 0.5).toFixed(2)),
    ask: parseFloat((price + 0.5).toFixed(2)),
    volume: Math.floor(Math.random() * 10000),
    timestamp: new Date().toISOString()
  };
  
  io.to('quotes').emit('quote', mockQuote);
}, 3000);

// ==================== 错误处理 ====================

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'API 端点未找到',
    path: req.path
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('❌ 服务器错误:', err);
  res.status(500).json({
    success: false,
    error: NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
});

// ==================== 启动服务器 ====================

server.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   🚀 期权交易平台后端服务已启动！          ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\n📍 服务地址:     http://localhost:${PORT}`);
  console.log(`🌍 运行环境:     ${NODE_ENV}`);
  console.log(`💾 数据库:       SQLite`);
  console.log(`⚡ WebSocket:    已启用`);
  console.log(`📊 实时报价:     已启用\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭服务器...');
  const { closeDatabase } = require('./config/database');
  closeDatabase();
  server.close(() => {
    console.log('✅ 服务器已安全关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 收到终止信号，正在关闭...');
  const { closeDatabase } = require('./config/database');
  closeDatabase();
  server.close(() => {
    console.log('✅ 服务器已安全关闭');
    process.exit(0);
  });
});