/**
 * WebSocket 进度管理器
 * 处理实时进度更新、连接状态管理和自动重连
 */

const { debounce } = require('./performance-optimizer.js');

// WebSocket 配置
const WS_CONFIG = {
  // 重连配置
  RECONNECT_INTERVAL: 3000,      // 重连间隔
  MAX_RECONNECT_ATTEMPTS: 5,     // 最大重连次数
  HEARTBEAT_INTERVAL: 30000,     // 心跳间隔

  // 超时配置
  CONNECTION_TIMEOUT: 10000,     // 连接超时
  MESSAGE_TIMEOUT: 60000,        // 消息超时

  // 消息类型
  MESSAGE_TYPES: {
    PROGRESS_UPDATE: 'progress_update',
    INQUIRY_UPDATE: 'inquiry_update',
    TRADE_UPDATE: 'trade_update',
    NOTIFICATION: 'notification',
    HEARTBEAT: 'heartbeat',
    HEARTBEAT_ACK: 'heartbeat_ack'
  }
};

// 连接状态
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting'
};

class WebSocketProgressManager {
  constructor() {
    // WebSocket 实例
    this.socketTask = null;

    // 连接状态
    this.state = ConnectionState.DISCONNECTED;

    // 重连计数
    this.reconnectAttempts = 0;

    // 心跳定时器
    this.heartbeatTimer = null;

    // 进度回调映射
    this.progressCallbacks = new Map();

    // 事件监听器
    this.eventListeners = new Map();

    // 消息队列（离线时暂存）
    this.messageQueue = [];

    // 初始化标志
    this.initialized = false;

    // 用户ID
    this.userId = null;

    // 服务器URL
    this.serverUrl = null;
  }

  /**
   * 初始化并连接
   * @param {string} serverUrl WebSocket服务器地址
   * @param {string} userId 用户ID
   */
  init(serverUrl, userId) {
    if (this.initialized) {
      console.log('[WebSocket] 已初始化，跳过');
      return;
    }

    this.serverUrl = serverUrl;
    this.userId = userId;
    this.initialized = true;

    this._connect();
  }

  /**
   * 建立连接
   */
  _connect() {
    if (this.state === ConnectionState.CONNECTING ||
        this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.state = ConnectionState.CONNECTING;

    try {
      // 构建 WebSocket URL
      const wsUrl = `${this.serverUrl}?userId=${this.userId}`;

      this.socketTask = wx.connectSocket({
        url: wsUrl,
        success: () => {
          console.log('[WebSocket] 连接请求已发送');
        },
        fail: (err) => {
          console.error('[WebSocket] 连接失败:', err);
          this._handleConnectionError(err);
        }
      });

      // 设置事件监听
      this._setupSocketListeners();

    } catch (e) {
      console.error('[WebSocket] 连接异常:', e);
      this._handleConnectionError(e);
    }
  }

  /**
   * 设置Socket事件监听
   */
  _setupSocketListeners() {
    if (!this.socketTask) return;

    // 连接打开
    wx.onSocketOpen(() => {
      console.log('[WebSocket] 连接已建立');
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;

      // 启动心跳
      this._startHeartbeat();

      // 发送队列中的消息
      this._flushMessageQueue();

      // 触发连接事件
      this._emit('connected');
    });

    // 接收消息
    wx.onSocketMessage((res) => {
      this._handleMessage(res.data);
    });

    // 连接关闭
    wx.onSocketClose((res) => {
      console.log('[WebSocket] 连接已关闭:', res.code, res.reason);
      this.state = ConnectionState.DISCONNECTED;
      this._stopHeartbeat();

      // 触发断开事件
      this._emit('disconnected', { code: res.code, reason: res.reason });

      // 尝试重连
      if (this.reconnectAttempts < WS_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        this._scheduleReconnect();
      }
    });

    // 连接错误
    wx.onSocketError((err) => {
      console.error('[WebSocket] 连接错误:', err);
      this._handleConnectionError(err);
    });
  }

  /**
   * 处理连接错误
   */
  _handleConnectionError(error) {
    this.state = ConnectionState.DISCONNECTED;
    this._emit('error', error);

    if (this.reconnectAttempts < WS_CONFIG.MAX_RECONNECT_ATTEMPTS) {
      this._scheduleReconnect();
    }
  }

  /**
   * 安排重连
   */
  _scheduleReconnect() {
    this.reconnectAttempts++;
    this.state = ConnectionState.RECONNECTING;

    const delay = WS_CONFIG.RECONNECT_INTERVAL * this.reconnectAttempts;

    console.log(`[WebSocket] 将在 ${delay}ms 后重连 (${this.reconnectAttempts}/${WS_CONFIG.MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      if (this.state === ConnectionState.RECONNECTING) {
        this._connect();
      }
    }, delay);
  }

  /**
   * 启动心跳
   */
  _startHeartbeat() {
    this._stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this._sendHeartbeat();
    }, WS_CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * 停止心跳
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 发送心跳
   */
  _sendHeartbeat() {
    if (this.state !== ConnectionState.CONNECTED) return;

    this.send({
      type: WS_CONFIG.MESSAGE_TYPES.HEARTBEAT,
      timestamp: Date.now()
    });
  }

  /**
   * 处理收到的消息
   */
  _handleMessage(data) {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data;

      switch (message.type) {
        case WS_CONFIG.MESSAGE_TYPES.PROGRESS_UPDATE:
          this._handleProgressUpdate(message);
          break;

        case WS_CONFIG.MESSAGE_TYPES.INQUIRY_UPDATE:
          this._handleInquiryUpdate(message);
          break;

        case WS_CONFIG.MESSAGE_TYPES.TRADE_UPDATE:
          this._handleTradeUpdate(message);
          break;

        case WS_CONFIG.MESSAGE_TYPES.NOTIFICATION:
          this._handleNotification(message);
          break;

        case WS_CONFIG.MESSAGE_TYPES.HEARTBEAT_ACK:
          // 心跳响应，无需处理
          break;

        default:
          console.log('[WebSocket] 未知消息类型:', message.type);
      }

    } catch (e) {
      console.error('[WebSocket] 解析消息失败:', e);
    }
  }

  /**
   * 处理进度更新
   */
  _handleProgressUpdate(message) {
    const { processId, progress, status, data } = message;

    // 查找并调用对应的回调
    const callback = this.progressCallbacks.get(processId);
    if (callback) {
      callback({ progress, status, data });
    }

    // 触发全局进度事件
    this._emit('progress', message);
  }

  /**
   * 处理询价更新
   */
  _handleInquiryUpdate(message) {
    this._emit('inquiry_update', message);
  }

  /**
   * 处理交易更新
   */
  _handleTradeUpdate(message) {
    this._emit('trade_update', message);
  }

  /**
   * 处理通知
   */
  _handleNotification(message) {
    this._emit('notification', message);

    // 显示本地通知
    if (message.title && message.content) {
      wx.showModal({
        title: message.title,
        content: message.content,
        showCancel: false
      });
    }
  }

  /**
   * 发送消息
   */
  send(message) {
    if (this.state !== ConnectionState.CONNECTED) {
      // 离线时加入队列
      this.messageQueue.push(message);
      return false;
    }

    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      wx.sendSocketMessage({
        data,
        success: () => {
          console.log('[WebSocket] 消息发送成功');
        },
        fail: (err) => {
          console.error('[WebSocket] 消息发送失败:', err);
        }
      });
      return true;
    } catch (e) {
      console.error('[WebSocket] 发送异常:', e);
      return false;
    }
  }

  /**
   * 发送队列中的消息
   */
  _flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.state === ConnectionState.CONNECTED) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }

  /**
   * 订阅进度更新
   * @param {string} processId 进程ID
   * @param {function} callback 回调函数
   */
  subscribeProgress(processId, callback) {
    this.progressCallbacks.set(processId, callback);

    // 发送订阅请求
    this.send({
      type: 'subscribe',
      processId,
      userId: this.userId
    });

    // 返回取消订阅函数
    return () => {
      this.unsubscribeProgress(processId);
    };
  }

  /**
   * 取消订阅进度
   */
  unsubscribeProgress(processId) {
    this.progressCallbacks.delete(processId);

    this.send({
      type: 'unsubscribe',
      processId,
      userId: this.userId
    });
  }

  /**
   * 添加事件监听
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * 移除事件监听
   */
  off(event, callback) {
    if (!this.eventListeners.has(event)) return;

    if (callback) {
      const callbacks = this.eventListeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    } else {
      this.eventListeners.delete(event);
    }
  }

  /**
   * 触发事件
   */
  _emit(event, data) {
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WebSocket] 事件回调执行失败: ${event}`, e);
        }
      });
    }
  }

  /**
   * 关闭连接
   */
  close() {
    this._stopHeartbeat();

    if (this.socketTask) {
      wx.closeSocket();
      this.socketTask = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.initialized = false;
    console.log('[WebSocket] 连接已关闭');
  }

  /**
   * 获取连接状态
   */
  getState() {
    return {
      state: this.state,
      isConnected: this.state === ConnectionState.CONNECTED,
      reconnectAttempts: this.reconnectAttempts,
      queueLength: this.messageQueue.length
    };
  }
}

// 创建单例
const wsProgressManager = new WebSocketProgressManager();

// 页面混入
const WebSocketProgressBehavior = Behavior({
  lifetimes: {
    attached() {
      // 页面加载时可以在这里初始化连接
    },

    detached() {
      // 页面卸载时清理订阅
      if (this._progressSubscriptions) {
        this._progressSubscriptions.forEach(unsub => unsub());
      }
    }
  },

  methods: {
    /**
     * 初始化WebSocket
     */
    initWebSocket(serverUrl, userId) {
      wsProgressManager.init(serverUrl, userId);
    },

    /**
     * 订阅进度更新
     */
    subscribeProgress(processId, callback) {
      if (!this._progressSubscriptions) {
        this._progressSubscriptions = [];
      }

      const unsubscribe = wsProgressManager.subscribeProgress(processId, callback);
      this._progressSubscriptions.push(unsubscribe);
      return unsubscribe;
    },

    /**
     * 监听WebSocket事件
     */
    onWebSocketEvent(event, callback) {
      wsProgressManager.on(event, callback);
    },

    /**
     * 获取WebSocket状态
     */
    getWebSocketState() {
      return wsProgressManager.getState();
    }
  }
});

module.exports = {
  WebSocketProgressManager,
  wsProgressManager,
  WebSocketProgressBehavior,
  WS_CONFIG,
  ConnectionState
};