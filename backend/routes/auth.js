const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const router = express.Router();

// 验证请求参数的中间件
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: '请求参数验证失败',
      errors: errors.array()
    });
  }
  next();
};

// 生成随机字符串的辅助函数
function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成随机 openid
function generateOpenid() {
  return 'openid_' + generateRandomString(20);
}

// 生成随机 token
function generateToken() {
  return 'token_' + generateRandomString(32);
}

// 微信小程序登录
router.post('/wechat/login', [
  body('code').notEmpty().withMessage('微信登录code不能为空'),
  body('userInfo.nickName').optional().notEmpty().withMessage('昵称不能为空'),
  body('userInfo.avatarUrl').optional().isURL().withMessage('头像URL格式不正确')
], validateRequest, async (req, res) => {
  try {
    // 由于我们没有实际的微信API，这里使用模拟数据
    const { code, userInfo } = req.body;
    
    // 生成随机 openid 和 token
    const openid = generateOpenid();
    const token = generateToken();
    
    // 返回成功响应
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        userId: 1,
        openid: openid,
        userInfo: {
          nickName: userInfo?.nickName || '微信用户',
          avatarUrl: userInfo?.avatarUrl || '',
          gender: userInfo?.gender !== undefined ? userInfo.gender : 0
        }
      }
    });

  } catch (error) {
    console.error('微信登录失败:', error);
    res.status(500).json({
      success: false,
      message: '登录失败',
      error: error.message
    });
  }
});

// 刷新token
router.post('/refresh-token', [
  body('refreshToken').notEmpty().withMessage('refresh token不能为空')
], validateRequest, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // 生成新的access token
    const newToken = generateToken();

    res.json({
      success: true,
      message: 'token刷新成功',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('刷新token失败:', error);
    res.status(401).json({
      success: false,
      message: 'refresh token无效或已过期',
      error: error.message
    });
  }
});

// 登出
router.post('/logout', async (req, res) => {
  try {
    // 在实际应用中，可以将token加入黑名单
    // 这里简单返回成功
    res.json({
      success: true,
      message: '登出成功'
    });

  } catch (error) {
    console.error('登出失败:', error);
    res.status(500).json({
      success: false,
      message: '登出失败',
      error: error.message
    });
  }
});

// 验证token有效性
router.get('/verify-token', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未提供token'
      });
    }

    // 简单验证token格式
    const isValid = token.startsWith('token_');

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'token无效'
      });
    }

    res.json({
      success: true,
      message: 'token有效',
      data: {
        userId: 1,
        openId: generateOpenid(),
        nickname: '测试用户',
        avatar: '',
        isVerified: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('验证token失败:', error);
    res.status(401).json({
      success: false,
      message: 'token无效或已过期',
      error: error.message
    });
  }
});

// 获取验证码（用于手机验证等）
router.post('/send-sms-code', [
  body('phone').isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  body('type').isIn(['login', 'register', 'bind', 'verify']).withMessage('验证码类型不正确')
], validateRequest, async (req, res) => {
  try {
    const { phone, type } = req.body;

    // 生成6位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 模拟发送成功
    console.log(`发送验证码到 ${phone}: ${code}, 类型: ${type}`);

    res.json({
      success: true,
      message: '验证码发送成功',
      data: {
        phone,
        expiresIn: 300, // 5分钟后过期
        // 仅在开发环境返回验证码
        ...(process.env.NODE_ENV === 'development' && { code })
      }
    });

  } catch (error) {
    console.error('发送验证码失败:', error);
    res.status(500).json({
      success: false,
      message: '发送验证码失败',
      error: error.message
    });
  }
});

// 验证短信验证码
router.post('/verify-sms-code', [
  body('phone').isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('验证码必须是6位数字'),
  body('type').isIn(['login', 'register', 'bind', 'verify']).withMessage('验证码类型不正确')
], validateRequest, async (req, res) => {
  try {
    const { phone, code, type } = req.body;

    // 在实际应用中，这里应该从Redis中验证验证码
    // 简化处理，只检查格式
    const isValid = /^\d{6}$/.test(code);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: '验证码格式错误'
      });
    }

    // 模拟验证成功
    res.json({
      success: true,
      message: '验证码验证成功',
      data: {
        phone,
        verified: true
      }
    });

  } catch (error) {
    console.error('验证验证码失败:', error);
    res.status(500).json({
      success: false,
      message: '验证验证码失败',
      error: error.message
    });
  }
});

// QQ登录
router.post('/qq/login', [
  body('code').notEmpty().withMessage('QQ登录code不能为空'),
  body('userInfo.nickname').optional().notEmpty().withMessage('昵称不能为空'),
  body('userInfo.figureurl_qq_1').optional().isURL().withMessage('头像URL格式不正确')
], validateRequest, async (req, res) => {
  try {
    const { code, userInfo } = req.body;
    
    // 生成随机 openid 和 token
    const openid = 'qq_' + generateOpenid();
    const token = generateToken();
    
    // 返回成功响应
    res.json({
      success: true,
      message: 'QQ登录成功',
      data: {
        token,
        userId: 2,
        openid: openid,
        userInfo: {
          nickName: userInfo?.nickname || 'QQ用户',
          avatarUrl: userInfo?.figureurl_qq_1 || '',
          gender: 0
        }
      }
    });

  } catch (error) {
    console.error('QQ登录失败:', error);
    res.status(500).json({
      success: false,
      message: 'QQ登录失败',
      error: error.message
    });
  }
});

// 手机号验证码登录
router.post('/phone/login', [
  body('phone').isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('验证码必须是6位数字')
], validateRequest, async (req, res) => {
  try {
    const { phone, code } = req.body;

    // 验证验证码（简化处理）
    const isCodeValid = /^\d{6}$/.test(code);
    if (!isCodeValid) {
      return res.status(400).json({
        success: false,
        message: '验证码错误'
      });
    }

    // 生成随机 token
    const token = generateToken();

    res.json({
      success: true,
      message: '手机号登录成功',
      data: {
        token,
        userId: 3,
        openid: 'phone_' + phone,
        userInfo: {
          nickName: `用户${phone.slice(-4)}`,
          avatar: '',
          gender: 0
        }
      }
    });

  } catch (error) {
    console.error('手机号登录失败:', error);
    res.status(500).json({
      success: false,
      message: '手机号登录失败',
      error: error.message
    });
  }
});

// 绑定手机号
router.post('/bind-phone', [
  body('phone').isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('验证码必须是6位数字')
], validateRequest, async (req, res) => {
  try {
    const { phone, code } = req.body;

    // 验证验证码（简化处理）
    const isCodeValid = /^\d{6}$/.test(code);
    if (!isCodeValid) {
      return res.status(400).json({
        success: false,
        message: '验证码错误'
      });
    }

    res.json({
      success: true,
      message: '手机号绑定成功',
      data: {
        phone: phone
      }
    });

  } catch (error) {
    console.error('绑定手机号失败:', error);
    res.status(500).json({
      success: false,
      message: '绑定手机号失败',
      error: error.message
    });
  }
});

module.exports = router;