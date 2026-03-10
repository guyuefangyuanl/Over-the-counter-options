const { post } = require('./request');

/**
 * 微信登录
 * 调用后端 /auth/wechat/login 接口获取JWT token
 * 支持双Token机制（access_token + refresh_token）
 */
const login = async () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            console.log('[Auth] 开始微信登录，code:', res.code.substring(0, 10) + '...');
            const response = await post('/auth/wechat/login', { code: res.code });
            
            console.log('[Auth] 登录响应:', response);
            
            // 统一响应处理：后端返回格式 { success: true, data: { ... }, message: '...' }
            let responseData;
            
            if (typeof response === 'string') {
              try {
                responseData = JSON.parse(response);
              } catch (e) {
                console.error('[Auth] 解析响应字符串失败:', e);
                reject(new Error('登录响应格式错误'));
                return;
              }
            } else if (typeof response === 'object' && response !== null) {
              responseData = response;
            } else {
              console.error('[Auth] 无效的响应类型:', typeof response);
              reject(new Error('登录响应无效'));
              return;
            }
            
            // 检查后端返回的成功状态
            if (responseData.success === false) {
              console.error('[Auth] 登录失败:', responseData.message);
              reject(new Error(responseData.message || '登录失败'));
              return;
            }
            
            // 提取data字段（后端标准响应结构）
            const data = responseData.data || responseData;
            
            // 提取 token（支持多种字段名）
            let accessToken = data.access_token || data.token || data.accessToken;
            const refreshToken = data.refresh_token || data.refreshToken;
            
            // 如果 token 是对象，尝试提取
            if (typeof accessToken === 'object' && accessToken !== null) {
              accessToken = accessToken.token || accessToken.access_token;
            }
            
            console.log('[Auth] 提取的 access_token:', accessToken ? '已获取' : '未获取');
            console.log('[Auth] 提取的 refresh_token:', refreshToken ? '已获取' : '未获取');
            
            if (!accessToken) {
              console.error('[Auth] 登录失败：未收到 access_token', responseData);
              reject(new Error('登录失败：未获取到身份令牌'));
              return;
            }
            
            // 确保 token 是字符串
            const tokenStr = String(accessToken);
            
            // 存储token和refresh_token
            wx.setStorageSync('token', tokenStr);
            console.log('[Auth] Access Token 已保存:', tokenStr.substring(0, 20) + '...');
            
            if (refreshToken) {
              wx.setStorageSync('refresh_token', String(refreshToken));
              console.log('[Auth] Refresh Token 已保存');
            }
            
            // 存储用户信息
            const userInfo = {
              nickname: data.nickname || data.nickName || '微信用户',
              avatar: data.avatar || data.avatarUrl || '',
              openid: data.openid || data.userId || '',
              unionid: data.unionid || '',
              phone: data.phone || '',
              isLoggedIn: true,
              isGuest: false,
              loginTime: new Date().toISOString(),
              tokenExpiry: Date.now() + (data.expires_in || 900) * 1000 // 默认15分钟
            };
            wx.setStorageSync('userInfo', userInfo);
            console.log('[Auth] 用户信息已保存:', userInfo.nickname);
            
            resolve({
              success: true,
              data: data,
              message: responseData.message || '登录成功'
            });
          } catch (error) {
            console.error('[Auth] 登录请求失败:', error);
            reject(error);
          }
        } else {
          console.error('[Auth] wx.login 失败:', res.errMsg);
          reject(new Error('微信登录失败：' + (res.errMsg || '未知错误')));
        }
      },
      fail: (err) => {
        console.error('[Auth] wx.login 调用失败:', err);
        reject(new Error('微信登录调用失败：' + (err.errMsg || '未知错误')));
      }
    });
  });
};

/**
 * 检查登录状态
 * 同时检查微信session和本地token有效性
 */
const checkSession = () => {
  return new Promise((resolve) => {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    
    if (!token || !userInfo) {
      console.log('[Auth] 未找到token或用户信息');
      resolve(false);
      return;
    }
    
    // 检查token是否过期
    const tokenExpiry = userInfo.tokenExpiry;
    if (tokenExpiry && Date.now() > tokenExpiry) {
      console.log('[Auth] Token已过期');
      // Token过期但可能有refresh_token，不直接返回false
      const refreshToken = wx.getStorageSync('refresh_token');
      if (!refreshToken) {
        resolve(false);
        return;
      }
    }
    
    wx.checkSession({
      success: () => {
        console.log('[Auth] Session有效');
        resolve(true);
      },
      fail: () => {
        console.log('[Auth] Session已过期');
        resolve(false);
      }
    });
  });
};

/**
 * 退出登录
 * 清除本地存储并跳转登录页
 */
const logout = () => {
  console.log('[Auth] 执行退出登录');
  wx.removeStorageSync('token');
  wx.removeStorageSync('refresh_token');
  wx.removeStorageSync('userInfo');
  
  wx.reLaunch({
    url: '/pages/login/login'
  });
};

/**
 * 刷新Access Token
 * 使用refresh_token获取新的access_token
 */
const refreshAccessToken = async () => {
  return new Promise((resolve, reject) => {
    const refreshToken = wx.getStorageSync('refresh_token');
    
    if (!refreshToken) {
      console.error('[Auth] 未找到refresh_token');
      reject(new Error('未找到刷新令牌'));
      return;
    }
    
    console.log('[Auth] 开始刷新token...');
    
    wx.request({
      url: `${require('./request').BASE_URL}/auth/token/refresh`,
      method: 'POST',
      data: { refresh_token: refreshToken },
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.success) {
          const data = res.data.data;
          const newToken = data.access_token || data.token;
          const newRefreshToken = data.refresh_token;
          
          if (newToken) {
            wx.setStorageSync('token', String(newToken));
            console.log('[Auth] Token刷新成功');
            
            // 更新用户信息中的过期时间
            const userInfo = wx.getStorageSync('userInfo') || {};
            userInfo.tokenExpiry = Date.now() + (data.expires_in || 900) * 1000;
            wx.setStorageSync('userInfo', userInfo);
          }
          
          if (newRefreshToken) {
            wx.setStorageSync('refresh_token', String(newRefreshToken));
          }
          
          resolve(newToken);
        } else {
          console.error('[Auth] Token刷新失败:', res.data);
          reject(new Error(res.data?.message || 'Token刷新失败'));
        }
      },
      fail: (err) => {
        console.error('[Auth] Token刷新请求失败:', err);
        reject(new Error('网络请求失败'));
      }
    });
  });
};

/**
 * 获取当前登录用户信息
 */
const getCurrentUser = () => {
  return wx.getStorageSync('userInfo');
};

/**
 * 获取当前token
 */
const getToken = () => {
  return wx.getStorageSync('token');
};

module.exports = {
  login,
  checkSession,
  logout,
  refreshAccessToken,
  getCurrentUser,
  getToken
};
