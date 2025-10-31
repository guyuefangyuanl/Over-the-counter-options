/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  console.error('❌ 未处理的错误:', err);
  
  // 默认错误响应
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
}

/**
 * 404处理中间件
 */
function notFoundHandler(req, res, next) {
  console.log(`🚫 404 - 方法: ${req.method}, 路径: ${req.path}`);
  
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};