// 我的页面
const avatarUtils = require('../../utils/avatarUtils');

Page({
  data: {
    userInfo: {
      isLoggedIn: false,
      nickname: 'NickName',
      avatar: '',
      vipLevel: 'V1',
      vipId: '0000001',
      memberType: '会员'
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
        icon: 'member',
        path: '/pages/member/member',
        showArrow: true,
        devMode: true // 开发中，页面暂不存在
      },
      {
        id: 'profile',
        title: '个人信息', 
        icon: 'profile',
        path: '/pages/user-info/user-info',
        showArrow: true,
        devMode: true // 开发中，页面暂不存在
      },
      {
        id: 'service',
        title: '联系客服',
        icon: 'service',
        action: 'callService',
        showArrow: true
      },
      {
        id: 'suggestion',
        title: '功能建议',
        icon: 'suggestion',
        path: '/pages/feedback/feedback', // 修改为已存在的feedback页面
        showArrow: true
      }
    ],
    systemInfo: {}
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

  // 加载用户信息
  loadUserInfo: function() {
    // 尝试从本地存储获取用户信息
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.setData({
          'userInfo.isLoggedIn': true,
          'userInfo.nickname': userInfo.nickname || 'NickName',
          'userInfo.avatar': userInfo.avatar || '',
          'userInfo.vipLevel': userInfo.vipLevel || 'V1',
          'userInfo.vipId': userInfo.vipId || '0000001'
        });
      }
    } catch (e) {
      console.error('获取用户信息失败:', e);
    }
  },

  // 刷新用户信息
  refreshUserInfo: function() {
    if (this.data.userInfo.isLoggedIn) {
      // 刷新用户数据
      this.loadUserInfo();
      // 加载用户统计数据
      this.loadUserStatistics();
    }
  },

  // 加载用户统计数据
  loadUserStatistics: function() {
    const api = require('../../utils/api.js');
    
    api.get('/auth/user/statistics')
      .then(result => {
        console.log('用户统计数据:', result);
        if (result && result.data) {
          const stats = result.data;
          this.setData({
            userStatistics: {
              totalInquiries: stats.totalInquiries || 0,
              successfulTrades: stats.successfulTrades || 0,
              favoriteStocks: stats.favoriteStocks || 0,
              daysUsed: stats.daysUsed || 1
            }
          });
        }
      })
      .catch(error => {
        console.error('获取用户统计失败:', error);
        // 使用默认数据
        this.setData({
          userStatistics: {
            totalInquiries: 0,
            successfulTrades: 0,
            favoriteStocks: 0,
            daysUsed: 1
          }
        });
      });
  },

  // 获取系统信息
  getSystemInfo: function() {
    // 使用新的API替代已废弃的wx.getSystemInfo
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
      // 降级到旧API
      wx.getSystemInfo({
        success: (res) => {
          this.setData({ systemInfo: res });
        },
        fail: (err) => {
          console.error('获取系统信息失败:', err);
        }
      });
    });
  },

  // 授权一键登录（跳转到登录页面）
  onLogin: function(e) {
    if (this.data.userInfo.isLoggedIn) {
      wx.showToast({
        title: '您已登录',
        icon: 'none'
      });
      return;
    }

    wx.navigateTo({
      url: '/pages/login/login?type=wechat',
      success: () => {
        wx.showToast({
          title: '已打开登录页',
          icon: 'none'
        });
      },
      fail: (err) => {
        console.error('跳转登录页失败:', err);
        wx.showModal({
          title: '跳转失败',
          content: '无法打开登录页，请稍后重试',
          showCancel: false
        });
      }
    });
  },

  // 调用后端登录API
  callLoginAPI: function(code, userInfo) {
    const api = require('../../utils/api.js');
    
    // 调用后端登录接口
    api.post('/auth/wechat/login', {
      code: code,
      userInfo: userInfo
    })
    .then(result => {
      console.log('后端登录成功:', result);
      if (result && result.token) {
        // 保存token
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('refreshToken', result.refresh_token);
        console.log('登录凭证已保存');
      }
    })
    .catch(error => {
      console.error('后端登录失败:', error);
      // 登录失败不影响本地登录流程，但会提示用户
      wx.showToast({
        title: '服务器连接失败，使用本地登录',
        icon: 'none',
        duration: 2000
      });
    });
  },

  // 退出登录
  onLogout: function() {
    if (!this.data.userInfo.isLoggedIn) {
      return;
    }

    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 清除本地存储
          wx.removeStorageSync('userInfo');
          
          this.setData({
            'userInfo.isLoggedIn': false,
            'userInfo.nickname': 'NickName',
            'userInfo.avatar': '',
            'userInfo.vipLevel': 'V1',
            'userInfo.vipId': '0000001'
          });

          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
        }
      }
    });
  },

  // 菜单项点击
  onMenuTap: function(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!this.data.userInfo.isLoggedIn && item.id !== 'service') {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    // 检查是否是开发中的功能
    if (item.devMode) {
      wx.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
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
              url: item.path
            });
          } else {
            wx.showToast({
              title: '功能开发中',
              icon: 'none'
            });
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
            // 在线客服
            wx.showModal({
              title: '在线客服',
              content: '客服工作时间：9:00-18:00\n如需紧急联系，请拨打客服电话',
              showCancel: false
            });
            break;
          case 1:
            // 电话客服
            wx.showModal({
              title: '客服电话',
              content: '400-123-4567\n工作时间：9:00-18:00',
              confirmText: '拨打',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.makePhoneCall({
                    phoneNumber: '4001234567'
                  });
                }
              }
            });
            break;
          case 2:
            // 意见反馈
            this.openFeedback();
            break;
        }
      }
    });
  },

  // 打开意见反馈
  openFeedback: function() {
    wx.navigateTo({
      url: '/pages/feedback/feedback'
    });
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
      '/pages/inquiry/inquiry',
      '/pages/position/position',
      '/pages/search/search',
      '/pages/search-stock/search-stock',
      '/pages/stock-detail/stock-detail',
      '/pages/account/account',
      '/pages/workbench/workbench',
      '/pages/quote/quote',
      '/pages/chart/chart',
      '/pages/data-explanation/data-explanation',
      '/pages/option-matrix/option-matrix'
    ];
    return existingPages.includes(path);
  },

  // 头像加载错误处理
  onAvatarError: function(e) {
    console.warn('头像加载失败，使用默认头像');
    avatarUtils.onAvatarError(e, this, 'userInfo.avatar');
  },

  // 头像点击 - 跳转到登录页面
  onAvatarTap: function(e) {
    // 检查是否是有效的用户手势
    if (!e || e.type !== 'tap') {
      return;
    }
    
    if (!this.data.userInfo.isLoggedIn) {
      // 跳转到登录页面
      wx.navigateTo({
        url: '/pages/login/login?type=wechat'
      });
      return;
    }

    wx.showActionSheet({
      itemList: ['查看头像', '更换头像'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            // 查看头像
            if (this.data.userInfo.avatar) {
              wx.previewImage({
                urls: [this.data.userInfo.avatar]
              });
            } else {
              wx.showToast({
                title: '暂无头像',
                icon: 'none'
              });
            }
            break;
          case 1:
            // 更换头像
            this.changeAvatar();
            break;
        }
      }
    });
  },

  // 更换头像
  changeAvatar: function() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // 这里应该上传到服务器，现在只是本地预览
        this.setData({
          'userInfo.avatar': tempFilePath
        });

        // 更新本地存储
        const userInfo = wx.getStorageSync('userInfo') || {};
        userInfo.avatar = tempFilePath;
        wx.setStorageSync('userInfo', userInfo);

        wx.showToast({
          title: '头像已更新',
          icon: 'success'
        });
      }
    });
  },

  // 分享页面
  onShareAppMessage: function() {
    return {
      title: '场外期权交易平台',
      path: '/pages/index/index'
    };
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.refreshUserInfo();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  }
});
