/**
 * Redis配置
 */

const Redis = require('ioredis');

class RedisConfig {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  /**
   * 获取Redis连接配置
   * @returns {object} Redis连接配置
   */
  getRedisConfig() {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'option_trading:',
      
      // 连接选项
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT) || 10000,
      commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 5000,
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY) || 100,
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES) || 3,
      
      // 连接池选项
      maxPoolSize: parseInt(process.env.REDIS_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.REDIS_MIN_POOL_SIZE) || 2,
      
      // 重连选项
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      
      // 集群配置（如果使用Redis集群）
      enableOfflineQueue: false,
      
      // 健康检查
      lazyConnect: true,
      keepAlive: 30000
    };
  }

  /**
   * 连接Redis
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      if (this.isConnected && this.client) {
        console.log('Redis已连接');
        return;
      }

      const config = this.getRedisConfig();
      
      console.log('正在连接Redis...');

      // 创建主客户端
      this.client = new Redis(config);
      
      // 创建发布订阅客户端
      this.subscriber = new Redis(config);
      this.publisher = new Redis(config);

      // 设置事件监听器
      this.setupEventListeners();

      // 等待连接建立
      await this.client.ping();
      
      this.isConnected = true;
      this.connectionRetries = 0;
      
      console.log('✅ Redis连接成功');
      
    } catch (error) {
      console.error('❌ Redis连接失败:', error.message);
      
      this.connectionRetries++;
      
      if (this.connectionRetries < this.maxRetries) {
        console.log(`${this.connectionRetries}/${this.maxRetries} 重试连接Redis...`);
        setTimeout(() => this.connect(), 5000);
      } else {
        console.error('达到最大重试次数，Redis连接失败');
        // Redis连接失败不终止应用，但会影响缓存功能
        this.isConnected = false;
      }
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 主客户端事件
    this.client.on('connect', () => {
      console.log('🔗 Redis客户端连接已建立');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis客户端就绪');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('💥 Redis客户端错误:', error.message);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('❌ Redis客户端连接已关闭');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis客户端重新连接中...');
    });

    // 订阅客户端事件
    if (this.subscriber) {
      this.subscriber.on('error', (error) => {
        console.error('💥 Redis订阅客户端错误:', error.message);
      });
    }

    // 发布客户端事件
    if (this.publisher) {
      this.publisher.on('error', (error) => {
        console.error('💥 Redis发布客户端错误:', error.message);
      });
    }
  }

  /**
   * 断开Redis连接
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }

      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }

      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }

      this.isConnected = false;
      console.log('Redis连接已断开');
      
    } catch (error) {
      console.error('断开Redis连接失败:', error);
    }
  }

  /**
   * 获取主Redis客户端
   * @returns {Redis} Redis客户端实例
   */
  getClient() {
    if (!this.isConnected || !this.client) {
      console.warn('Redis客户端未连接');
      return null;
    }
    return this.client;
  }

  /**
   * 获取发布客户端
   * @returns {Redis} Redis发布客户端
   */
  getPublisher() {
    if (!this.isConnected || !this.publisher) {
      console.warn('Redis发布客户端未连接');
      return null;
    }
    return this.publisher;
  }

  /**
   * 获取订阅客户端
   * @returns {Redis} Redis订阅客户端
   */
  getSubscriber() {
    if (!this.isConnected || !this.subscriber) {
      console.warn('Redis订阅客户端未连接');
      return null;
    }
    return this.subscriber;
  }

  /**
   * 缓存数据
   * @param {string} key 键名
   * @param {any} value 值
   * @param {number} ttl 过期时间（秒）
   * @returns {Promise<boolean>} 是否成功
   */
  async set(key, value, ttl = 3600) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const serializedValue = JSON.stringify(value);
      
      if (ttl > 0) {
        await client.setex(key, ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      console.error('Redis设置缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存数据
   * @param {string} key 键名
   * @returns {Promise<any>} 缓存值
   */
  async get(key) {
    try {
      const client = this.getClient();
      if (!client) return null;

      const value = await client.get(key);
      if (!value) return null;

      return JSON.parse(value);
    } catch (error) {
      console.error('Redis获取缓存失败:', error);
      return null;
    }
  }

  /**
   * 删除缓存
   * @param {string} key 键名
   * @returns {Promise<boolean>} 是否成功
   */
  async del(key) {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.del(key);
      return true;
    } catch (error) {
      console.error('Redis删除缓存失败:', error);
      return false;
    }
  }

  /**
   * 检查键是否存在
   * @param {string} key 键名
   * @returns {Promise<boolean>} 是否存在
   */
  async exists(key) {
    try {
      const client = this.getClient();
      if (!client) return false;

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis检查键存在失败:', error);
      return false;
    }
  }

  /**
   * 设置键的过期时间
   * @param {string} key 键名
   * @param {number} ttl 过期时间（秒）
   * @returns {Promise<boolean>} 是否成功
   */
  async expire(key, ttl) {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Redis设置过期时间失败:', error);
      return false;
    }
  }

  /**
   * 发布消息
   * @param {string} channel 频道名
   * @param {any} message 消息内容
   * @returns {Promise<boolean>} 是否成功
   */
  async publish(channel, message) {
    try {
      const publisher = this.getPublisher();
      if (!publisher) return false;

      const serializedMessage = JSON.stringify(message);
      await publisher.publish(channel, serializedMessage);
      return true;
    } catch (error) {
      console.error('Redis发布消息失败:', error);
      return false;
    }
  }

  /**
   * 订阅频道
   * @param {string} channel 频道名
   * @param {function} callback 回调函数
   * @returns {Promise<boolean>} 是否成功
   */
  async subscribe(channel, callback) {
    try {
      const subscriber = this.getSubscriber();
      if (!subscriber) return false;

      subscriber.subscribe(channel);
      
      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            console.error('解析Redis消息失败:', error);
            callback(message);
          }
        }
      });

      return true;
    } catch (error) {
      console.error('Redis订阅频道失败:', error);
      return false;
    }
  }

  /**
   * 获取Redis状态
   * @returns {object} Redis状态信息
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      hasClient: !!this.client,
      hasSubscriber: !!this.subscriber,
      hasPublisher: !!this.publisher,
      connectionRetries: this.connectionRetries
    };
  }

  /**
   * Redis健康检查
   * @returns {Promise<boolean>} 健康状态
   */
  async healthCheck() {
    try {
      const client = this.getClient();
      if (!client) return false;

      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis健康检查失败:', error);
      return false;
    }
  }

  /**
   * 获取Redis信息
   * @returns {Promise<object>} Redis信息
   */
  async getInfo() {
    try {
      const client = this.getClient();
      if (!client) return null;

      const info = await client.info();
      return this.parseRedisInfo(info);
    } catch (error) {
      console.error('获取Redis信息失败:', error);
      return null;
    }
  }

  /**
   * 解析Redis信息
   * @param {string} infoString Redis info命令的输出
   * @returns {object} 解析后的信息对象
   */
  parseRedisInfo(infoString) {
    const lines = infoString.split('\r\n');
    const info = {};
    let section = '';

    for (const line of lines) {
      if (line.startsWith('#')) {
        section = line.substring(2).toLowerCase();
        info[section] = {};
      } else if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (section) {
          info[section][key] = isNaN(value) ? value : Number(value);
        }
      }
    }

    return info;
  }

  /**
   * 清空所有缓存
   * @returns {Promise<boolean>} 是否成功
   */
  async flushAll() {
    try {
      const client = this.getClient();
      if (!client) return false;

      await client.flushall();
      console.log('已清空所有Redis缓存');
      return true;
    } catch (error) {
      console.error('清空Redis缓存失败:', error);
      return false;
    }
  }
}

// 创建单例实例
const redisConfig = new RedisConfig();

module.exports = redisConfig;