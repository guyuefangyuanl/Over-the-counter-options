/**
 * Socket.IO管理器
 * 处理实时通信，包括报价推送、交易通知等
 */

class SocketManager {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // 存储用户连接信息
    this.rooms = new Map(); // 存储房间信息
    this.setupEventHandlers();
  }

  /**
   * 设置Socket.IO事件处理器
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 客户端连接: ${socket.id}`);
      
      // 用户认证
      socket.on('authenticate', (data) => {
        this.handleAuthenticate(socket, data);
      });

      // 加入用户房间
      socket.on('join_user_room', (data) => {
        this.handleJoinUserRoom(socket, data);
      });

      // 订阅市场数据
      socket.on('subscribe_market_data', (data) => {
        this.handleSubscribeMarketData(socket, data);
      });

      // 取消订阅市场数据
      socket.on('unsubscribe_market_data', (data) => {
        this.handleUnsubscribeMarketData(socket, data);
      });

      // 订阅询价通知
      socket.on('subscribe_inquiries', (data) => {
        this.handleSubscribeInquiries(socket, data);
      });

      // 订阅交易通知
      socket.on('subscribe_trades', (data) => {
        this.handleSubscribeTrades(socket, data);
      });

      // 心跳检测
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // 断开连接
      socket.on('disconnect', (reason) => {
        this.handleDisconnect(socket, reason);
      });

      // 错误处理
      socket.on('error', (error) => {
        console.error(`Socket错误 ${socket.id}:`, error);
      });
    });

    console.log('✅ Socket.IO事件处理器已设置');
  }

  /**
   * 处理用户认证
   * @param {object} socket Socket实例
   * @param {object} data 认证数据
   */
  handleAuthenticate(socket, data) {
    try {
      const { token, userId } = data;
      
      if (!token || !userId) {
        socket.emit('auth_error', {
          message: '认证信息不完整',
          code: 'INCOMPLETE_AUTH_INFO'
        });
        return;
      }

      // TODO: 验证JWT token
      // 这里简化处理，实际应该验证token的有效性
      
      // 存储用户连接信息
      this.connectedUsers.set(socket.id, {
        userId,
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      // 加入用户专属房间
      socket.join(`user_${userId}`);
      
      socket.emit('auth_success', {
        message: '认证成功',
        userId,
        socketId: socket.id
      });

      console.log(`✅ 用户认证成功: ${userId} (${socket.id})`);

    } catch (error) {
      console.error('用户认证失败:', error);
      socket.emit('auth_error', {
        message: '认证失败',
        code: 'AUTH_FAILED'
      });
    }
  }

  /**
   * 处理加入用户房间
   * @param {object} socket Socket实例
   * @param {object} data 房间数据
   */
  handleJoinUserRoom(socket, data) {
    try {
      const { roomId } = data;
      const userInfo = this.connectedUsers.get(socket.id);
      
      if (!userInfo) {
        socket.emit('error', {
          message: '请先完成认证',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      socket.join(roomId);
      
      // 更新房间信息
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId).add(socket.id);

      socket.emit('room_joined', {
        roomId,
        message: '成功加入房间'
      });

      console.log(`用户 ${userInfo.userId} 加入房间: ${roomId}`);

    } catch (error) {
      console.error('加入房间失败:', error);
      socket.emit('error', {
        message: '加入房间失败',
        code: 'JOIN_ROOM_FAILED'
      });
    }
  }

  /**
   * 处理订阅市场数据
   * @param {object} socket Socket实例
   * @param {object} data 订阅数据
   */
  handleSubscribeMarketData(socket, data) {
    try {
      const { symbols } = data;
      const userInfo = this.connectedUsers.get(socket.id);
      
      if (!userInfo) {
        socket.emit('error', {
          message: '请先完成认证',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      // 加入市场数据房间
      if (Array.isArray(symbols)) {
        symbols.forEach(symbol => {
          socket.join(`market_${symbol}`);
        });
      } else {
        socket.join('market_all');
      }

      socket.emit('market_data_subscribed', {
        symbols: symbols || 'all',
        message: '市场数据订阅成功'
      });

      console.log(`用户 ${userInfo.userId} 订阅市场数据:`, symbols || 'all');

    } catch (error) {
      console.error('订阅市场数据失败:', error);
      socket.emit('error', {
        message: '订阅市场数据失败',
        code: 'SUBSCRIBE_MARKET_DATA_FAILED'
      });
    }
  }

  /**
   * 处理取消订阅市场数据
   * @param {object} socket Socket实例
   * @param {object} data 取消订阅数据
   */
  handleUnsubscribeMarketData(socket, data) {
    try {
      const { symbols } = data;
      
      // 离开市场数据房间
      if (Array.isArray(symbols)) {
        symbols.forEach(symbol => {
          socket.leave(`market_${symbol}`);
        });
      } else {
        socket.leave('market_all');
      }

      socket.emit('market_data_unsubscribed', {
        symbols: symbols || 'all',
        message: '市场数据取消订阅成功'
      });

    } catch (error) {
      console.error('取消订阅市场数据失败:', error);
      socket.emit('error', {
        message: '取消订阅市场数据失败',
        code: 'UNSUBSCRIBE_MARKET_DATA_FAILED'
      });
    }
  }

  /**
   * 处理订阅询价通知
   * @param {object} socket Socket实例
   * @param {object} data 订阅数据
   */
  handleSubscribeInquiries(socket, data) {
    try {
      const userInfo = this.connectedUsers.get(socket.id);
      
      if (!userInfo) {
        socket.emit('error', {
          message: '请先完成认证',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      socket.join(`inquiries_${userInfo.userId}`);
      
      socket.emit('inquiries_subscribed', {
        message: '询价通知订阅成功'
      });

    } catch (error) {
      console.error('订阅询价通知失败:', error);
      socket.emit('error', {
        message: '订阅询价通知失败',
        code: 'SUBSCRIBE_INQUIRIES_FAILED'
      });
    }
  }

  /**
   * 处理订阅交易通知
   * @param {object} socket Socket实例
   * @param {object} data 订阅数据
   */
  handleSubscribeTrades(socket, data) {
    try {
      const userInfo = this.connectedUsers.get(socket.id);
      
      if (!userInfo) {
        socket.emit('error', {
          message: '请先完成认证',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      socket.join(`trades_${userInfo.userId}`);
      
      socket.emit('trades_subscribed', {
        message: '交易通知订阅成功'
      });

    } catch (error) {
      console.error('订阅交易通知失败:', error);
      socket.emit('error', {
        message: '订阅交易通知失败',
        code: 'SUBSCRIBE_TRADES_FAILED'
      });
    }
  }

  /**
   * 处理断开连接
   * @param {object} socket Socket实例
   * @param {string} reason 断开原因
   */
  handleDisconnect(socket, reason) {
    try {
      const userInfo = this.connectedUsers.get(socket.id);
      
      if (userInfo) {
        console.log(`❌ 用户断开连接: ${userInfo.userId} (${socket.id}) - ${reason}`);
        
        // 清理房间信息
        for (const [roomId, sockets] of this.rooms.entries()) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.rooms.delete(roomId);
          }
        }
        
        // 删除用户连接信息
        this.connectedUsers.delete(socket.id);
      } else {
        console.log(`❌ 客户端断开连接: ${socket.id} - ${reason}`);
      }

    } catch (error) {
      console.error('处理断开连接失败:', error);
    }
  }

  /**
   * 向特定用户发送消息
   * @param {string} userId 用户ID
   * @param {string} event 事件名称
   * @param {object} data 消息数据
   */
  sendToUser(userId, event, data) {
    try {
      this.io.to(`user_${userId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`向用户 ${userId} 发送消息失败:`, error);
    }
  }

  /**
   * 向房间发送消息
   * @param {string} roomId 房间ID
   * @param {string} event 事件名称
   * @param {object} data 消息数据
   */
  sendToRoom(roomId, event, data) {
    try {
      this.io.to(roomId).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`向房间 ${roomId} 发送消息失败:`, error);
    }
  }

  /**
   * 广播消息给所有连接的客户端
   * @param {string} event 事件名称
   * @param {object} data 消息数据
   */
  broadcast(event, data) {
    try {
      this.io.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('广播消息失败:', error);
    }
  }

  /**
   * 推送市场数据更新
   * @param {object} marketData 市场数据
   */
  pushMarketDataUpdate(marketData) {
    try {
      // 向订阅了该股票的用户推送
      if (marketData.symbol) {
        this.sendToRoom(`market_${marketData.symbol}`, 'market_data_update', marketData);
      }
      
      // 向订阅了所有市场数据的用户推送
      this.sendToRoom('market_all', 'market_data_update', marketData);
    } catch (error) {
      console.error('推送市场数据更新失败:', error);
    }
  }

  /**
   * 推送报价通知
   * @param {string} userId 用户ID
   * @param {object} quote 报价数据
   */
  pushQuoteNotification(userId, quote) {
    try {
      this.sendToUser(userId, 'quote_received', {
        inquiryId: quote.inquiryId,
        dealerName: quote.dealerName,
        premium: quote.premium,
        validUntil: quote.validUntil,
        quote
      });
    } catch (error) {
      console.error('推送报价通知失败:', error);
    }
  }

  /**
   * 推送交易通知
   * @param {string} userId 用户ID
   * @param {object} trade 交易数据
   */
  pushTradeNotification(userId, trade) {
    try {
      this.sendToUser(userId, 'trade_update', {
        tradeId: trade.tradeId,
        status: trade.status,
        message: this.getTradeStatusMessage(trade.status),
        trade
      });
    } catch (error) {
      console.error('推送交易通知失败:', error);
    }
  }

  /**
   * 推送风险警告
   * @param {string} userId 用户ID
   * @param {object} riskAlert 风险警告
   */
  pushRiskAlert(userId, riskAlert) {
    try {
      this.sendToUser(userId, 'risk_alert', {
        level: riskAlert.level,
        message: riskAlert.message,
        type: riskAlert.type,
        action: riskAlert.action,
        riskAlert
      });
    } catch (error) {
      console.error('推送风险警告失败:', error);
    }
  }

  /**
   * 推送系统通知
   * @param {string} userId 用户ID
   * @param {object} notification 系统通知
   */
  pushSystemNotification(userId, notification) {
    try {
      this.sendToUser(userId, 'system_notification', {
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        notification
      });
    } catch (error) {
      console.error('推送系统通知失败:', error);
    }
  }

  /**
   * 获取交易状态消息
   * @param {string} status 交易状态
   * @returns {string} 状态消息
   */
  getTradeStatusMessage(status) {
    const messages = {
      'pending': '交易待确认',
      'confirmed': '交易已确认',
      'settled': '交易已结算',
      'exercised': '期权已行权',
      'expired': '期权已到期',
      'cancelled': '交易已取消'
    };
    return messages[status] || '交易状态更新';
  }

  /**
   * 获取连接统计信息
   * @returns {object} 连接统计
   */
  getConnectionStats() {
    return {
      totalConnections: this.connectedUsers.size,
      totalRooms: this.rooms.size,
      connectedUsers: Array.from(this.connectedUsers.values()).map(user => ({
        userId: user.userId,
        connectedAt: user.connectedAt,
        lastActivity: user.lastActivity
      })),
      rooms: Array.from(this.rooms.entries()).map(([roomId, sockets]) => ({
        roomId,
        connections: sockets.size
      }))
    };
  }

  /**
   * 清理非活跃连接
   * @param {number} maxIdleTime 最大空闲时间（毫秒）
   */
  cleanupInactiveConnections(maxIdleTime = 30 * 60 * 1000) { // 30分钟
    try {
      const now = Date.now();
      const toRemove = [];

      for (const [socketId, userInfo] of this.connectedUsers.entries()) {
        if (now - userInfo.lastActivity.getTime() > maxIdleTime) {
          toRemove.push(socketId);
        }
      }

      toRemove.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      });

      if (toRemove.length > 0) {
        console.log(`清理了 ${toRemove.length} 个非活跃连接`);
      }

    } catch (error) {
      console.error('清理非活跃连接失败:', error);
    }
  }

  /**
   * 启动定期清理任务
   * @param {number} interval 清理间隔（毫秒）
   */
  startCleanupTask(interval = 10 * 60 * 1000) { // 10分钟
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, interval);

    console.log('✅ Socket连接清理任务已启动');
  }
}

module.exports = SocketManager;