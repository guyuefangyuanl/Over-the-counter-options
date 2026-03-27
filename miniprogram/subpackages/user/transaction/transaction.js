/**
 * 交易记录页面
 */
const orderService = require('../../utils/orderService.js');

// 交易类型定义
const TRANSACTION_TYPES = {
  ALL: '',
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  TRADE: 'trade',
  FEE: 'fee',
  REFUND: 'refund'
};

// 类型标签映射
const TYPE_LABELS = {
  deposit: '充值',
  withdraw: '提现',
  trade: '交易',
  fee: '手续费',
  refund: '退款'
};

Page({
  data: {
    // 日期范围
    dateRange: {
      start: '',
      end: ''
    },
    showDatePicker: false,

    // 交易类型
    transactionType: 'all',
    typeOptions: [
      { label: '全部', value: '' },
      { label: '充值', value: 'deposit' },
      { label: '提现', value: 'withdraw' },
      { label: '交易', value: 'trade' },
      { label: '手续费', value: 'fee' }
    ],

    // 交易记录列表
    transactions: [],
    loading: false,
    error: false,

    // 分页
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,

    // 统计摘要
    summary: {
      totalDeposit: 0,
      totalWithdraw: 0,
      totalTrade: 0,
      netAmount: 0
    },

    // 空状态
    isEmpty: false
  },

  onLoad: function() {
    this.initDateRange();
    this.loadData();
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshData().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  // 触底加载更多
  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadTransactions();
    }
  },

  /**
   * 初始化日期范围（默认最近30天）
   */
  initDateRange: function() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    this.setData({
      'dateRange.start': this._formatDate(start),
      'dateRange.end': this._formatDate(end)
    });
  },

  /**
   * 加载数据
   */
  loadData: function() {
    this.loadTransactions();
    this.loadSummary();
  },

  /**
   * 刷新数据
   */
  refreshData: function() {
    this.setData({
      page: 1,
      transactions: [],
      hasMore: true,
      isEmpty: false
    });
    this.loadSummary();
    return this.loadTransactions();
  },

  /**
   * 加载交易记录
   */
  loadTransactions: function() {
    const self = this;
    const { page, pageSize, transactionType, dateRange } = this.data;

    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true, error: false });

    const params = {
      page: page,
      pageSize: pageSize,
      type: transactionType === 'all' ? '' : transactionType,
      startDate: dateRange.start,
      endDate: dateRange.end
    };

    return orderService.getTransactions(params)
      .then(function(res) {
        if (res.success && res.data) {
          const newList = res.data.list || res.data.items || [];
          const total = res.data.total || 0;
          const currentList = page === 1 ? newList : self.data.transactions.concat(newList);
          const hasMore = currentList.length < total;

          // 按日期分组
          const groupedData = self._groupByDate(currentList);

          self.setData({
            transactions: currentList,
            groupedData: groupedData,
            total: total,
            hasMore: hasMore,
            loading: false,
            isEmpty: currentList.length === 0
          });
        } else {
          self.setData({
            loading: false,
            error: true,
            isEmpty: self.data.transactions.length === 0
          });
          wx.showToast({
            title: res.message || '加载失败',
            icon: 'none'
          });
        }
      })
      .catch(function(err) {
        console.error('加载交易记录失败:', err);
        self.setData({
          loading: false,
          error: true,
          isEmpty: self.data.transactions.length === 0
        });
        wx.showToast({
          title: '网络异常，请稍后重试',
          icon: 'none'
        });
      });
  },

  /**
   * 加载统计摘要
   */
  loadSummary: function() {
    const self = this;

    orderService.getTransactionSummary()
      .then(function(res) {
        if (res.success && res.data) {
          self.setData({
            summary: {
              totalDeposit: res.data.totalDeposit || 0,
              totalWithdraw: res.data.totalWithdraw || 0,
              totalTrade: res.data.totalTrade || 0,
              netAmount: res.data.netAmount || 0
            }
          });
        }
      })
      .catch(function(err) {
        console.error('加载统计摘要失败:', err);
      });
  },

  /**
   * 切换交易类型
   */
  onTypeChange: function(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.transactionType) return;

    this.setData({
      transactionType: type,
      page: 1,
      transactions: [],
      hasMore: true,
      isEmpty: false
    });
    this.loadTransactions();
  },

  /**
   * 日期范围变化
   */
  onDateChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      ['dateRange.' + field]: value
    });
  },

  /**
   * 确认日期筛选
   */
  confirmDateFilter: function() {
    this.refreshData();
  },

  /**
   * 按日期分组
   */
  _groupByDate: function(list) {
    const groups = {};
    list.forEach(function(item) {
      const date = (item.createdAt || item.time || '').split(' ')[0] || '未知日期';
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(item);
    });
    return Object.keys(groups).sort(function(a, b) {
      return new Date(b) - new Date(a);
    }).map(function(date) {
      return {
        date: date,
        items: groups[date]
      };
    });
  },

  /**
   * 格式化日期
   */
  _formatDate: function(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  },

  /**
   * 格式化金额
   */
  _formatAmount: function(amount, type) {
    if (amount === null || amount === undefined) return '--';
    const prefix = (type === 'withdraw' || type === 'fee') ? '-' : '+';
    return prefix + Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * 格式化时间
   */
  _formatTime: function(time) {
    if (!time) return '--';
    const parts = time.split(' ');
    return parts[1] ? parts[1].substring(0, 5) : '--';
  }
});