/**
 * 统一响应格式中间件
 */
module.exports = function(req, res, next) {
  /**
   * 成功响应
   * @param {*} data - 业务数据
   * @param {string} message - 提示信息
   * @param {number} code - 业务状态码
   */
  res.success = function(data = null, message = '操作成功', code = 200) {
    return res.status(200).json({
      code,
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * 错误响应
   * @param {string} message - 错误信息
   * @param {number} code - 业务错误码
   * @param {number} httpStatus - HTTP状态码
   */
  res.error = function(message = '操作失败', code = 500, httpStatus = 500) {
    return res.status(httpStatus).json({
      code,
      success: false,
      message,
      data: null,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * 分页响应
   * @param {Array} items - 数据列表
   * @param {number} total - 总数
   * @param {number} page - 当前页
   * @param {number} pageSize - 每页大小
   */
  res.paginate = function(items, total, page = 1, pageSize = 10) {
    return res.status(200).json({
      code: 200,
      success: true,
      message: '获取成功',
      data: {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      },
      timestamp: new Date().toISOString()
    });
  };

  next();
};
