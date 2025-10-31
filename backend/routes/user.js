const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { User } = require('../models');
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

// 获取用户信息
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 不返回敏感信息
    const userProfile = {
      _id: user._id,
      openId: user.openId,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      email: user.email,
      isVerified: user.isVerified,
      riskLevel: user.riskLevel,
      riskScore: user.riskScore,
      riskAssessmentDate: user.riskAssessmentDate,
      accounts: user.accounts,
      activeAccountId: user.activeAccountId,
      preferences: user.preferences,
      status: user.status,
      lastLoginTime: user.lastLoginTime,
      createdAt: user.createdAt
    };

    res.json({
      success: true,
      data: userProfile
    });

  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
});

// 更新用户基本信息
router.patch('/profile', [
  body('nickname').optional().isLength({ min: 1, max: 50 }).withMessage('昵称长度必须在1-50字符之间'),
  body('avatar').optional().isURL().withMessage('头像必须是有效的URL'),
  body('phone').optional().isMobilePhone('zh-CN').withMessage('手机号格式不正确'),
  body('email').optional().isEmail().withMessage('邮箱格式不正确')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const updates = {};

    // 只允许更新特定字段
    const allowedFields = ['nickname', 'avatar', 'phone', 'email'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      message: '用户信息更新成功',
      data: {
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
        email: user.email
      }
    });

  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户信息失败',
      error: error.message
    });
  }
});

// 更新用户偏好设置
router.patch('/preferences', [
  body('language').optional().isIn(['zh-CN', 'en-US']).withMessage('语言设置不正确'),
  body('timezone').optional().notEmpty().withMessage('时区不能为空'),
  body('notifications.priceAlert').optional().isBoolean().withMessage('价格提醒设置必须是布尔值'),
  body('notifications.tradeAlert').optional().isBoolean().withMessage('交易提醒设置必须是布尔值'),
  body('notifications.marketNews').optional().isBoolean().withMessage('市场新闻设置必须是布尔值'),
  body('displaySettings.theme').optional().isIn(['light', 'dark']).withMessage('主题设置不正确'),
  body('displaySettings.priceFormat').optional().isIn(['decimal', 'fraction']).withMessage('价格格式设置不正确')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 更新偏好设置
    if (req.body.language) {
      user.preferences.language = req.body.language;
    }
    if (req.body.timezone) {
      user.preferences.timezone = req.body.timezone;
    }
    if (req.body.notifications) {
      Object.assign(user.preferences.notifications, req.body.notifications);
    }
    if (req.body.displaySettings) {
      Object.assign(user.preferences.displaySettings, req.body.displaySettings);
    }

    await user.save();

    res.json({
      success: true,
      message: '偏好设置更新成功',
      data: user.preferences
    });

  } catch (error) {
    console.error('更新偏好设置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新偏好设置失败',
      error: error.message
    });
  }
});

// 获取用户账户列表
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        accounts: user.accounts,
        activeAccountId: user.activeAccountId,
        totalBalance: user.totalBalance
      }
    });

  } catch (error) {
    console.error('获取账户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取账户列表失败',
      error: error.message
    });
  }
});

// 添加新账户
router.post('/accounts', [
  body('accountName').notEmpty().withMessage('账户名称不能为空'),
  body('accountType').isIn(['demo', 'real']).withMessage('账户类型必须是demo或real'),
  body('initialBalance').optional().isFloat({ min: 0 }).withMessage('初始余额必须大于等于0'),
  body('currency').optional().isIn(['CNY', 'USD', 'HKD']).withMessage('货币类型不正确')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 生成账户ID
    const accountId = `ACC${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const accountData = {
      accountId,
      accountName: req.body.accountName,
      accountType: req.body.accountType,
      balance: req.body.initialBalance || 0,
      currency: req.body.currency || 'CNY'
    };

    await user.addAccount(accountData);

    res.status(201).json({
      success: true,
      message: '账户创建成功',
      data: {
        accountId,
        account: accountData
      }
    });

  } catch (error) {
    console.error('创建账户失败:', error);
    res.status(500).json({
      success: false,
      message: '创建账户失败',
      error: error.message
    });
  }
});

// 切换活跃账户
router.patch('/accounts/switch', [
  body('accountId').notEmpty().withMessage('账户ID不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    await user.switchAccount(accountId);

    res.json({
      success: true,
      message: '账户切换成功',
      data: {
        activeAccountId: user.activeAccountId,
        activeAccount: user.activeAccount
      }
    });

  } catch (error) {
    console.error('切换账户失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '切换账户失败'
    });
  }
});

// 账户充值
router.post('/accounts/:accountId/deposit', [
  param('accountId').notEmpty().withMessage('账户ID不能为空'),
  body('amount').isFloat({ min: 0.01 }).withMessage('充值金额必须大于0'),
  body('paymentMethod').optional().notEmpty().withMessage('支付方式不能为空'),
  body('remark').optional().isLength({ max: 200 }).withMessage('备注长度不能超过200字符')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId } = req.params;
    const { amount, paymentMethod, remark } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 模拟充值处理（实际需要对接支付系统）
    await user.updateBalance(accountId, amount, 'add');

    // 记录充值日志
    // 这里可以添加充值记录到专门的交易记录表

    res.json({
      success: true,
      message: '充值成功',
      data: {
        accountId,
        amount,
        newBalance: user.accounts.find(acc => acc.accountId === accountId).balance,
        transactionId: `DEP${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      }
    });

  } catch (error) {
    console.error('账户充值失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '账户充值失败'
    });
  }
});

// 账户提现
router.post('/accounts/:accountId/withdraw', [
  param('accountId').notEmpty().withMessage('账户ID不能为空'),
  body('amount').isFloat({ min: 0.01 }).withMessage('提现金额必须大于0'),
  body('bankAccount').notEmpty().withMessage('银行账户信息不能为空'),
  body('remark').optional().isLength({ max: 200 }).withMessage('备注长度不能超过200字符')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { accountId } = req.params;
    const { amount, bankAccount, remark } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查身份认证
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: '请先完成身份认证'
      });
    }

    // 模拟提现处理（实际需要对接银行系统）
    await user.updateBalance(accountId, amount, 'subtract');

    res.json({
      success: true,
      message: '提现申请提交成功，预计1-3个工作日到账',
      data: {
        accountId,
        amount,
        newBalance: user.accounts.find(acc => acc.accountId === accountId).balance,
        transactionId: `WTH${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      }
    });

  } catch (error) {
    console.error('账户提现失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '账户提现失败'
    });
  }
});

// 风险评估
router.post('/risk-assessment', [
  body('answers').isArray().withMessage('答案必须是数组'),
  body('answers.*.questionId').notEmpty().withMessage('问题ID不能为空'),
  body('answers.*.answer').notEmpty().withMessage('答案不能为空')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { answers } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 模拟风险评估计算
    let riskScore = 0;
    answers.forEach(answer => {
      // 简化的评分逻辑
      if (answer.answer === 'high_risk') {
        riskScore += 3;
      } else if (answer.answer === 'medium_risk') {
        riskScore += 2;
      } else {
        riskScore += 1;
      }
    });

    // 确定风险等级
    let riskLevel = 'conservative';
    if (riskScore >= 20) {
      riskLevel = 'aggressive';
    } else if (riskScore >= 10) {
      riskLevel = 'moderate';
    }

    // 更新用户风险评估信息
    user.riskScore = riskScore;
    user.riskLevel = riskLevel;
    user.riskAssessmentDate = new Date();
    await user.save();

    res.json({
      success: true,
      message: '风险评估完成',
      data: {
        riskScore,
        riskLevel,
        assessmentDate: user.riskAssessmentDate
      }
    });

  } catch (error) {
    console.error('风险评估失败:', error);
    res.status(500).json({
      success: false,
      message: '风险评估失败',
      error: error.message
    });
  }
});

// 身份认证
router.post('/verify-identity', [
  body('realName').notEmpty().withMessage('真实姓名不能为空'),
  body('idCard').matches(/^[1-9]\d{5}(18|19|([23]\d))\d{2}((0[1-9])|(10|11|12))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/).withMessage('身份证号格式不正确'),
  body('idCardImages.front').isURL().withMessage('身份证正面照片必须是有效的URL'),
  body('idCardImages.back').isURL().withMessage('身份证反面照片必须是有效的URL')
], validateRequest, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { realName, idCard, idCardImages } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: '用户已完成身份认证'
      });
    }

    // 模拟身份认证处理（实际需要对接身份认证服务）
    user.realName = realName;
    user.idCard = idCard;
    user.isVerified = true;
    await user.save();

    res.json({
      success: true,
      message: '身份认证成功',
      data: {
        isVerified: user.isVerified,
        realName: user.realName
      }
    });

  } catch (error) {
    console.error('身份认证失败:', error);
    res.status(500).json({
      success: false,
      message: '身份认证失败',
      error: error.message
    });
  }
});

// 更新最后活跃时间
router.patch('/last-active', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    await User.findByIdAndUpdate(userId, {
      lastActiveTime: new Date()
    });

    res.json({
      success: true,
      message: '活跃时间更新成功'
    });

  } catch (error) {
    console.error('更新活跃时间失败:', error);
    res.status(500).json({
      success: false,
      message: '更新活跃时间失败',
      error: error.message
    });
  }
});

module.exports = router;