// pages/orders/orders.js
const api = require('../../utils/request');

Page({
  data: {
    orders: [],
    loading: false,
    page: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad: function (options) {
    this.loadOrders(true);
  },

  onPullDownRefresh: function () {
    this.loadOrders(true);
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(false);
    }
  },

  loadOrders: function (refresh = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    const page = refresh ? 1 : this.data.page;
    
    api.get('/trade/orders', {
      page: page,
      pageSize: this.data.pageSize
    }).then(res => {
      const newOrders = res.items || [];
      const total = res.pagination ? res.pagination.total : 0;
      
      this.setData({
        orders: refresh ? newOrders : this.data.orders.concat(newOrders),
        page: page + 1,
        hasMore: (page * this.data.pageSize) < total,
        loading: false
      });
      
      if (refresh) {
        wx.stopPullDownRefresh();
      }
    }).catch(err => {
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },
  
  getStatusText: function(status) {
      const map = {
          'pending': '待处理',
          'processing': '处理中',
          'completed': '已完成',
          'cancelled': '已取消',
          'rejected': '已拒绝'
      };
      return map[status] || status;
  }
});
