/**
 * 登录历史记录页面
 * 展示用户的登录历史、设备管理和安全统计
 */
const accountService = require('../../../utils/accountService.js');

Page({
  data: {
    // 登录历史记录列表
    loginHistory: [],
    
    // 分页信息
    pagination: {
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0
    },
    
    // 统计信息
    statistics: {
      total_logins_30d: 0,
      successful_logins_30d: 0,
      failed_logins_30d: 0,
      unique_ips_30d: 0,
      unique_devices_30d: 0,
      most_common_login_type: '',
      last_login: null
    },
    
    // 登录设备列表
    sessions: [],
    
    // 加载状态
    loading: false,
    loadingMore: false,
    refreshing: false,
    
    // 当前显示的标签页
    activeTab: 'history', // 'history' | 'devices'
    
    // 登录类型映射
    loginTypeMap: {
      'wechat': '微信登录',
      'phone': '手机登录',
      'email': '邮箱登录',
      'admin': '管理员登录',
      'guest': '游客登录',
      'unknown': '未知'
    },
    
    // 登录状态映射
    statusMap: {
      'success': '成功',
      'failed': '失败'
    }
  },

  onLoad: function(options) {
    this.loadData();
  },

  onShow: function() {
    // 页面显示时刷新数据
    if (this.data.loginHistory.length > 0) {
      this.refreshData();
    }
  },

  /**
   * 加载所有数据
   */
  loadData: function() {
    this.setData({ loading: true });
    
    Promise.all([
      this.loadLoginHistory(),
      this.loadSessions()
    ]).finally(() => {
      this.setData({ loading: false });
    });
  },

  /**
   * 刷新所有数据
   */
  refreshData: function() {
    this.setData({ refreshing: true });
    
    // 重置分页
    this.setData({
      'pagination.page': 1,
      loginHistory: []
    });
    
    Promise.all([
      this.loadLoginHistory(),
      this.loadSessions()
    ]).finally(() => {
      this.setData({ refreshing: false });
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载登录历史记录
   */
  loadLoginHistory: function() {
    const self = this;
    const { page, pageSize } = this.data.pagination;
    
    return accountService.getLoginHistory(page, pageSize)
      .then(function(res) {
        if (res.success && res.data) {
          const history = res.data.history || [];
          const pagination = res.data.pagination || {};
          const statistics = res.data.statistics || {};
          
          // 处理历史记录，格式化时间和状态
          const processedHistory = history.map(function(item) {
            return {
              ...item,
              login_time_formatted: self.formatTime(item.login_time),
              login_type_text: self.data.loginTypeMap[item.login_type] || '未知',
              status_text: self.data.statusMap[item.status] || '未知',
              session_duration_text: self.formatDuration(item.session_duration)
            };
          });
          
          self.setData({
            loginHistory: self.data.loginHistory.concat(processedHistory),
            pagination: {
              page: pagination.page || 1,
              pageSize: pagination.pageSize || 10,
              total: pagination.total || 0,
              totalPages: pagination.totalPages || 0
            },
            statistics: statistics
          });
        }
      })
      .catch(function(err) {
        console.error('获取登录历史失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  /**
   * 加载登录设备列表
   */
  loadSessions: function() {
    const self = this;
    
    return accountService.getSessions()
      .then(function(res) {
        if (res.success && res.data) {
          const sessions = res.data.sessions || [];
          
          // 处理会话数据
          const processedSessions = sessions.map(function(session) {
            return {
              ...session,
              created_at_formatted: self.formatTime(session.created_at),
              is_current_device: session.is_current
            };
          });
          
          self.setData({
            sessions: processedSessions
          });
        }
      })
      .catch(function(err) {
        console.error('获取登录设备失败:', err);
      });
  },

  /**
   * 加载更多历史记录
   */
  loadMore: function() {
    const { page, totalPages } = this.data.pagination;
    
    if (page >= totalPages) {
      wx.showToast({
        title: '没有更多数据了',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      'pagination.page': page + 1,
      loadingMore: true
    });
    
    this.loadLoginHistory().finally(() => {
      this.setData({ loadingMore: false });
    });
  },

  /**
   * 切换标签页
   */
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  /**
   * 撤销指定设备
   */
  revokeDevice: function(e) {
    const self = this;
    const sessionId = e.currentTarget.dataset.id;
    const deviceInfo = e.currentTarget.dataset.device || '该设备';
    
    wx.showModal({
      title: '确认登出',
      content: `确定要登出 ${deviceInfo} 吗？`,
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          
          accountService.revokeSession(sessionId)
            .then(function(res) {
              wx.hideLoading();
              
              if (res.success) {
                wx.showToast({
                  title: '已登出',
                  icon: 'success'
                });
                
                // 刷新设备列表
                self.loadSessions();
              } else {
                wx.showToast({
                  title: res.message || '操作失败',
                  icon: 'none'
                });
              }
            })
            .catch(function(err) {
              wx.hideLoading();
              wx.showToast({
                title: '操作失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  /**
   * 撤销所有其他设备
   */
  revokeAllDevices: function() {
    const self = this;
    
    wx.showModal({
      title: '确认登出',
      content: '确定要登出所有其他设备吗？此操作不可撤销。',
      confirmText: '全部登出',
      confirmColor: '#ff4d4f',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          
          accountService.revokeAllSessions()
            .then(function(res) {
              wx.hideLoading();
              
              if (res.success) {
                const count = res.data?.revoked_count || 0;
                wx.showToast({
                  title: `已登出${count}个设备`,
                  icon: 'success'
                });
                
                // 刷新设备列表
                self.loadSessions();
              } else {
                wx.showToast({
                  title: res.message || '操作失败',
                  icon: 'none'
                });
              }
            })
            .catch(function(err) {
              wx.hideLoading();
              wx.showToast({
                title: '操作失败',
                icon: 'none'
              });
            });
        }
      }
    });
  },

  /**
   * 格式化时间
   */
  formatTime: function(timeStr) {
    if (!timeStr) return '-';
    
    try {
      const date = new Date(timeStr);
      const now = new Date();
      const diff = now - date;
      
      // 小于1分钟
      if (diff < 60000) {
        return '刚刚';
      }
      
      // 小于1小时
      if (diff < 3600000) {
        return Math.floor(diff / 60000) + '分钟前';
      }
      
      // 小于24小时
      if (diff < 86400000) {
        return Math.floor(diff / 3600000) + '小时前';
      }
      
      // 小于7天
      if (diff < 604800000) {
        return Math.floor(diff / 86400000) + '天前';
      }
      
      // 超过7天，显示具体日期
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      if (year === now.getFullYear()) {
        return `${month}-${day} ${hours}:${minutes}`;
      } else {
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      return timeStr;
    }
  },

  /**
   * 格式化会话时长
   */
  formatDuration: function(seconds) {
    if (!seconds || seconds <= 0) return '-';
    
    if (seconds < 60) {
      return `${seconds}秒`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}分钟`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}小时${minutes}分钟`;
    } else {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return `${days}天${hours}小时`;
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    this.refreshData();
  },

  /**
   * 触底加载更多
   */
  onReachBottom: function() {
    if (this.data.activeTab === 'history') {
      this.loadMore();
    }
  },

  /**
   * 分享
   */
  onShareAppMessage: function() {
    return {
      title: '登录历史 - 场外期权交易',
      path: '/pages/index/index'
    };
  }
});