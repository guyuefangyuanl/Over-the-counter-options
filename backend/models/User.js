// 简化的用户模型，适配 SQLite
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../config/database');

class User {
  constructor(data) {
    Object.assign(this, data);
    // 解析 accounts JSON 字符串
    if (typeof this.accounts === 'string') {
      try {
        this.accounts = JSON.parse(this.accounts);
      } catch (e) {
        this.accounts = [];
      }
    }
  }

  // 静态方法：根据 openId 查找用户
  static async findByOpenId(openId) {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE openId = ?').get(openId);
    return user ? new User(user) : null;
  }

  // 静态方法：根据手机号查找用户
  static async findByPhone(phone) {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    return user ? new User(user) : null;
  }

  // 静态方法：根据 ID 查找用户
  static async findById(id) {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return user ? new User(user) : null;
  }

  // 静态方法：创建用户
  static async create(userData) {
    const db = getDatabase();
    
    // 将 accounts 对象转换为 JSON 字符串存储
    const dataToStore = {
      ...userData,
      accounts: typeof userData.accounts === 'object' ? JSON.stringify(userData.accounts) : userData.accounts,
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: userData.updatedAt || new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      INSERT INTO users (
        openId, unionId, qqOpenId, qqUnionId, loginType, nickname, avatar, 
        phone, email, isVerified, idCard, realName, riskLevel, riskScore, 
        riskAssessmentDate, accounts, activeAccountId, status, lastLoginTime, 
        lastActiveTime, createdAt, updatedAt
      ) VALUES (
        @openId, @unionId, @qqOpenId, @qqUnionId, @loginType, @nickname, @avatar,
        @phone, @email, @isVerified, @idCard, @realName, @riskLevel, @riskScore,
        @riskAssessmentDate, @accounts, @activeAccountId, @status, @lastLoginTime,
        @lastActiveTime, @createdAt, @updatedAt
      )
    `);
    
    const result = stmt.run(dataToStore);
    
    return new User({ id: result.lastInsertRowid, ...userData });
  }

  // 实例方法：保存用户
  async save() {
    const db = getDatabase();
    
    // 将 accounts 对象转换为 JSON 字符串存储
    const dataToStore = {
      ...this,
      accounts: typeof this.accounts === 'object' ? JSON.stringify(this.accounts) : this.accounts,
      updatedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE users SET
        openId = @openId, unionId = @unionId, qqOpenId = @qqOpenId, qqUnionId = @qqUnionId,
        loginType = @loginType, nickname = @nickname, avatar = @avatar, phone = @phone,
        email = @email, isVerified = @isVerified, idCard = @idCard, realName = @realName,
        riskLevel = @riskLevel, riskScore = @riskScore, riskAssessmentDate = @riskAssessmentDate,
        accounts = @accounts, activeAccountId = @activeAccountId, status = @status, 
        lastLoginTime = @lastLoginTime, lastActiveTime = @lastActiveTime, updatedAt = @updatedAt
      WHERE id = @id
    `);
    
    stmt.run(dataToStore);
    
    return this;
  }

  // 实例方法：添加账户
  async addAccount(accountData) {
    // 确保 accounts 是数组
    if (!this.accounts || !Array.isArray(this.accounts)) {
      this.accounts = [];
    }
    this.accounts.push(accountData);
    if (!this.activeAccountId) {
      this.activeAccountId = accountData.accountId;
    }
    return this.save();
  }

  // 实例方法：切换账户
  async switchAccount(accountId) {
    if (!this.accounts || !Array.isArray(this.accounts)) {
      throw new Error('账户不存在或已禁用');
    }
    
    const account = this.accounts.find(acc => acc.accountId === accountId && acc.isActive);
    if (!account) {
      throw new Error('账户不存在或已禁用');
    }
    this.activeAccountId = accountId;
    return this.save();
  }

  // 获取活跃账户
  get activeAccount() {
    if (!this.accounts || !Array.isArray(this.accounts)) return null;
    return this.accounts.find(account => account.accountId === this.activeAccountId);
  }

  // 获取总余额
  get totalBalance() {
    if (!this.accounts || !Array.isArray(this.accounts)) return 0;
    return this.accounts.reduce((total, account) => total + (account.balance || 0), 0);
  }
  
  // 获取用户 ID
  get userId() {
    return this.id;
  }
}

module.exports = User;