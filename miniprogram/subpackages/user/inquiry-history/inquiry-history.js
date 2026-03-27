// miniprogram/pages/inquiry-history/inquiry-history.js
const { getMyInquiries, getInquiryDetail } = require('../../utils/inquiryService.js');

// 统一的询价状态定义（与后端保持一致）
const INQUIRY_STATUS = {
  PENDING: 'pending',       // 待处理
  PROCESSING: 'processing', // 处理中
  QUOTED: 'quoted',         // 已报价
  COMPLETED: 'completed',   // 已成交
  REJECTED: 'rejected'      // 已拒绝
};

// 状态标签映射
const STATUS_LABELS = {
  [INQUIRY_STATUS.PENDING]: '待处理',
  [INQUIRY_STATUS.PROCESSING]: '处理中',
  [INQUIRY_STATUS.QUOTED]: '已报价',
  [INQUIRY_STATUS.COMPLETED]: '已成交',
  [INQUIRY_STATUS.REJECTED]: '已拒绝'
};

// 状态颜色映射
const STATUS_COLORS = {
  [INQUIRY_STATUS.PENDING]: '#E6A23C',     // 橙色
  [INQUIRY_STATUS.PROCESSING]: '#409EFF',  // 蓝色
  [INQUIRY_STATUS.QUOTED]: '#409EFF',      // 蓝色
  [INQUIRY_STATUS.COMPLETED]: '#67C23A',   // 绿色
  [INQUIRY_STATUS.REJECTED]: '#F56C6C'     // 红色
};

Page({
  data: {
    activeStatus: '',
    statusTabs: [
      { label: '全部', value: '' },
      { label: '待处理', value: INQUIRY_STATUS.PENDING },
      { label: '处理中', value: INQUIRY_STATUS.PROCESSING },
      { label: '已报价', value: INQUIRY_STATUS.QUOTED },
      { label: '已成交', value: INQUIRY_STATUS.COMPLETED },
      { label: '已拒绝', value: INQUIRY_STATUS.REJECTED }
    ],
    inquiryList: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: false,
    isEmpty: false
  },

  onLoad() {
    this.loadList();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, inquiryList: [], hasMore: true });
    this.loadList().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.loadList();
    }
  },

  /**
   * 加载询价列表
   */
  loadList() {
    const { page, pageSize, activeStatus } = this.data;
    this.setData({ isLoading: true });

    return getMyInquiries({ page, pageSize, status: activeStatus }).then(res => {
      if (res.success && res.data) {
        const newList = res.data.list || [];
        const total = res.data.total || 0;
        const currentList = page === 1 ? newList : this.data.inquiryList.concat(newList);
        const hasMore = currentList.length < total;

        this.setData({
          inquiryList: currentList,
          total: total,
          hasMore: hasMore,
          isLoading: false,
          isEmpty: currentList.length === 0
        });
      } else {
        this.setData({ isLoading: false, isEmpty: this.data.inquiryList.length === 0 });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('加载询价列表失败:', err);
      this.setData({ isLoading: false, isEmpty: this.data.inquiryList.length === 0 });
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    });
  },

  /**
   * 切换状态筛选
   */
  switchStatus(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.activeStatus) return;
    this.setData({
      activeStatus: status,
      page: 1,
      inquiryList: [],
      hasMore: true,
      isEmpty: false
    });
    this.loadList();
  },

  /**
   * 跳转到询价详情（复用 inquiry detail 或单独弹窗展示）
   */
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    wx.showLoading({ title: '加载中' });
    getInquiryDetail(id).then(res => {
      wx.hideLoading();
      if (res.success && res.data) {
        const detail = res.data;
        // 用模态框展示详情
        const lines = [
          '产品: ' + (detail.productName || '--'),
          '类型: ' + this._formatOptionType(detail.optionType),
          '结构: ' + this._formatStructure(detail.structure),
          '期限: ' + (detail.term || '--'),
          '本金: ' + (detail.notionalAmount || '--') + ' 万元',
          '行权价: ' + (detail.strikePrice || '--') + '%',
          '状态: ' + this._formatStatus(detail.status),
          '提交时间: ' + this._formatTime(detail.createdAt)
        ];
        if (detail.notes) lines.push('备注: ' + detail.notes);

        wx.showModal({
          title: '询价详情',
          content: lines.join('\n'),
          showCancel: false,
          confirmText: '关闭'
        });
      } else {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('加载询价详情失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  /**
   * 格式化期权类型
   */
  _formatOptionType(type) {
    var map = { call: '看涨', put: '看跌' };
    return map[type] || type || '--';
  },

  /**
   * 格式化结构类型
   */
  _formatStructure(structure) {
    var map = { vanilla: '香草', snowball: '雪球', phoenix: '凤凰' };
    return map[structure] || structure || '--';
  },

  /**
   * 格式化状态
   */
  _formatStatus(status) {
    return STATUS_LABELS[status] || status || '--';
  },

  /**
   * 获取状态颜色
   */
  _getStatusColor(status) {
    return STATUS_COLORS[status] || '#909399';
  },

  /**
   * 格式化时间
   */
  _formatTime(time) {
    if (!time) return '--';
    var d = new Date(time);
    if (isNaN(d.getTime())) return '--';
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hour = String(d.getHours()).padStart(2, '0');
    var minute = String(d.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  }
});
