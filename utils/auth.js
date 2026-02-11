const { post } = require('./request');

const login = async () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            const response = await post('/auth/wechat/login', { code: res.code });
            if (response && response.token) {
              wx.setStorageSync('token', response.token);
              wx.setStorageSync('userInfo', {
                  nickname: response.nickname,
                  avatar: response.avatar,
                  openid: response.openid
              });
              resolve(response);
            } else {
              reject('Login failed: No token received');
            }
          } catch (error) {
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

module.exports = {
  login,
  checkSession
};
