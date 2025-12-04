const Database = require('better-sqlite3');
const path = require('path');

// 创建数据库连接
const dbPath = path.join(__dirname, '../wechat.db');
const db = new Database(dbPath);

/**
 * 获取产品列表（分页）
 */
async function getProductList(req, res) {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const offset = (page - 1) * limit;
    
    // 打印请求日志
    console.log(`📋 获取产品列表 - 方法: ${req.method}, 路径: ${req.path}, 页面: ${page}, 限制: ${limit}`);
    
    // 构建查询条件
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    
    // 添加分页
    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const products = db.prepare(sql).all(...params);
    
    // 获取总数量
    let countSql = 'SELECT COUNT(*) as count FROM products WHERE 1=1';
    const countParams = [];
    
    if (category) {
      countSql += ' AND category = ?';
      countParams.push(category);
    }
    
    const totalCount = db.prepare(countSql).get(...countParams).count;
    
    res.json({
      success: true,
      data: {
        products,
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
    console.error('获取产品列表错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

/**
 * 获取产品详情
 */
async function getProductDetail(req, res) {
  try {
    const { id } = req.params;
    
    // 打印请求日志
    console.log(`📄 获取产品详情 - 方法: ${req.method}, 路径: ${req.path}, 产品ID: ${id}`);
    
    // 查询产品详情
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: '产品不存在'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('获取产品详情错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
}

module.exports = {
  getProductList,
  getProductDetail
};