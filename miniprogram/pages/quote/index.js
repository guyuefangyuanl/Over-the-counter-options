Page({
  onLoad: function(options) {
    // 自动跳转到正确的 quotes 页面
    wx.switchTab({
      url: '/pages/quotes/quotes'
    });
  }
});