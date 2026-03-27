/**
 * 个人信息页面
 */
const accountService = require('../../utils/accountService.js');

Page({
  data: {
    // 用户信息
    userInfo: {
      nickname: '',
      avatar: '',
      phone: '',
      email: '',
      realName: '',
      openid: '',
      createTime: ''
    },

    // 编辑状态
    editing: false,
    editForm: {
      nickname: '',
      email: ''
    },

    // 加载状态
    loading: false,
    saving: false,
    isAvatarUploading: false
  },

  onLoad: function() {
    this.loadUserInfo();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo: function() {
    const self = this;

    // 先从本地存储获取
    const localUserInfo = wx.getStorageSync('userInfo') || {};

    this.setData({
      loading: true,
      userInfo: {
        nickname: localUserInfo.nickname || '',
        avatar: localUserInfo.avatar || '',
        phone: localUserInfo.phone || '',
        email: localUserInfo.email || '',
        realName: localUserInfo.realName || '',
        openid: localUserInfo.openid || '',
        createTime: localUserInfo.createTime || localUserInfo.loginTime || ''
      }
    });

    // 从后端获取最新信息
    accountService.getUserProfile()
      .then(function(res) {
        if (res.success && res.data) {
          const userData = res.data;
          self.setData({
            userInfo: {
              nickname: userData.nickname || userData.username || '',
              avatar: userData.avatar || '',
              phone: userData.phone || '',
              email: userData.email || '',
              realName: userData.realName || '',
              openid: userData.openid || '',
              createTime: userData.createTime || userData.createdAt || ''
            },
            loading: false
          });

          // 更新本地存储
          const storageInfo = wx.getStorageSync('userInfo') || {};
          wx.setStorageSync('userInfo', {
            ...storageInfo,
            nickname: userData.nickname || userData.username,
            avatar: userData.avatar,
            phone: userData.phone,
            email: userData.email
          });
        } else {
          self.setData({ loading: false });
        }
      })
      .catch(function(err) {
        console.error('获取用户信息失败:', err);
        self.setData({ loading: false });
      });
  },

  /**
   * 选择头像
   */
  onChooseAvatar: function(e) {
    const self = this;
    const { avatarUrl } = e.detail;

    if (!avatarUrl) return;

    this.setData({ isAvatarUploading: true });

    // 先更新本地预览
    this.setData({
      'userInfo.avatar': avatarUrl
    });

    // 上传到服务器
    accountService.updateUserProfile({ avatar: avatarUrl })
      .then(function(res) {
        if (res.success) {
          // 更新本地存储
          const storageInfo = wx.getStorageSync('userInfo') || {};
          storageInfo.avatar = res.data?.avatar || avatarUrl;
          wx.setStorageSync('userInfo', storageInfo);

          wx.showToast({ title: '头像已更新', icon: 'success' });
        } else {
          wx.showToast({ title: res.message || '更新失败', icon: 'none' });
        }
      })
      .catch(function(err) {
        console.error('上传头像失败:', err);
        wx.showToast({ title: '上传失败', icon: 'none' });
      })
      .finally(function() {
        self.setData({ isAvatarUploading: false });
      });
  },

  /**
   * 昵称修改
   */
  onNicknameChange: function(e) {
    const newNickname = e.detail.value.trim();
    if (!newNickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }

    if (newNickname === this.data.userInfo.nickname) return;

    const self = this;
    const oldNickname = this.data.userInfo.nickname;

    // 先更新本地
    this.setData({ 'userInfo.nickname': newNickname });

    // 更新到服务器
    accountService.updateUserProfile({ nickname: newNickname })
      .then(function(res) {
        if (res.success) {
          // 更新本地存储
          const storageInfo = wx.getStorageSync('userInfo') || {};
          storageInfo.nickname = newNickname;
          wx.setStorageSync('userInfo', storageInfo);

          wx.showToast({ title: '昵称已更新', icon: 'success' });
        } else {
          // 恢复旧昵称
          self.setData({ 'userInfo.nickname': oldNickname });
          wx.showToast({ title: res.message || '更新失败', icon: 'none' });
        }
      })
      .catch(function(err) {
        console.error('更新昵称失败:', err);
        self.setData({ 'userInfo.nickname': oldNickname });
        wx.showToast({ title: '更新失败', icon: 'none' });
      });
  },

  /**
   * 邮箱修改
   */
  onEmailChange: function(e) {
    const newEmail = e.detail.value.trim();

    // 邮箱格式验证
    if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      wx.showToast({ title: '邮箱格式不正确', icon: 'none' });
      return;
    }

    if (newEmail === this.data.userInfo.email) return;

    const self = this;
    const oldEmail = this.data.userInfo.email;

    this.setData({ 'userInfo.email': newEmail });

    accountService.updateUserProfile({ email: newEmail })
      .then(function(res) {
        if (res.success) {
          const storageInfo = wx.getStorageSync('userInfo') || {};
          storageInfo.email = newEmail;
          wx.setStorageSync('userInfo', storageInfo);

          wx.showToast({ title: '邮箱已更新', icon: 'success' });
        } else {
          self.setData({ 'userInfo.email': oldEmail });
          wx.showToast({ title: res.message || '更新失败', icon: 'none' });
        }
      })
      .catch(function(err) {
        console.error('更新邮箱失败:', err);
        self.setData({ 'userInfo.email': oldEmail });
        wx.showToast({ title: '更新失败', icon: 'none' });
      });
  },

  /**
   * 绑定手机号
   */
  bindPhone: function() {
    const self = this;

    if (this.data.userInfo.phone) {
      // 已绑定，显示操作选项
      wx.showActionSheet({
        itemList: ['更换手机号', '解绑手机号'],
        success: function(res) {
          if (res.tapIndex === 0) {
            // 更换手机号
            wx.navigateTo({
              url: '/pages/bind-phone/bind-phone?action=change'
            });
          } else if (res.tapIndex === 1) {
            // 解绑手机号
            wx.showModal({
              title: '解绑手机号',
              content: '解绑后可能影响账户安全，确定要解绑吗？',
              success: function(modalRes) {
                if (modalRes.confirm) {
                  self.unbindPhone();
                }
              }
            });
          }
        }
      });
    } else {
      // 未绑定，跳转绑定页面
      wx.navigateTo({
        url: '/pages/bind-phone/bind-phone?action=bind'
      });
    }
  },

  /**
   * 解绑手机号
   */
  unbindPhone: function() {
    const self = this;

    wx.showLoading({ title: '处理中' });

    accountService.updateUserProfile({ phone: '' })
      .then(function(res) {
        wx.hideLoading();
        if (res.success) {
          self.setData({ 'userInfo.phone': '' });
          wx.showToast({ title: '已解绑', icon: 'success' });
        } else {
          wx.showToast({ title: res.message || '解绑失败', icon: 'none' });
        }
      })
      .catch(function(err) {
        wx.hideLoading();
        console.error('解绑手机号失败:', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  },

  /**
   * 查看隐私政策
   */
  showPrivacyPolicy: function() {
    wx.navigateTo({
      url: '/pages/agreement/privacy-policy'
    });
  },

  /**
   * 查看用户协议
   */
  showUserAgreement: function() {
    wx.navigateTo({
      url: '/pages/agreement/user-agreement'
    });
  },

  /**
   * 头像加载错误
   */
  onAvatarError: function() {
    this.setData({
      'userInfo.avatar': ''
    });
  },

  /**
   * 格式化时间
   */
  _formatTime: function(time) {
    if (!time) return '--';
    const d = new Date(time);
    if (isNaN(d.getTime())) return '--';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
});