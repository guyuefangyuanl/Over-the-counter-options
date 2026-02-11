// pages/account/transactions/transactions.js
const api = require('../../../utils/request');

Page({
  data: {
    items: [],
    loading: false,
    page: 1,
    hasMore: true
  },

  onLoad: function () {
    this.loadData(true);
  },

  onPullDownRefresh: function () {
    this.loadData(true);
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },

  loadData: function (refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    const page = refresh ? 1 : this.data.page;
    
    api.get('/trade/account/transactions', { page, pageSize: 20 })
      .then(res => {
        const newItems = res.items || [];
        const total = res.pagination ? res.pagination.total : 0;
        
        this.setData({
          items: refresh ? newItems : this.data.items.concat(newItems),
          page: page + 1,
          hasMore: (page * 20) < total,
          loading: false
        });
        
        if (refresh) wx.stopPullDownRefresh();
      })
      .catch(err => {
        console.error(err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  formatType: function(type) {
      const map = {
          'deposit': '充值',
          'withdraw': '提现',
          'buy': '买入',
          'sell': '卖出',
          'fee': '费用'
      };
      return map[type] || type;
  }
});
