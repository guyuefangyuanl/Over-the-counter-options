const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const { requestLogger } = require('./middleware/logger'); // 只导入requestLogger
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const mongoDBConfig = require('./config/mongodb'); // 添加MongoDB配置

// 创建 Express 应用
const app = express();
const PORT = 3001;
const HOST = '0.0.0.0'; // 允许外部连接

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 提供images目录中的文件
app.use('/images', express.static(path.join(__dirname, 'images')));

// 日志中间件
app.use(requestLogger);
// 移除了customLogger，因为它没有被正确导出

// 数据库初始化
const dbPath = path.join(__dirname, 'wechat.db');
const db = new Database(dbPath);

// 创建用户表
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT,
      avatar TEXT,
      gender INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建产品表
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      price DECIMAL(10, 2),
      strike_price DECIMAL(10, 2),
      expiry_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建订单表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      option_type TEXT NOT NULL,
      strike_price DECIMAL(10, 2) NOT NULL,
      expiry_date DATE NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
  
  console.log('✅ SQLite数据库初始化成功');
} catch (error) {
  console.error('❌ SQLite数据库初始化失败:', error);
  process.exit(1);
}

// 连接MongoDB数据库
async function initializeMongoDB() {
  try {
    await mongoDBConfig.connect();
    console.log('✅ MongoDB数据库初始化成功');
  } catch (error) {
    console.error('❌ MongoDB数据库初始化失败:', error);
    // 不退出应用，因为SQLite仍然可以工作
  }
}

// 初始化MongoDB
initializeMongoDB();

// 测试接口
app.get('/api/test', (req, res) => {
  // 打印请求日志
  console.log(`🧪 测试接口 - 方法: ${req.method}, 路径: ${req.path}`);

  try {
    // 测试数据库连接
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
    
    res.json({
      success: true,
      message: "API运行正常",
      database: "已连接",
      userCount: count.count,
      mongodb: mongoDBConfig.isConnected() ? "已连接" : "未连接"
    });
  } catch (error) {
    console.error('测试接口错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

// 路由
app.use('/api/auth', require('./routes/auth'));
// 移除了不存在的路由文件

// 404 处理
app.use(notFoundHandler);

// 全局错误处理中间件
app.use(errorHandler);

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log('======================================');
  console.log('🚀 服务器启动成功！');
  console.log('======================================');
  console.log('📡 服务地址: http://localhost:' + PORT);
  console.log('💾 SQLite数据库文件: ' + dbPath);
  console.log('💾 MongoDB数据库: ' + (mongoDBConfig.isConnected() ? '已连接' : '未连接'));
  console.log('🧪 测试接口: http://localhost:' + PORT + '/api/test');
  console.log('');
  console.log('📚 可用接口:');
  console.log('  POST   /api/auth/wechat/login  - 微信登录');
  console.log('  POST   /api/auth/qq/login     - QQ登录');
  console.log('  GET    /api/auth/user/info     - 获取用户信息');
  console.log('  POST   /api/auth/user/update   - 更新用户信息');
  console.log('  GET    /api/test               - 测试接口');
  console.log('======================================');
});