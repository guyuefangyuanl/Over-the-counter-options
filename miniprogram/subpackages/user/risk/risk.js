/**
 * 风险管理页面
 */
const orderService = require('../../utils/orderService.js');

// 风险等级定义
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  VERY_HIGH: 'very_high'
};

// 风险等级映射
const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  very_high: '极高风险'
};

// 风险颜色映射
const RISK_COLORS = {
  low: '#67C23A',
  medium: '#E6A23C',
  high: '#F56C6C',
  very_high: '#C45656'
};

Page({
  data: {
    // 风险评估结果
    riskAssessment: {
      riskLevel: 'medium',
      riskLevelText: '中风险',
      riskLevelColor: '#E6A23C',
      riskScore: 50,
      totalExposure: 0,
      totalPnL: 0,
      positionCount: 0,
      concentrationRisk: 0,
      availableBalance: 0,
      totalAsset: 0
    },

    // 风险预警列表
    riskWarnings: [],

    // 风险建议
    recommendations: [],

    // 持仓分布
    positionDistribution: [],

    // 加载状态
    loading: false,
    error: false,

    // 刷新时间
    lastRefreshTime: ''
  },

  onLoad: function() {
    this.loadRiskData();
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.loadRiskData().finally(function() {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载风险数据
   */
  loadRiskData: function() {
    const self = this;

    this.setData({ loading: true, error: false });

    return Promise.all([
      this.loadRiskAssessment(),
      this.loadRiskWarnings()
    ]).finally(function() {
      self.setData({
        loading: false,
        lastRefreshTime: self._formatTime(new Date())
      });
    });
  },

  /**
   * 加载风险评估
   */
  loadRiskAssessment: function() {
    const self = this;

    return orderService.getRiskAssessment()
      .then(function(res) {
        if (res.success && res.data) {
          const data = res.data;
          const level = data.riskLevel || 'medium';

          self.setData({
            riskAssessment: {
              riskLevel: level,
              riskLevelText: RISK_LABELS[level] || '中风险',
              riskLevelColor: RISK_COLORS[level] || '#E6A23C',
              riskScore: data.riskScore || 50,
              totalExposure: data.totalExposure || 0,
              totalPnL: data.totalPnL || 0,
              positionCount: data.positionCount || 0,
              concentrationRisk: data.concentrationRisk || 0,
              availableBalance: data.availableBalance || 0,
              totalAsset: data.totalAsset || 0
            },
            recommendations: data.recommendations || []
          });
        }
      })
      .catch(function(err) {
        console.error('加载风险评估失败:', err);
        // 使用模拟数据
        self.setData({
          riskAssessment: {
            riskLevel: 'medium',
            riskLevelText: '中风险',
            riskLevelColor: '#E6A23C',
            riskScore: 45,
            totalExposure: 1500000,
            totalPnL: -37999.31,
            positionCount: 5,
            concentrationRisk: 35,
            availableBalance: 3500000,
            totalAsset: 5000000
          },
          recommendations: [
            '建议分散投资，降低单一标的集中度',
            '关注近期到期的持仓，提前做好平仓或展期准备',
            '当前市场波动较大，建议适当降低仓位'
          ]
        });
      });
  },

  /**
   * 加载风险预警
   */
  loadRiskWarnings: function() {
    const self = this;

    return orderService.getRiskWarnings()
      .then(function(res) {
        if (res.success && res.data) {
          self.setData({
            riskWarnings: res.data.list || res.data || []
          });
        }
      })
      .catch(function(err) {
        console.error('加载风险预警失败:', err);
        // 使用模拟数据
        self.setData({
          riskWarnings: [
            {
              level: 'warning',
              title: '持仓集中度较高',
              content: '单一标的持仓占比超过30%，建议分散投资',
              time: new Date().toISOString()
            },
            {
              level: 'info',
              title: '持仓即将到期',
              content: '有2笔持仓将在7天内到期，请提前做好决策',
              time: new Date().toISOString()
            }
          ]
        });
      });
  },

  /**
   * 刷新风险评估
   */
  refreshAssessment: function() {
    wx.showLoading({ title: '评估中' });

    this.loadRiskData()
      .then(function() {
        wx.hideLoading();
        wx.showToast({ title: '评估完成', icon: 'success' });
      })
      .catch(function() {
        wx.hideLoading();
        wx.showToast({ title: '评估失败', icon: 'none' });
      });
  },

  /**
   * 跳转到持仓详情
   */
  goToPosition: function() {
    wx.switchTab({
      url: '/pages/account/account'
    });
  },

  /**
   * 格式化金额
   */
  _formatAmount: function(amount) {
    if (amount === null || amount === undefined) return '--';
    if (Math.abs(amount) >= 100000000) {
      return (amount / 100000000).toFixed(2) + '亿';
    } else if (Math.abs(amount) >= 10000) {
      return (amount / 10000).toFixed(2) + '万';
    }
    return Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  },

  /**
   * 格式化时间
   */
  _formatTime: function(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
  }
});