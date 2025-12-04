// 消息通知系统
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.subscribers = [];
    this.init();
  }

  // 初始化
  init() {
    this.loadStoredNotifications();
  }

  // 添加通知
  addNotification(notification) {
    const newNotification = {
      id: Date.now().toString(),
      title: notification.title,
      content: notification.content,
      type: notification.type || 'info', // info, success, warning, error
      timestamp: new Date().toISOString(),
      read: false,
      priority: notification.priority || 'normal', // high, normal, low
      actionUrl: notification.actionUrl || null
    };

    this.notifications.unshift(newNotification);
    this.saveNotifications();
    this.notifySubscribers(newNotification);

    return newNotification;
  }

  // 价格预警通知
  addPriceAlert(optionData, alertCondition) {
    const notification = {
      title: '价格预警',
      content: `${optionData.optionType} 价格已${alertCondition.condition}${alertCondition.targetPrice}`,
      type: 'warning',
      priority: 'high',
      actionUrl: '/pages/quotes/quotes'
    };

    return this.addNotification(notification);
  }

  // 询价状态通知
  addInquiryStatusNotification(inquiryId, status) {
    const statusMap = {
      'quoted': '已收到报价',
      'confirmed': '询价已确认',
      'expired': '询价已过期'
    };

    const notification = {
      title: '询价更新',
      content: `询价 ${inquiryId} ${statusMap[status]}`,
      type: status === 'confirmed' ? 'success' : 'info',
      priority: status === 'quoted' ? 'high' : 'normal',
      actionUrl: '/pages/inquiry/inquiry'
    };

    return this.addNotification(notification);
  }

  // 系统公告通知
  addSystemAnnouncement(announcement) {
    const notification = {
      title: '系统公告',
      content: announcement.content,
      type: 'info',
      priority: announcement.priority || 'normal'
    };

    return this.addNotification(notification);
  }

  // 标记为已读
  markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.saveNotifications();
      this.notifySubscribers();
    }
  }

  // 全部标记为已读
  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.saveNotifications();
    this.notifySubscribers();
  }

  // 删除通知
  deleteNotification(notificationId) {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.saveNotifications();
    this.notifySubscribers();
  }

  // 清空所有通知
  clearAll() {
    this.notifications = [];
    this.saveNotifications();
    this.notifySubscribers();
  }

  // 获取未读通知数量
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // 获取通知列表
  getNotifications(filter = 'all') {
    switch (filter) {
      case 'unread':
        return this.notifications.filter(n => !n.read);
      case 'read':
        return this.notifications.filter(n => n.read);
      default:
        return this.notifications;
    }
  }

  // 订阅通知更新
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  // 通知订阅者
  notifySubscribers(newNotification = null) {
    this.subscribers.forEach(callback => {
      callback({
        notifications: this.notifications,
        unreadCount: this.getUnreadCount(),
        newNotification
      });
    });
  }

  // 保存通知到本地存储
  saveNotifications() {
    try {
      // 只保留最近100条通知
      const notificationsToSave = this.notifications.slice(0, 100);
      wx.setStorageSync('notifications', notificationsToSave);
    } catch (e) {
      console.error('保存通知失败:', e);
    }
  }

  // 从本地存储加载通知
  loadStoredNotifications() {
    try {
      const stored = wx.getStorageSync('notifications');
      if (stored && Array.isArray(stored)) {
        this.notifications = stored;
      }
    } catch (e) {
      console.error('加载通知失败:', e);
    }
  }

  // 模拟实时通知推送
  startMockPushService() {
    // 模拟每30秒推送一次价格预警
    this.pushTimer = setInterval(() => {
      if (Math.random() > 0.7) { // 30%概率触发
        this.mockPriceAlert();
      }
    }, 30000);
  }

  // 模拟价格预警
  mockPriceAlert() {
    const mockOptions = [
      { optionType: '平安银行看涨期权', strikePrice: '12.50' },
      { optionType: '万科A看跌期权', strikePrice: '9.00' },
      { optionType: '贵州茅台看涨期权', strikePrice: '1700.00' }
    ];

    const randomOption = mockOptions[Math.floor(Math.random() * mockOptions.length)];
    const alertTypes = ['突破', '跌破'];
    const randomAlert = alertTypes[Math.random() > 0.5 ? 0 : 1];

    this.addPriceAlert(randomOption, {
      condition: randomAlert,
      targetPrice: randomOption.strikePrice
    });
  }

  // 停止推送服务
  stopPushService() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }
  }
}

module.exports = NotificationManager;