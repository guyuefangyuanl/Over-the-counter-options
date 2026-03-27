/**
 * 我的订单页面
 */
const orderService = require('../../utils/orderService.js');

// 订单状态定义
const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// 状态标签映射
const STATUS_LABELS = {
  [ORDER_STATUS.PENDING]: '待处理',
  [ORDER_STATUS.PROCESSING]: '处理中',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELLED]: '已取消'
};

// 状态颜色映射
const STATUS_COLORS = {
  [ORDER_STATUS.PENDING]: '#E6A23C',
  [ORDER_STATUS.PROCESSING]: '#409EFF',
  [ORDER_STATUS.COMPLETED]: '#67C23A',
  [ORDER_STATUS.CANCELLED]: '#909399'
};

Page({
  data: {
    // 状态筛选
    statusOptions: [
      { label: '全部', value: '' },
      { label: '待处理', value: ORDER_STATUS.PENDING },
      { label: '处理中', value: ORDER_STATUS.PROCESSING },
      { label: '已完成', value: ORDER_STATUS.COMPLETED },
      { label: '已取消', value: ORDER_STATUS.CANCELLED }
    ],
    activeStatus: '',

    // 订单列表
    orders: [],
    loading: false,
    error: false,

    // 分页
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,

    // 空状态
    isEmpty: false
  },

  onLoad: function() {
    this.loadOrders();
  },

  onShow: function() {
    // 刷新数据
    this.refreshOrders();
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshOrders().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  // 触底加载更多
  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadOrders();
    }
  },

  /**
   * 刷新订单列表
   */
  refreshOrders: function() {
    this.setData({
      page: 1,
      orders: [],
      hasMore: true,
      isEmpty: false
    });
    return this.loadOrders();
  },

  /**
   * 加载订单列表
   */
  loadOrders: function() {
    const self = this;
    const { page, pageSize, activeStatus } = this.data;

    if (this.data.loading) return Promise.resolve();

    this.setData({ loading: true, error: false });

    return orderService.getOrders(page, pageSize, activeStatus)
      .then(function(res) {
        if (res.success && res.data) {
          const newList = res.data.list || res.data.items || [];
          const total = res.data.total || 0;
          const currentList = page === 1 ? newList : self.data.orders.concat(newList);
          const hasMore = currentList.length < total;

          self.setData({
            orders: currentList,
            total: total,
            hasMore: hasMore,
            loading: false,
            isEmpty: currentList.length === 0
          });
        } else {
          self.setData({
            loading: false,
            error: true,
            isEmpty: self.data.orders.length === 0
          });
          wx.showToast({
            title: res.message || '加载失败',
            icon: 'none'
          });
        }
      })
      .catch(function(err) {
        console.error('加载订单列表失败:', err);
        self.setData({
          loading: false,
          error: true,
          isEmpty: self.data.orders.length === 0
        });
        wx.showToast({
          title: '网络异常，请稍后重试',
          icon: 'none'
        });
      });
  },

  /**
   * 切换状态筛选
   */
  switchStatus: function(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.activeStatus) return;

    this.setData({
      activeStatus: status,
      page: 1,
      orders: [],
      hasMore: true,
      isEmpty: false
    });
    this.loadOrders();
  },

  /**
   * 查看订单详情
   */
  goToOrderDetail: function(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;

    wx.showLoading({ title: '加载中' });

    orderService.getOrderDetail(orderId)
      .then(function(res) {
        wx.hideLoading();
        if (res.success && res.data) {
          const detail = res.data;
          const lines = [
            '订单编号: ' + (detail.orderId || detail._id || '--'),
            '标的: ' + (detail.underlying || detail.stockName || '--'),
            '期权类型: ' + self._formatOptionType(detail.optionType),
            '结构: ' + self._formatStructure(detail.structure),
            '期限: ' + (detail.term || '--'),
            '名义本金: ' + (detail.notionalAmount || '--') + ' 万元',
            '期权费: ' + (detail.premium || '--') + ' 元',
            '状态: ' + self._formatStatus(detail.status),
            '创建时间: ' + self._formatTime(detail.createdAt)
          ];
          if (detail.notes) lines.push('备注: ' + detail.notes);

          wx.showModal({
            title: '订单详情',
            content: lines.join('\n'),
            showCancel: false,
            confirmText: '关闭'
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      })
      .catch(function(err) {
        wx.hideLoading();
        console.error('加载订单详情失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });

    var self = this;
  },

  /**
   * 取消订单
   */
  cancelOrder: function(e) {
    const orderId = e.currentTarget.dataset.id;
    if (!orderId) return;

    const self = this;
    wx.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });

          orderService.cancelOrder(orderId)
            .then(function(result) {
              wx.hideLoading();
              if (result.success) {
                wx.showToast({ title: '订单已取消', icon: 'success' });
                self.refreshOrders();
              } else {
                wx.showToast({ title: result.message || '取消失败', icon: 'none' });
              }
            })
            .catch(function(err) {
              wx.hideLoading();
              console.error('取消订单失败:', err);
              wx.showToast({ title: '操作失败', icon: 'none' });
            });
        }
      }
    });
  },

  /**
   * 格式化期权类型
   */
  _formatOptionType: function(type) {
    var map = { call: '看涨', put: '看跌' };
    return map[type] || type || '--';
  },

  /**
   * 格式化结构类型
   */
  _formatStructure: function(structure) {
    var map = { vanilla: '香草', snowball: '雪球', phoenix: '凤凰' };
    return map[structure] || structure || '--';
  },

  /**
   * 格式化状态
   */
  _formatStatus: function(status) {
    return STATUS_LABELS[status] || status || '--';
  },

  /**
   * 获取状态颜色
   */
  _getStatusColor: function(status) {
    return STATUS_COLORS[status] || '#909399';
  },

  /**
   * 格式化时间
   */
  _formatTime: function(time) {
    if (!time) return '--';
    var d = new Date(time);
    if (isNaN(d.getTime())) return '--';
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hour = String(d.getHours()).padStart(2, '0');
    var minute = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  },

  /**
   * 格式化金额
   */
  _formatAmount: function(amount) {
    if (amount === null || amount === undefined) return '--';
    return Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
});