// 后端API示例：支持真正的微信头像获取
// 这个文件应该放在您的Node.js后端项目中

const express = require('express');
const axios = require('axios');
const router = express.Router();

// 🔧 获取微信access_token的接口
router.post('/wechat/access-token', async (req, res) => {
  try {
    const { code } = req.body;
    
    // 从环境变量获取微信配置
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    
    if (!appId || !appSecret) {
      return res.json({
        success: false,
        message: '微信配置缺失'
      });
    }

    // 调用微信接口获取access_token和openid
    const tokenResponse = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: appId,
        secret: appSecret,
        code: code,
        grant_type: 'authorization_code'
      }
    });

    if (tokenResponse.data.errcode) {
      return res.json({
        success: false,
        message: `微信接口错误: ${tokenResponse.data.errmsg}`
      });
    }

    res.json({
      success: true,
      data: {
        access_token: tokenResponse.data.access_token,
        openid: tokenResponse.data.openid,
        expires_in: tokenResponse.data.expires_in
      }
    });

  } catch (error) {
    console.error('获取微信access_token失败:', error);
    res.json({
      success: false,
      message: '获取微信凭证失败'
    });
  }
});

// 🔧 获取用户微信头像的接口
router.post('/user/wechat-avatar', async (req, res) => {
  try {
    const { code } = req.body;
    
    // 1. 先获取access_token和openid
    const tokenResponse = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET,
        code: code,
        grant_type: 'authorization_code'
      }
    });

    if (tokenResponse.data.errcode) {
      return res.json({
        success: false,
        message: `微信认证失败: ${tokenResponse.data.errmsg}`
      });
    }

    const { access_token, openid } = tokenResponse.data;

    // 2. 使用access_token获取用户详细信息
    const userResponse = await axios.get('https://api.weixin.qq.com/sns/userinfo', {
      params: {
        access_token: access_token,
        openid: openid,
        lang: 'zh_CN'
      }
    });

    if (userResponse.data.errcode) {
      return res.json({
        success: false,
        message: `获取用户信息失败: ${userResponse.data.errmsg}`
      });
    }

    // 3. 返回用户头像和其他信息
    res.json({
      success: true,
      data: {
        avatarUrl: userResponse.data.headimgurl,
        nickname: userResponse.data.nickname,
        city: userResponse.data.city,
        province: userResponse.data.province,
        country: userResponse.data.country,
        sex: userResponse.data.sex
      }
    });

  } catch (error) {
    console.error('获取微信用户头像失败:', error);
    res.json({
      success: false,
      message: '获取用户头像失败'
    });
  }
});

// 🔧 获取公众号用户信息的接口（需要公众号权限）
router.post('/wechat/user-info', async (req, res) => {
  try {
    const { code } = req.body;
    
    // 获取基础access_token
    const tokenResponse = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET
      }
    });

    if (tokenResponse.data.errcode) {
      return res.json({
        success: false,
        message: `获取基础token失败: ${tokenResponse.data.errmsg}`
      });
    }

    const accessToken = tokenResponse.data.access_token;

    // 获取用户openid
    const oauthResponse = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: {
        appid: process.env.WECHAT_APP_ID,
        secret: process.env.WECHAT_APP_SECRET,
        code: code,
        grant_type: 'authorization_code'
      }
    });

    if (oauthResponse.data.errcode) {
      return res.json({
        success: false,
        message: `获取用户凭证失败: ${oauthResponse.data.errmsg}`
      });
    }

    const openid = oauthResponse.data.openid;

    // 获取用户详细信息
    const userResponse = await axios.get('https://api.weixin.qq.com/cgi-bin/user/info', {
      params: {
        access_token: accessToken,
        openid: openid,
        lang: 'zh_CN'
      }
    });

    if (userResponse.data.errcode) {
      return res.json({
        success: false,
        message: `获取用户信息失败: ${userResponse.data.errmsg}`
      });
    }

    res.json({
      success: true,
      data: {
        avatarUrl: userResponse.data.headimgurl?.replace('/0', '/132'), // 调整头像尺寸
        nickname: userResponse.data.nickname,
        city: userResponse.data.city,
        province: userResponse.data.province,
        country: userResponse.data.country,
        subscribe: userResponse.data.subscribe
      }
    });

  } catch (error) {
    console.error('获取公众号用户信息失败:', error);
    res.json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

module.exports = router;