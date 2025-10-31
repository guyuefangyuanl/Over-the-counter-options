const Database = require('better-sqlite3');
const path = require('path');

// 创建数据库连接
const dbPath = path.join(__dirname, '../wechat.db');
const db = new Database(dbPath);

/**
 * 创建订单
 */
async function createOrder(req, res) {
  try {
    const { productId, quantity, price, optionType, strikePrice, expiryDate } = req.body;
    const userId = req.user.id;
    
    // 打印请求日志
    console.log(`🛒 创建订单 - 方法: ${req.method}, 路径: ${req.path}, 用户ID: ${userId}, 产品ID: ${productId}`);
    
    // 验证必需参数
    if (!productId || !quantity || !price || !optionType || !strikePrice || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    // 生成订单号
    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 9);
    
    // 插入订单
    const insertStmt = db.prepare(`
      INSERT INTO orders (order_no, user_id, product_id, quantity, price, option_type, strike_price, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    
    const info = insertStmt.run(
      orderNo,
      userId,
      productId,
      quantity,
      price,
      optionType,
      strikePrice,
      expiryDate
    );
    
    // 查询新创建的订单
    const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
    
    res.status(201).json({
      success: true,
      data: newOrder,
      message: '订单创建成功'
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 获取我的订单列表
 */
async function getMyOrders(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    // 打印请求日志
    console.log(`📦 获取我的订单列表 - 方法: ${req.method}, 路径: ${req.path}, 用户ID: ${userId}`);
    
    // 构建查询条件
    let sql = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];
    
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    
    // 添加排序和分页
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const orders = db.prepare(sql).all(...params);
    
    // 获取总数量
    let countSql = 'SELECT COUNT(*) as count FROM orders WHERE user_id = ?';
    const countParams = [userId];
    
    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }
    
    const totalCount = db.prepare(countSql).get(...countParams).count;
    
    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

module.exports = {
  createOrder,
  getMyOrders
};