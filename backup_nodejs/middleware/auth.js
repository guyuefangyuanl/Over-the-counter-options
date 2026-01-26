const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

// 创建数据库连接
const dbPath = path.join(__dirname, '../wechat.db');
const db = new Database(dbPath);

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('⚠️ 警告: JWT_SECRET 环境变量未设置，将使用不安全的备用密钥');
}
const SAFE_JWT_SECRET = JWT_SECRET || 'option_trading_secret_key_backup';

/**
 * 生成JWT token
 * @param {object} user 用户信息
 * @returns {string} JWT token
 */
function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.id,
      openid: user.openid
    },
    SAFE_JWT_SECRET,
    { expiresIn: '24h' } // 24小时过期
  );
}

/**
 * 验证JWT token的中间件
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // 打印请求日志
  console.log(`🔐 Token验证 - 方法: ${req.method}, 路径: ${req.path}, Token: ${token}`);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供访问令牌'
    });
  }

  try {
    // 验证token
    const decoded = jwt.verify(token, SAFE_JWT_SECRET);
    
    // 查询用户
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '无效的访问令牌'
      });
    }

    // 将用户信息附加到请求对象
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '访问令牌已过期'
      });
    }
    
    console.error('Token验证错误:', error);
    return res.status(401).json({
      success: false,
      message: '无效的访问令牌'
    });
  }
}

module.exports = {
  generateToken,
  authenticateToken
};