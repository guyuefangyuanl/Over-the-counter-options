// pages/test/test.js
const { getApiUrl } = require('../../config/api.config.js');

Page({
  data: {
    result: ''
  },

  onLoad: function (options) {
    this.testConnection();
  },

  testConnection: function() {
    wx.request({
      url: getApiUrl('/test'),
      method: 'GET',
      success: (res) => {
        console.log('连接测试成功:', res);
        this.setData({
          result: '连接成功: ' + JSON.stringify(res.data)
        });
      },
      fail: (err) => {
        console.error('连接测试失败:', err);
        this.setData({
          result: '连接失败: ' + JSON.stringify(err)
        });
      }
    });
  }
});