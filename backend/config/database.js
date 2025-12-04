const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库文件路径（使用新的文件名避免权限问题）
const DB_PATH = path.join(__dirname, '..', 'data', 'trading_new.db');

// 创建数据库连接
let db = null;

function getDatabase() {
  if (!db) {
    // 确保 data 目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    
    // 启用外键约束
    db.pragma('foreign_keys = ON');
    
    // 初始化表结构
    initializeTables();
  }
  
  return db;
}

function initializeTables() {
  // 用户表（更新字段以匹配 User.js 模型）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT UNIQUE NOT NULL,
      unionId TEXT,
      qqOpenId TEXT UNIQUE,
      qqUnionId TEXT UNIQUE,
      loginType TEXT DEFAULT 'wechat',
      nickname TEXT NOT NULL,
      avatar TEXT,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      isVerified BOOLEAN DEFAULT FALSE,
      idCard TEXT,
      realName TEXT,
      riskLevel TEXT DEFAULT 'conservative',
      riskScore INTEGER DEFAULT 0,
      riskAssessmentDate DATETIME,
      accounts TEXT, -- JSON 格式存储账户信息
      activeAccountId TEXT,
      status TEXT DEFAULT 'active',
      lastLoginTime DATETIME,
      lastActiveTime DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 询价表
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inquiryId TEXT UNIQUE NOT NULL,
      userId TEXT NOT NULL,
      accountId TEXT,
      optionType TEXT NOT NULL,
      underlyingAsset TEXT, -- JSON 格式存储标的资产信息
      strikePrice REAL NOT NULL,
      expiryDate DATETIME NOT NULL,
      exerciseStyle TEXT DEFAULT 'european',
      settlementType TEXT DEFAULT 'cash',
      notionalAmount REAL NOT NULL,
      quantity INTEGER NOT NULL,
      direction TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      quotes TEXT, -- JSON 格式存储报价列表
      bestQuote TEXT, -- JSON 格式存储最优报价
      marketData TEXT, -- JSON 格式存储市场数据快照
      riskMetrics TEXT, -- JSON 格式存储风险评估
      source TEXT DEFAULT 'manual',
      notes TEXT,
      validUntil DATETIME NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 交易表
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeId TEXT UNIQUE NOT NULL,
      userId TEXT NOT NULL,
      optionType TEXT NOT NULL,
      direction TEXT NOT NULL,
      underlyingAsset TEXT NOT NULL,
      strikePrice REAL NOT NULL,
      premium REAL NOT NULL,
      quantity INTEGER NOT NULL,
      expiryDate DATETIME NOT NULL,
      tradeDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      exercisePrice REAL,
      exercisedAt DATETIME,
      closePrice REAL,
      closedAt DATETIME,
      profit REAL,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 报价表
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      bid REAL,
      ask REAL,
      volume INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 持仓表
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      averagePrice REAL NOT NULL,
      currentPrice REAL,
      unrealizedPnL REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_openId ON users(openId);
    CREATE INDEX IF NOT EXISTS idx_users_qqOpenId ON users(qqOpenId);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_inquiries_inquiryId ON inquiries(inquiryId);
    CREATE INDEX IF NOT EXISTS idx_inquiries_userId ON inquiries(userId);
    CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
    CREATE INDEX IF NOT EXISTS idx_trades_userId ON trades(userId);
    CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
    CREATE INDEX IF NOT EXISTS idx_trades_expiryDate ON trades(expiryDate);
    CREATE INDEX IF NOT EXISTS idx_quotes_symbol ON quotes(symbol);
    CREATE INDEX IF NOT EXISTS idx_positions_userId ON positions(userId);
  `);
  
  console.log('✅ SQLite 数据库表初始化完成');
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('✅ 数据库连接已关闭');
  }
}

module.exports = {
  getDatabase,
  closeDatabase
};