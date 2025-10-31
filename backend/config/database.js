const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 数据库文件路径
const DB_PATH = path.join(__dirname, '..', 'data', 'trading.db');

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
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0,
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