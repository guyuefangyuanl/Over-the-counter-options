// pages/account/account.js
const api = require('../../utils/request');

Page({
  data: {
    accountSummary: {
      totalScale: 0, 
      totalProfit: 0, 
      totalAsset: 0,
      balance: 0
    },
    positionList: [],
    transactions: [],
    showTransactionHistory: false,
    isLoading: false
  },

  onLoad: function (options) {
    this.loadData();
  },

  onShow: function () {
    this.loadData();
  },

  loadData: function () {
      this.loadAccountSummary();
      this.loadPositionList();
  },

  onPullDownRefresh: function () {
    this.loadData();
    setTimeout(() => {
        wx.stopPullDownRefresh();
    }, 1000);
  },

  // 加载账户概览
  loadAccountSummary: function () {
    api.get('/trade/account').then(res => {
        this.setData({
            accountSummary: {
                totalAsset: res.total_asset,
                balance: res.balance,
                positionValue: res.position_value,
                totalProfit: res.total_profit
            }
        });
    });
  },

  // 加载持仓列表
  loadPositionList: function () {
      api.get('/trade/positions').then(res => {
          this.setData({
              positionList: res.items || []
          });
      });
  },

  // 充值
  onDeposit: function () {
      wx.showModal({
          title: '充值',
          editable: true,
          placeholderText: '请输入金额',
          success: (res) => {
              if (res.confirm && res.content) {
                  const amount = parseFloat(res.content);
                  if (isNaN(amount) || amount <= 0) {
                      wx.showToast({ title: '金额无效', icon: 'none' });
                      return;
                  }
                  
                  wx.showLoading({ title: '处理中' });
                  api.post('/trade/account/deposit', { amount })
                    .then(res => {
                        wx.showToast({ title: '充值成功' });
                        this.loadAccountSummary();
                    })
                    .catch(err => {
                        wx.showToast({ title: err.message || '失败', icon: 'none' });
                    })
                    .finally(() => wx.hideLoading());
              }
          }
      });
  },

  // 提现
  onWithdraw: function () {
    wx.showModal({
        title: '提现',
        editable: true,
        placeholderText: '请输入金额',
        success: (res) => {
            if (res.confirm && res.content) {
                const amount = parseFloat(res.content);
                if (isNaN(amount) || amount <= 0) {
                    wx.showToast({ title: '金额无效', icon: 'none' });
                    return;
                }
                
                wx.showLoading({ title: '处理中' });
                api.post('/trade/account/withdraw', { amount })
                  .then(res => {
                      wx.showToast({ title: '提现成功' });
                      this.loadAccountSummary();
                  })
                  .catch(err => {
                      wx.showToast({ title: err.message || '失败', icon: 'none' });
                  })
                  .finally(() => wx.hideLoading());
            }
        }
    });
  },

  // 查看资金流水
  viewTransactions: function () {
      wx.navigateTo({
          url: '/pages/account/transactions'
      });
  },
  
  // 格式化数字
  formatNumber: function (num) {
    if (!num) return '0.00';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
});