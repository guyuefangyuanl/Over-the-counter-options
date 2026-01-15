/**
 * 通知管理工具
 * 用于询价状态变更的实时通知
 */

interface NotificationOptions {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onClick?: () => void;
}

class NotificationManager {
  private listeners: Array<(notification: NotificationOptions) => void> = [];
  private unreadCount = 0;

  /**
   * 订阅通知
   */
  subscribe(listener: (notification: NotificationOptions) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * 发送通知
   */
  notify(options: NotificationOptions): void {
    this.unreadCount++;
    this.listeners.forEach((listener) => listener(options));
  }

  /**
   * 发送询价状态变更通知
   */
  notifyInquiryStatusChange(_inquiryId: string, newStatus: string, contactName: string): void {
    const statusMap: Record<string, string> = {
      pending: '待处理',
      processing: '处理中',
      completed: '已完成',
      rejected: '已拒绝',
    };

    this.notify({
      title: '询价状态变更',
      message: `${contactName}的询价已更新为${statusMap[newStatus] || newStatus}`,
      type: newStatus === 'completed' ? 'success' : newStatus === 'rejected' ? 'error' : 'info',
      duration: 4500,
    });
  }

  /**
   * 发送新询价通知
   */
  notifyNewInquiry(contactName: string, productName: string): void {
    this.notify({
      title: '新询价',
      message: `${contactName}提交了${productName}的询价请求`,
      type: 'info',
      duration: 6000,
    });
  }

  /**
   * 获取未读数量
   */
  getUnreadCount(): number {
    return this.unreadCount;
  }

  /**
   * 清除未读
   */
  clearUnread(): void {
    this.unreadCount = 0;
  }
}

export const notificationManager = new NotificationManager();
export default notificationManager;
