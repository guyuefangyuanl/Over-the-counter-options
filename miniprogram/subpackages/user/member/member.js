/**
 * 会员合作页面
 */
Page({
  data: {
    // 当前会员信息
    memberInfo: {
      currentLevel: 'V1',
      currentName: '普通会员',
      expiryDate: '',
      privileges: ['基础行情查看', '询价功能', '交易记录查看']
    },

    // 会员等级列表
    memberLevels: [
      {
        level: 'V1',
        name: '普通会员',
        minAmount: 0,
        color: '#909399',
        privileges: ['基础行情查看', '询价功能', '交易记录查看']
      },
      {
        level: 'V2',
        name: '银卡会员',
        minAmount: 50000,
        color: '#C0C0C0',
        privileges: ['实时行情推送', '专属客服', '优先询价处理', '高级分析工具']
      },
      {
        level: 'V3',
        name: '金卡会员',
        minAmount: 200000,
        color: '#FFD700',
        privileges: ['全部银卡权益', '专属投资顾问', '定制化服务', '费率优惠']
      },
      {
        level: 'V4',
        name: '钻石会员',
        minAmount: 500000,
        color: '#B9F2FF',
        privileges: ['全部金卡权益', '一对一专属服务', '定制化策略', '最低费率']
      }
    ],

    // 合作方案
    cooperationSchemes: [
      {
        id: 1,
        title: '机构合作',
        description: '为金融机构提供定制化期权交易解决方案',
        benefits: ['专属API接口', '定制化报告', '专属客户经理'],
        contact: '400-123-4567'
      },
      {
        id: 2,
        title: '企业服务',
        description: '为企业提供风险管理咨询服务',
        benefits: ['风险评估报告', '套期保值方案', '培训支持'],
        contact: '400-123-4568'
      }
    ],

    // 加载状态
    loading: false
  },

  onLoad: function() {
    this.loadMemberInfo();
  },

  /**
   * 加载会员信息
   */
  loadMemberInfo: function() {
    // 从本地存储获取用户信息
    const userInfo = wx.getStorageSync('userInfo') || {};
    const vipLevel = userInfo.vipLevel || 'V1';

    const levelMap = {
      'V1': { name: '普通会员', privileges: ['基础行情查看', '询价功能', '交易记录查看'] },
      'V2': { name: '银卡会员', privileges: ['实时行情推送', '专属客服', '优先询价处理', '高级分析工具'] },
      'V3': { name: '金卡会员', privileges: ['专属投资顾问', '定制化服务', '费率优惠', '高级分析工具'] },
      'V4': { name: '钻石会员', privileges: ['一对一专属服务', '定制化策略', '最低费率', '高级分析工具'] }
    };

    this.setData({
      'memberInfo.currentLevel': vipLevel,
      'memberInfo.currentName': levelMap[vipLevel]?.name || '普通会员',
      'memberInfo.privileges': levelMap[vipLevel]?.privileges || []
    });
  },

  /**
   * 选择会员等级查看详情
   */
  selectLevel: function(e) {
    const level = e.currentTarget.dataset.level;
    const levelInfo = this.data.memberLevels.find(function(item) {
      return item.level === level;
    });

    if (levelInfo) {
      const content = '升级条件: 交易金额满' + levelInfo.minAmount + '元\n' +
        '专属权益:\n' + levelInfo.privileges.map(function(p, i) {
          return (i + 1) + '. ' + p;
        }).join('\n');

      wx.showModal({
        title: levelInfo.name + ' (' + levelInfo.level + ')',
        content: content,
        confirmText: '立即升级',
        success: function(res) {
          if (res.confirm) {
            wx.showModal({
              title: '升级会员',
              content: '请联系客服 400-123-4567 进行会员升级',
              showCancel: false
            });
          }
        }
      });
    }
  },

  /**
   * 申请会员升级
   */
  applyMember: function() {
    wx.showModal({
      title: '会员升级',
      content: '请联系客服 400-123-4567 进行会员升级咨询',
      confirmText: '拨打客服',
      success: function(res) {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: '4001234567',
            fail: function() {
              wx.showToast({ title: '拨号失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  /**
   * 联系合作咨询
   */
  contactCooperation: function(e) {
    const phone = e.currentTarget.dataset.phone || '400-123-4567';

    wx.showModal({
      title: '联系咨询',
      content: '客服电话: ' + phone + '\n工作时间: 9:00-18:00',
      confirmText: '拨打',
      success: function(res) {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone.replace(/-/g, ''),
            fail: function() {
              wx.showToast({ title: '拨号失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  /**
   * 在线客服
   */
  contactService: function() {
    wx.showModal({
      title: '在线客服',
      content: '客服工作时间：9:00-18:00\n如需紧急联系，请拨打客服电话',
      showCancel: false
    });
  }
});