const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 微信登录
router.post('/wechat/login', authController.wechatLogin);

// QQ登录
router.post('/qq/login', authController.qqLogin);

// 获取用户信息
router.get('/user/info', authController.getUserInfo);

// 更新用户信息
router.post('/user/update', authController.updateUserInfo);

// 发送短信验证码
router.post('/send-sms-code', authController.sendSmsCode);

// 验证短信验证码
router.post('/verify-sms-code', authController.verifySmsCode);

module.exports = router;