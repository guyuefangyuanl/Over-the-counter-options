// 我的页面
const avatarUtils = require('../../utils/avatarUtils');
const accountService = require('../../utils/accountService');

Page({
  data: {
    userInfo: {
      isLoggedIn: false,
      nickname: '未登录',
      avatar: '',
      vipLevel: 'V1',
      vipId: '',
      memberType: '会员',
      openid: '',
      role: 'guest',
      isGuest: true
    },
    userStatistics: {
      totalInquiries: 0,
      successfulTrades: 0,
      favoriteStocks: 0,
      daysUsed: 1
    },
    menuItems: [
      {
        id: 'member',
        title: '会员合作',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMkMxMy4wOSA4IDIwIDlMMTMuMDkgMTUuNzRMMTIgMjJMMTAuOTEgMTUuNzRMNCA5TDEwLjkxIDhMMTIgMloiIHN0cm9rZT0iIzQwOUVGRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=',
        path: '/subpackages/user/member/member',
        showArrow: true
      },
      {
        id: 'profile',
        title: '个人信息',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIwIDIxVjE5QTQgNCAwIDAgMCAxNiAxNUg4QTQgNCAwIDAgMCA0IDE5VjIxIiBzdHJva2U9IiM0MDlFRkYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxjaXJjbGUgY3g9IjEyIiBjeT0iNyIgcj0iNCIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+',
        path: '/subpackages/user/user-info/user-info',
        showArrow: true
      },
      {
        id: 'orders',
        title: '我的订单',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iMyIgeT0iNCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPGxpbmUgeDE9IjE2IiB5MT0iMiIgeDI9IjE2IiB5Mj0iNiIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8bGluZSB4MT0iOCIgeTE9IjIiIHgyPSI4IiB5Mj0iNiIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8bGluZSB4MT0iMyIgeTE9IjEwIiB4Mj0iMjEiIHkyPSIxMCIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+',
        path: '/subpackages/user/orders/orders',
        showArrow: true
      },
      {
        id: 'inquiry-history',
        title: '询价记录',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDhWMTJMMTUgMTUiIHN0cm9rZT0iIzQwOUVGRiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iOSIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+',
        path: '/subpackages/user/inquiry-history/inquiry-history',
        showArrow: true
      },
      {
        id: 'service',
        title: '联系客服',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDExLjVDMjEgMTYuMTkgMTcuMTkgMjAgMTIuNSAyMEM3LjgxIDIwIDQgMTYuMTkgNCAxMS41QzQgNi44MSA3LjgxIDMgMTIuNSAzQzE3LjE5IDMgMjEgNi44MSAyMSAxMS41WiIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPHBhdGggZD0iTTggMTRDOC41NTIzIDE0IDkgMTMuNTUyMyA5IDEzQzkgMTIuNDQ3NyA4LjU1MjMgMTIgOCAxMkM3LjQ0NzcgMTIgNyAxMi40NDc3IDcgMTNDNyAxMy41NTIzIDcuNDQ3NyAxNCA4IDE0WiIgZmlsbD0iIzQwOUVGRiIvPgo8cGF0aCBkPSJNMTYgMTRDMTYuNTUyMyAxNCAxNyAxMy41NTIzIDE3IDEzQzE3IDEyLjQ0NzcgMTYuNTUyMyAxMiAxNiAxMkMxNS40NDc3IDEyIDE1IDEyLjQ0NzcgMTUgMTNDMTUgMTMuNTUyMyAxNS40NDc3IDE0IDE2IDE0WiIgZmlsbD0iIzQwOUVGRiIvPgo8cGF0aCBkPSJNOSAxOEM5LjUgMTguNSAxMSAxOSAxMi41IDE5QzE0IDE5IDE1LjUgMTguNSAxNiAxOCIgc3Ryb2tlPSIjNDA5RUZGIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4=',
        action: 'callService',
        showArrow: true
      },
      {
        id: 'suggestion',
        title: '功能建议',
        iconSrc: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTUuMDkgOC4yNkwyMiA5TDE2IDEzTDE3LjE4IDIwTDEyIDE2LjM1TDYuODIgMjBMOCAxM0wyIDlMOC45MSA4LjI2TDEyIDJaIiBzdHJva2U9IiM0MDlFRkYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==',
        path: '/subpackages/user/feedback/feedback',
        showArrow: true
      }
    ],
    systemInfo: {},
    // 加载状态
    isAvatarUploading: false,
    isLoggingIn: false,
    isLoggingOut: false,
    isPageLoading: false,
    // 防重复点击
    _lastTapTime: 0,
    _isFetchingProfile: false
  },

  onLoad: function (options) {
    console.log('我的页面加载');
    this.loadUserInfo();
    this.getSystemInfo();
  },

  onShow: function () {
    // 页面显示时刷新用户信息
    this.refreshUserInfo();

    // 确保 tabBar 正确显示
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  // 防重复点击
  _throttleTap: function(callback, delay = 500) {
    const now = Date.now();
    if (now - this.data._lastTapTime < delay) {
      return false;
    }
    this.data._lastTapTime = now;
    callback && callback();
    return true;
  },

  // 加载用户信息
  loadUserInfo: async function() {
    // 防止重复请求
    if (this.data._isFetchingProfile) return;
    this.data._isFetchingProfile = true;

    try {
      const token = wx.getStorageSync('token');
      if (!token) {
        // 无token，尝试从本地存储获取
        this.loadLocalUserInfo();
        this.data._isFetchingProfile = false;
        return;
      }

      // 从后端获取用户信息
      const result = await accountService.getUserProfile();
      console.log('[profile] 后端用户信息:', result);

      if (result && result.data) {
        const userData = result.data;
        const userRole = userData.role || 'user';
        const isGuest = userRole === 'guest';

        this.setData({
          'userInfo.isLoggedIn': true,
          'userInfo.nickname': userData.nickname || userData.username || '用户',
          'userInfo.avatar': userData.avatar || '',
          'userInfo.vipLevel': userData.vipLevel || 'V1',
          'userInfo.vipId': userData.vipId || userData.openid?.substring(0, 8) || '',
          'userInfo.memberType': userData.memberType || '会员',
          'userInfo.openid': userData.openid || '',
          'userInfo.role': userRole,
          'userInfo.isGuest': isGuest
        });

        // 同步到本地存储（保留完整的用户信息，包括 role）
        const existingUserInfo = wx.getStorageSync('userInfo') || {};
        wx.setStorageSync('userInfo', {
          ...existingUserInfo,
          nickname: userData.nickname || userData.username,
          avatar: userData.avatar,
          vipLevel: userData.vipLevel || 'V1',
          vipId: userData.vipId || userData.openid?.substring(0, 8),
          memberType: userData.memberType || '会员',
          openid: userData.openid,
          role: userRole,
          isGuest: isGuest
        });
      }
    } catch (error) {
      console.error('[profile] 获取用户信息失败:', error);
      // 降级到本地存储
      this.loadLocalUserInfo();
    } finally {
      this.data._isFetchingProfile = false;
    }
  },

  // 从本地存储加载用户信息
  loadLocalUserInfo: function() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      const token = wx.getStorageSync('token');

      if (userInfo && token) {
        const userRole = userInfo.role || 'user';
        const isGuest = userInfo.isGuest || userRole === 'guest';

        this.setData({
          'userInfo.isLoggedIn': true,
          'userInfo.nickname': userInfo.nickname || '用户',
          'userInfo.avatar': userInfo.avatar || '',
          'userInfo.vipLevel': userInfo.vipLevel || 'V1',
          'userInfo.vipId': userInfo.vipId || '',
          'userInfo.memberType': userInfo.memberType || '会员',
          'userInfo.openid': userInfo.openid || '',
          'userInfo.role': userRole,
          'userInfo.isGuest': isGuest
        });
      } else {
        // 清除无效数据
        this.setData({
          'userInfo.isLoggedIn': false,
          'userInfo.nickname': '未登录',
          'userInfo.avatar': '',
          'userInfo.vipId': '',
          'userInfo.role': 'guest',
          'userInfo.isGuest': true
        });
      }
    } catch (e) {
      console.error('[profile] 获取本地用户信息失败:', e);
    }
  },

  // 刷新用户信息
  refreshUserInfo: function() {
    this.loadUserInfo();
    if (this.data.userInfo.isLoggedIn) {
      this.loadUserStatistics();
    }
  },

  // 加载用户统计数据
  loadUserStatistics: async function() {
    const token = wx.getStorageSync('token');
    if (!token) return;

    try {
      const result = await accountService.getUserProfile();
      // 尝试获取统计数据，如果接口存在
      const stats = result?.data?.statistics || {};

      this.setData({
        userStatistics: {
          totalInquiries: stats.totalInquiries || 0,
          successfulTrades: stats.successfulTrades || 0,
          favoriteStocks: stats.favoriteStocks || 0,
          daysUsed: stats.daysUsed || 1
        }
      });
    } catch (error) {
      console.error('获取用户统计失败:', error);
      // 使用默认数据
    }
  },

  // 获取系统信息
  getSystemInfo: function() {
    Promise.all([
      new Promise(resolve => {
        wx.getSystemSetting({
          success: (res) => resolve({ systemSetting: res }),
          fail: () => resolve({ systemSetting: {} })
        });
      }),
      new Promise(resolve => {
        wx.getDeviceInfo({
          success: (res) => resolve({ deviceInfo: res }),
          fail: () => resolve({ deviceInfo: {} })
        });
      }),
      new Promise(resolve => {
        wx.getWindowInfo({
          success: (res) => resolve({ windowInfo: res }),
          fail: () => resolve({ windowInfo: {} })
        });
      }),
      new Promise(resolve => {
        wx.getAppBaseInfo({
          success: (res) => resolve({ appBaseInfo: res }),
          fail: () => resolve({ appBaseInfo: {} })
        });
      })
    ]).then(results => {
      const systemInfo = Object.assign({}, ...results);
      this.setData({ systemInfo });
    }).catch(err => {
      console.error('获取系统信息失败:', err);
    });
  },

  // 头像选择回调（微信 open-type="chooseAvatar"）
  onChooseAvatar: async function(e) {
    if (!this.data.userInfo.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const { avatarUrl } = e.detail;
    if (!avatarUrl) {
      console.warn('未获取到头像');
      return;
    }

    console.log('选择的头像临时路径:', avatarUrl);

    // 显示加载状态
    this.setData({ isAvatarUploading: true });

    try {
      // 验证头像文件
      const validation = avatarUtils.validateAvatarFile(avatarUrl);
      if (!validation.valid) {
        wx.showToast({ title: validation.message, icon: 'none' });
        this.setData({ isAvatarUploading: false });
        return;
      }

      // 压缩图片
      const compressedPath = await avatarUtils.compressImage(avatarUrl);

      // 先更新本地预览
      this.setData({
        'userInfo.avatar': compressedPath
      });

      // 尝试上传到服务器
      try {
        await this.uploadAvatarToServer(compressedPath);
        wx.showToast({ title: '头像已更新', icon: 'success' });
      } catch (uploadError) {
        console.error('上传头像失败:', uploadError);
        // 上传失败但本地已更新
        wx.showToast({ title: '头像已保存到本地', icon: 'none' });
      }
    } catch (error) {
      console.error('处理头像失败:', error);
      wx.showToast({ title: '头像处理失败', icon: 'none' });
    } finally {
      this.setData({ isAvatarUploading: false });
    }
  },

  // 上传头像到服务器
  uploadAvatarToServer: async function(tempFilePath) {
    try {
      const result = await accountService.updateUserProfile({ avatar: tempFilePath });
      console.log('头像上传结果:', result);

      if (result && result.data && result.data.avatar) {
        // 更新为服务器返回的头像URL
        this.setData({ 'userInfo.avatar': result.data.avatar });

        // 更新本地存储
        const userInfo = wx.getStorageSync('userInfo') || {};
        userInfo.avatar = result.data.avatar;
        wx.setStorageSync('userInfo', userInfo);
      }
      return result;
    } catch (error) {
      console.error('上传头像到服务器失败:', error);
      throw error;
    }
  },

  // 昵称修改回调
  onNicknameChange: async function(e) {
    if (!this.data.userInfo.isLoggedIn) {
      return;
    }

    const newNickname = e.detail.value?.trim();
    if (!newNickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }

    // 昵称未变化则不处理
    if (newNickname === this.data.userInfo.nickname) {
      return;
    }

    const oldNickname = this.data.userInfo.nickname;

    // 先更新本地
    this.setData({ 'userInfo.nickname': newNickname });

    try {
      // 更新到服务器
      await accountService.updateUserProfile({ nickname: newNickname });

      // 更新本地存储
      const userInfo = wx.getStorageSync('userInfo') || {};
      userInfo.nickname = newNickname;
      wx.setStorageSync('userInfo', userInfo);

      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (error) {
      console.error('更新昵称失败:', error);
      // 恢复旧昵称
      this.setData({ 'userInfo.nickname': oldNickname });
      wx.showToast({ title: '昵称更新失败', icon: 'none' });
    }
  },

  // 授权一键登录（跳转到登录页面）
  onLogin: function(e) {
    if (!this._throttleTap()) return;

    if (this.data.userInfo.isLoggedIn) {
      wx.showToast({ title: '您已登录', icon: 'none' });
      return;
    }

    if (this.data.isLoggingIn) return;

    this.setData({ isLoggingIn: true });

    wx.navigateTo({
      url: '/pages/login/login?type=wechat',
      complete: () => {
        this.setData({ isLoggingIn: false });
      }
    });
  },

  // 退出登录
  onLogout: function() {
    if (!this.data.userInfo.isLoggedIn || this.data.isLoggingOut) return;

    this.setData({ isLoggingOut: true });

    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('token');
          wx.removeStorageSync('refresh_token');

          this.setData({
            'userInfo.isLoggedIn': false,
            'userInfo.nickname': '未登录',
            'userInfo.avatar': '',
            'userInfo.vipLevel': 'V1',
            'userInfo.vipId': '',
            'userInfo.openid': ''
          });

          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
        this.setData({ isLoggingOut: false });
      },
      fail: () => {
        this.setData({ isLoggingOut: false });
      }
    });
  },

  // 菜单项点击
  onMenuTap: function(e) {
    if (!this._throttleTap()) return;

    const item = e.currentTarget.dataset.item;

    if (!this.data.userInfo.isLoggedIn && item.id !== 'service' && item.id !== 'suggestion') {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    // 检查是否是开发中的功能
    if (item.devMode) {
      wx.showModal({
        title: '功能开发中',
        content: `${item.title}功能正在开发中，敬请期待！`,
        showCancel: false
      });
      return;
    }

    switch (item.action) {
      case 'callService':
        this.callService();
        break;
      default:
        if (item.path) {
          if (this.isPageExists(item.path)) {
            wx.navigateTo({
              url: item.path,
              fail: (err) => {
                console.error('页面跳转失败:', err);
                wx.showToast({ title: '页面跳转失败', icon: 'none' });
              }
            });
          } else {
            wx.showToast({ title: '功能开发中', icon: 'none' });
          }
        }
        break;
    }
  },

  // 联系客服
  callService: function() {
    wx.showActionSheet({
      itemList: ['在线客服', '电话客服', '意见反馈'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            wx.showModal({
              title: '在线客服',
              content: '客服工作时间：9:00-18:00\n如需紧急联系，请拨打客服电话',
              showCancel: false
            });
            break;
          case 1:
            wx.showModal({
              title: '客服电话',
              content: '400-123-4567\n工作时间：9:00-18:00',
              confirmText: '拨打',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.makePhoneCall({ phoneNumber: '4001234567' });
                }
              }
            });
            break;
          case 2:
            this.openFeedback();
            break;
        }
      }
    });
  },

  // 打开意见反馈
  openFeedback: function() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  // 检查页面是否存在
  isPageExists: function(path) {
    const existingPages = [
      '/pages/index/index',
      '/pages/quotes/quotes',
      '/pages/calculator/calculator',
      '/pages/profile/profile',
      '/pages/login/login',
      '/pages/feedback/feedback',
      '/pages/agreement/user-agreement',
      '/pages/agreement/privacy-policy',
      '/subpackages/user/inquiry-history/inquiry-history',
      '/subpackages/user/position-history/position-history',
      '/subpackages/quotes/stock-detail/stock-detail',
      '/subpackages/quotes/search/search'
    ];
    return existingPages.includes(path);
  },

  // 头像加载错误处理
  onAvatarError: function(e) {
    console.warn('头像加载失败，使用默认头像');
    avatarUtils.onAvatarError(e, this, 'userInfo.avatar');
  },

  // 分享页面
  onShareAppMessage: function() {
    return {
      title: '场外期权交易平台 - 专业期权交易服务',
      path: '/pages/index/index',
      imageUrl: this.data.userInfo.avatar || ''
    };
  },

  // 分享到朋友圈
  onShareTimeline: function() {
    return {
      title: '场外期权交易平台 - 专业期权交易服务',
      query: '',
      imageUrl: ''
    };
  },

  // 下拉刷新
  onPullDownRefresh: async function() {
    try {
      await this.refreshUserInfo();
    } finally {
      wx.stopPullDownRefresh();
    }
  }
});