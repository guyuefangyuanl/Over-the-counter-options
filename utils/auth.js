const { post } = require('./request');

const login = async () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            const response = await post('/auth/wechat/login', { code: res.code });
            
            // 🔧 修复：兼容多种 token 字段名和响应结构
            // 后端返回格式：{ success: true, data: { token: '...', ... } }
            console.log('[Auth] 登录响应:', response);
            
            // response 可能是字符串或对象，需要检查类型
            let responseData;
            if (typeof response === 'string') {
              try {
                responseData = JSON.parse(response);
              } catch (e) {
                responseData = { token: response };
              }
            } else if (typeof response === 'object' && response !== null) {
              responseData = response;
            } else {
              responseData = {};
            }
            
            console.log('[Auth] 响应数据:', responseData);
            
            // 提取 token（可能在多个字段中）
            let token = responseData.token || responseData.access_token || responseData.accessToken;
            
            // 如果 token 还是对象，尝试提取其中的 token 字段
            if (typeof token === 'object' && token !== null) {
              token = token.token || token.access_token || token.accessToken;
            }
            
            console.log('[Auth] 提取的 token:', token, '类型:', typeof token);
            
            if (response && token) {
              // 确保 token 是字符串
              const tokenStr = String(token);
              // 存储access token和refresh token
              wx.setStorageSync('token', tokenStr);
              console.log('[Auth] Token 已保存:', tokenStr.substring(0, 20) + '...');
                          
              if (responseData.refresh_token || responseData.refreshToken) {
                wx.setStorageSync('refresh_token', responseData.refresh_token || responseData.refreshToken);
              }
                          
              // 存储用户信息
              const userInfo = {
                  nickname: responseData.nickname || responseData.nickName || '微信用户',
                  avatar: responseData.avatar || responseData.avatarUrl || '',
                  openid: responseData.openid || responseData.userId || '',
                  isLoggedIn: true,
                  isGuest: false,
                  loginTime: new Date().toISOString()
              };
              wx.setStorageSync('userInfo', userInfo);
              console.log('[Auth] UserInfo 已保存:', userInfo);
                          
              resolve(response);
            } else {
              console.error('[Auth] 登录失败：未收到 token', response);
              reject('Login failed: No token received');
            }
          } catch (error) {
            console.error('[Auth] 登录请求失败:', error);
            reject(error);
          }
        } else {
          reject('wx.login failed: ' + res.errMsg);
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const checkSession = () => {
    return new Promise((resolve) => {
        wx.checkSession({
            success: () => {
                const token = wx.getStorageSync('token');
                resolve(!!token);
            },
            fail: () => {
                resolve(false);
            }
        })
    })
}

const logout = () => {
    wx.removeStorageSync('token');
    wx.removeStorageSync('refresh_token');
    wx.removeStorageSync('userInfo');
    
    wx.reLaunch({
        url: '/pages/login/login'
    });
}

module.exports = {
  login,
  checkSession,
  logout
};
