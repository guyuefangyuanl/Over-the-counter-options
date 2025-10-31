// 隐私政策页面
Page({
  data: {},

  onLoad: function (options) {
    console.log('隐私政策页面加载');
    
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '隐私政策'
    });
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 同意并返回
  agreeAndBack: function() {
    // 这里可以记录用户同意隐私政策的操作
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    
    // 如果上一页是登录页面，通知同意隐私政策
    if (prevPage && prevPage.route === 'pages/login/login') {
      prevPage.setData({
        agreedToTerms: true
      });
    }
    
    wx.showToast({
      title: '已同意隐私政策',
      icon: 'success'
    });
    
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  },

  // 分享页面
  onShareAppMessage: function() {
    return {
      title: '隐私政策 - 场外期权交易平台',
      path: '/pages/agreement/privacy-policy'
    };
  }
});