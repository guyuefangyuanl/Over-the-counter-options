// 真正的头像获取解决方案
// 这个文件提供了多种方式来获取真实的用户头像

class RealAvatarFetcher {
  constructor() {
    this.app = getApp();
  }

  /**
   * 获取真实用户头像的主要方法
   * @param {string} loginCode - 微信登录凭证
   * @param {object} userProfile - 基础用户信息
   * @returns {Promise<object>} 包含真实头像的用户信息
   */
  async getRealAvatar(loginCode, userProfile) {
    console.log('开始获取真实用户头像...');
    
    // 尝试多种方案依次获取头像
    const strategies = [
      this.tryGetAvatarFromWechatAPI.bind(this),
      this.tryGetAvatarFromBackend.bind(this),
      this.tryGetAvatarFromUserInfo.bind(this)
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`尝试方案 ${i + 1} 获取头像...`);
        const result = await strategies[i](loginCode, userProfile);
        if (result && result.avatarUrl) {
          console.log('成功获取到真实头像:', result.avatarUrl);
          return result;
        }
      } catch (error) {
        console.warn(`方案 ${i + 1} 失败:`, error.message);
        continue;
      }
    }

    // 所有方案都失败，抛出错误
    throw new Error('无法获取用户真实头像');
  }

  /**
   * 方案1: 通过微信官方API获取头像
   */
  async tryGetAvatarFromWechatAPI(loginCode, userProfile) {
    return new Promise((resolve, reject) => {
      // 首先获取access_token
      wx.request({
        url: `${this.app.globalData.baseUrl}/api/wechat/access-token`,
        method: 'POST',
        data: { code: loginCode },
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.data && res.data.success && res.data.data) {
            const { access_token, openid } = res.data.data;
            
            // 使用access_token调用微信用户信息接口
            wx.request({
              url: `https://api.weixin.qq.com/cgi-bin/user/info`,
              data: {
                access_token: access_token,
                openid: openid,
                lang: 'zh_CN'
              },
              success: (userRes) => {
                if (userRes.data && userRes.data.headimgurl) {
                  // 微信返回的头像是640x640尺寸，我们可以调整为更合适的尺寸
                  const avatarUrl = userRes.data.headimgurl.replace('/0', '/132');
                  resolve({
                    ...userProfile,
                    avatarUrl: avatarUrl,
                    city: userRes.data.city || '',
                    province: userRes.data.province || '',
                    country: userRes.data.country || ''
                  });
                } else {
                  reject(new Error('微信API未返回头像'));
                }
              },
              fail: () => reject(new Error('调用微信用户信息接口失败'))
            });
          } else {
            reject(new Error('获取微信access_token失败'));
          }
        },
        fail: () => reject(new Error('调用后端获取token接口失败'))
      });
    });
  }

  /**
   * 方案2: 通过后端服务获取头像
   */
  async tryGetAvatarFromBackend(loginCode, userProfile) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.app.globalData.baseUrl}/api/user/wechat-avatar`,
        method: 'POST',
        data: { code: loginCode },
        header: { 'Content-Type': 'application/json' },
        success: (res) => {
          if (res.data && res.data.success && res.data.data && res.data.data.avatarUrl) {
            resolve({
              ...userProfile,
              avatarUrl: res.data.data.avatarUrl,
              city: res.data.data.city || '',
              province: res.data.data.province || '',
              country: res.data.data.country || ''
            });
          } else {
            reject(new Error('后端未返回有效头像'));
          }
        },
        fail: () => reject(new Error('调用后端获取头像接口失败'))
      });
    });
  }

  /**
   * 方案3: 通过wx.getUserInfo获取（需要用户已授权）
   */
  async tryGetAvatarFromUserInfo(loginCode, userProfile) {
    return new Promise((resolve, reject) => {
      wx.getUserInfo({
        success: (infoRes) => {
          if (infoRes.userInfo && infoRes.userInfo.avatarUrl) {
            resolve({
              ...userProfile,
              avatarUrl: infoRes.userInfo.avatarUrl,
              city: infoRes.userInfo.city || '',
              province: infoRes.userInfo.province || '',
              country: infoRes.userInfo.country || ''
            });
          } else {
            reject(new Error('getUserInfo未返回有效头像'));
          }
        },
        fail: () => reject(new Error('getUserInfo调用失败'))
      });
    });
  }

  /**
   * 备用方案: 构造头像URL（当所有其他方案都失败时）
   */
  async getFallbackAvatar(userProfile) {
    // 这是一个备用方案，返回带有默认头像的用户信息
    // 实际应用中可以根据业务需求决定是否使用
    return {
      ...userProfile,
      avatarUrl: '', // 空字符串，前端会显示默认头像
      isFallback: true
    };
  }
}

// 导出实例
module.exports = new RealAvatarFetcher();