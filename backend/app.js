require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

// 导入统一响应中间件
const responseMiddleware = require('./middleware/response');

// 导入路由
const v1Router = require('./routes/v1');
const { staticRoutes } = require('./routes');

// 导入数据库配置
const { getDatabase, closeDatabase } = require('./config/database');

const app = express();
const server = http.createServer(app);

// 环境变量配置
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost', 'http://127.0.0.1'];

// 静态文件服务 - 提供images目录中的文件
app.use('/images', express.static(path.join(__dirname, '../images')));

// 数据库初始化
// 数据库初始化
const db = getDatabase();

// CORS配置（统一）
const corsOptions = {
  origin: function (origin, callback) {
    // 允许无origin的请求（如移动应用、Postman）
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域请求'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24小时预检缓存
};

// Socket.IO配置（与Express CORS保持一致）
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// 中间件
app.use(helmet()); // 安全头
app.use(compression()); // 响应压缩
app.use(cors(corsOptions)); // 跨域
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev')); // 日志
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 移除速率限制中间件

// 统一响应格式中间件
app.use(responseMiddleware);

// API版本路由
app.use('/api/v1', v1Router);

// 静态资源路由
app.use('/', staticRoutes);

// 根路径
app.get('/', (req, res) => {
  res.success({
    name: 'Stock Trading Backend',
    version: '1.0.0',
    environment: NODE_ENV,
    apiVersion: 'v1',
    endpoints: {
      health: '/api/v1/health',
      trades: '/api/v1/trades',
      quotes: '/api/v1/quotes',
      marketOverview: '/api/v1/market/overview',
      hotStocks: '/api/v1/stocks/hot',
      marketIndices: '/api/v1/market/indices',
      announcements: '/api/v1/announcements'
    }
  }, '服务运行正常');
});

// 健康检查（保持向后兼容）
app.get('/health', (req, res) => {
  res.success({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }, 'Node.js服务运行正常');
});

// WebSocket连接处理
io.on('connection', (socket) => {
  console.log('客户端已连接:', socket.id);

  // 发送实时行情数据
  const quotesInterval = setInterval(() => {
    try {
      // 从数据库获取最新的行情数据
      const stmt = db.prepare('SELECT * FROM quotes ORDER BY timestamp DESC LIMIT 1');
      const latestQuote = stmt.get();
      
      if (latestQuote) {
        socket.emit('quote', {
          code: latestQuote.symbol,
          name: latestQuote.symbol, // 在实际应用中这里应该是股票名称
          price: latestQuote.price,
          change: latestQuote.price - (latestQuote.bid || latestQuote.price),
          timestamp: latestQuote.timestamp
        });
      }
    } catch (error) {
      console.error('获取行情数据失败:', error);
      // 出错时发送模拟数据
      socket.emit('quote', {
        code: '000001',
        name: '平安银行',
        price: (Math.random() * 20 + 10).toFixed(2),
        change: (Math.random() * 2 - 1).toFixed(2),
        timestamp: new Date().toISOString()
      });
    }
  }, 3000);

  socket.on('disconnect', () => {
    console.log('客户端已断开:', socket.id);
    clearInterval(quotesInterval);
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('全局错误:', err);
  
  // CORS错误特殊处理
  if (err.message === '不允许的跨域请求') {
    return res.error('跨域请求被拒绝', 403, 403);
  }
  
  // 数据库错误处理
  if (err.code === 'SQLITE_ERROR' || err.code === 'SQLITE_CONSTRAINT') {
    return res.error('数据库操作失败', 400, 400);
  }
  
  // 验证错误处理
  if (err.name === 'ValidationError') {
    return res.error(err.message, 400, 400);
  }
  
  // 未找到资源错误
  if (err.name === 'NotFoundError') {
    return res.error(err.message, 404, 404);
  }
  
  res.error(
    NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    500,
    500
  );
});

// 404处理
app.use((req, res) => {
  res.error('请求的资源不存在', 404, 404);
});

// 启动服务器
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════╗
║   Stock Trading Backend Started       ║
╠════════════════════════════════════════╣
║   Environment: ${NODE_ENV.padEnd(24)}║
║   Port:        ${PORT.toString().padEnd(24)}║
║   API Version: v1                      ║
║   URL:         http://localhost:${PORT}/api/v1 ║
╚════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    closeDatabase();
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = { app };