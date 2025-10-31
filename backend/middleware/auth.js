/**
 * JWT认证中间件
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * 验证JWT Token
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '访问令牌缺失',
        code: 'TOKEN_MISSING'
      });
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: '令牌类型错误',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // 检查用户是否存在
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: '用户账户已被禁用',
        code: 'USER_DISABLED'
      });
    }

    // 将用户信息添加到请求对象
    req.user = {
      userId: decoded.userId,
      openId: decoded.openId,
      riskLevel: user.riskLevel,
      isVerified: user.isVerified
    };

    // 更新用户最后活跃时间
    user.lastActiveTime = new Date();
    await user.save();

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '令牌无效',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '令牌已过期',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Token验证失败:', error);
    return res.status(500).json({
      success: false,
      message: '认证服务错误',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * 可选的JWT认证中间件（对于公开接口）
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    if (decoded.type === 'access') {
      const user = await User.findById(decoded.userId);
      if (user && user.status === 'active') {
        req.user = {
          userId: decoded.userId,
          openId: decoded.openId,
          riskLevel: user.riskLevel,
          isVerified: user.isVerified
        };
      }
    }

    next();

  } catch (error) {
    // 对于可选认证，即使token无效也继续处理
    req.user = null;
    next();
  }
};

/**
 * 检查用户是否已实名认证
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const requireVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '需要登录',
        code: 'LOGIN_REQUIRED'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user || !user.isVerified) {
      return res.status(403).json({
        success: false,
        message: '需要完成实名认证',
        code: 'VERIFICATION_REQUIRED'
      });
    }

    next();

  } catch (error) {
    console.error('验证认证状态失败:', error);
    return res.status(500).json({
      success: false,
      message: '验证服务错误',
      code: 'VERIFICATION_SERVICE_ERROR'
    });
  }
};

/**
 * 检查用户风险等级权限
 * @param {array} allowedLevels 允许的风险等级
 * @returns {function} 中间件函数
 */
const requireRiskLevel = (allowedLevels) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '需要登录',
          code: 'LOGIN_REQUIRED'
        });
      }

      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: '用户不存在',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!allowedLevels.includes(user.riskLevel)) {
        return res.status(403).json({
          success: false,
          message: `该功能需要${allowedLevels.join('或')}风险等级`,
          code: 'INSUFFICIENT_RISK_LEVEL',
          required: allowedLevels,
          current: user.riskLevel
        });
      }

      next();

    } catch (error) {
      console.error('检查风险等级失败:', error);
      return res.status(500).json({
        success: false,
        message: '权限验证服务错误',
        code: 'PERMISSION_SERVICE_ERROR'
      });
    }
  };
};

/**
 * 检查用户是否有管理员权限
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '需要登录',
        code: 'LOGIN_REQUIRED'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }

    // 检查是否为管理员（这里简化处理，实际应该有专门的角色管理）
    const adminOpenIds = process.env.ADMIN_OPEN_IDS ? process.env.ADMIN_OPEN_IDS.split(',') : [];
    if (!adminOpenIds.includes(user.openId)) {
      return res.status(403).json({
        success: false,
        message: '需要管理员权限',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();

  } catch (error) {
    console.error('检查管理员权限失败:', error);
    return res.status(500).json({
      success: false,
      message: '权限验证服务错误',
      code: 'PERMISSION_SERVICE_ERROR'
    });
  }
};

/**
 * API密钥认证中间件（用于第三方集成）
 * @param {object} req 请求对象
 * @param {object} res 响应对象
 * @param {function} next 下一个中间件
 */
const authenticateAPIKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API密钥缺失',
        code: 'API_KEY_MISSING'
      });
    }

    // 验证API密钥（实际应该从数据库查询）
    const validAPIKeys = process.env.VALID_API_KEYS ? process.env.VALID_API_KEYS.split(',') : [];
    
    if (!validAPIKeys.includes(apiKey)) {
      return res.status(401).json({
        success: false,
        message: 'API密钥无效',
        code: 'INVALID_API_KEY'
      });
    }

    // 设置API调用标识
    req.isAPICall = true;
    req.apiKey = apiKey;

    next();

  } catch (error) {
    console.error('API密钥验证失败:', error);
    return res.status(500).json({
      success: false,
      message: 'API认证服务错误',
      code: 'API_AUTH_SERVICE_ERROR'
    });
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireVerification,
  requireRiskLevel,
  requireAdmin,
  authenticateAPIKey
};