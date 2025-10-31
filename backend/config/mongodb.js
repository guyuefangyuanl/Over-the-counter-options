const mongoose = require('mongoose');

class MongoDBConfig {
  constructor() {
    this.connection = null;
  }

  /**
   * 连接MongoDB数据库
   * @returns {Promise}
   */
  async connect() {
    try {
      // 从环境变量获取MongoDB连接字符串，如果没有则使用默认值
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/option_trading';
      
      // 连接选项
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        // 其他连接选项可以根据需要添加
      };

      this.connection = await mongoose.connect(mongoUri, options);
      
      console.log('✅ MongoDB数据库连接成功');
      console.log(`📡 连接地址: ${mongoUri}`);
      
      // 监听连接事件
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB连接错误:', err);
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB连接已断开');
      });
      
      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB连接失败:', error);
      throw error;
    }
  }

  /**
   * 断开MongoDB连接
   * @returns {Promise}
   */
  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      console.log('✅ MongoDB连接已断开');
    }
  }

  /**
   * 检查连接状态
   * @returns {boolean}
   */
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  /**
   * 获取连接信息
   * @returns {object}
   */
  getConnectionInfo() {
    return {
      connected: this.isConnected(),
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      readyState: mongoose.connection.readyState
    };
  }
}

// 创建单例实例
const mongoDBConfig = new MongoDBConfig();

module.exports = mongoDBConfig;