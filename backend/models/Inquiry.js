// 简化的询价模型，适配 SQLite
const { getDatabase } = require('../config/database');

class Inquiry {
  constructor(data) {
    Object.assign(this, data);
    // 解析 JSON 字符串字段
    if (typeof this.underlyingAsset === 'string') {
      try {
        this.underlyingAsset = JSON.parse(this.underlyingAsset);
      } catch (e) {
        this.underlyingAsset = {};
      }
    }
    
    if (typeof this.quotes === 'string') {
      try {
        this.quotes = JSON.parse(this.quotes);
      } catch (e) {
        this.quotes = [];
      }
    }
    
    if (typeof this.bestQuote === 'string') {
      try {
        this.bestQuote = JSON.parse(this.bestQuote);
      } catch (e) {
        this.bestQuote = null;
      }
    }
    
    if (typeof this.marketData === 'string') {
      try {
        this.marketData = JSON.parse(this.marketData);
      } catch (e) {
        this.marketData = {};
      }
    }
    
    if (typeof this.riskMetrics === 'string') {
      try {
        this.riskMetrics = JSON.parse(this.riskMetrics);
      } catch (e) {
        this.riskMetrics = {};
      }
    }
  }

  // 静态方法：创建询价
  static async create(inquiryData) {
    const db = getDatabase();
    
    // 将对象字段转换为 JSON 字符串存储
    const dataToStore = {
      ...inquiryData,
      underlyingAsset: typeof inquiryData.underlyingAsset === 'object' ? JSON.stringify(inquiryData.underlyingAsset) : inquiryData.underlyingAsset,
      quotes: typeof inquiryData.quotes === 'object' ? JSON.stringify(inquiryData.quotes) : inquiryData.quotes,
      bestQuote: typeof inquiryData.bestQuote === 'object' ? JSON.stringify(inquiryData.bestQuote) : inquiryData.bestQuote,
      marketData: typeof inquiryData.marketData === 'object' ? JSON.stringify(inquiryData.marketData) : inquiryData.marketData,
      riskMetrics: typeof inquiryData.riskMetrics === 'object' ? JSON.stringify(inquiryData.riskMetrics) : inquiryData.riskMetrics,
      createdAt: inquiryData.createdAt || new Date().toISOString(),
      updatedAt: inquiryData.updatedAt || new Date().toISOString(),
      validUntil: inquiryData.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 默认24小时有效期
    };
    
    const stmt = db.prepare(`
      INSERT INTO inquiries (
        inquiryId, userId, accountId, optionType, underlyingAsset, strikePrice, 
        expiryDate, exerciseStyle, settlementType, notionalAmount, quantity, 
        direction, status, quotes, bestQuote, marketData, riskMetrics, source, 
        notes, validUntil, createdAt, updatedAt
      ) VALUES (
        @inquiryId, @userId, @accountId, @optionType, @underlyingAsset, @strikePrice,
        @expiryDate, @exerciseStyle, @settlementType, @notionalAmount, @quantity,
        @direction, @status, @quotes, @bestQuote, @marketData, @riskMetrics, @source,
        @notes, @validUntil, @createdAt, @updatedAt
      )
    `);
    
    const result = stmt.run(dataToStore);
    
    return new Inquiry({ id: result.lastInsertRowid, ...inquiryData });
  }

  // 静态方法：根据 inquiryId 查找询价
  static async findOne(query) {
    const db = getDatabase();
    let inquiry;
    
    if (query.inquiryId && query.userId) {
      inquiry = db.prepare('SELECT * FROM inquiries WHERE inquiryId = ? AND userId = ?').get(query.inquiryId, query.userId);
    } else if (query.inquiryId) {
      inquiry = db.prepare('SELECT * FROM inquiries WHERE inquiryId = ?').get(query.inquiryId);
    }
    
    return inquiry ? new Inquiry(inquiry) : null;
  }

  // 静态方法：查找询价列表
  static async find(query, options = {}) {
    const db = getDatabase();
    let inquiries = [];
    
    if (query.userId) {
      // 根据用户ID查询
      let sql = 'SELECT * FROM inquiries WHERE userId = ?';
      let params = [query.userId];
      
      // 添加状态过滤
      if (query.status) {
        sql += ' AND status = ?';
        params.push(query.status);
      }
      
      // 添加标的资产过滤
      if (query['underlyingAsset.symbol']) {
        // 注意：这里简化处理，实际项目中可能需要更复杂的查询
        sql += ' AND underlyingAsset LIKE ?';
        params.push(`%"symbol":"${query['underlyingAsset.symbol']}%"`);
      }
      
      // 添加排序和分页
      sql += ' ORDER BY createdAt DESC';
      
      if (options.skip) {
        sql += ` LIMIT ${options.skip}`;
      }
      
      if (options.limit) {
        sql += options.skip ? `, ${options.limit}` : ` LIMIT ${options.limit}`;
      }
      
      inquiries = db.prepare(sql).all(...params);
    } else {
      // 查询所有询价（简化处理）
      inquiries = db.prepare('SELECT * FROM inquiries ORDER BY createdAt DESC').all();
    }
    
    return inquiries.map(inquiry => new Inquiry(inquiry));
  }

  // 静态方法：统计询价数量
  static async countDocuments(query) {
    const db = getDatabase();
    
    if (query.userId) {
      let sql = 'SELECT COUNT(*) as count FROM inquiries WHERE userId = ?';
      let params = [query.userId];
      
      if (query.status) {
        sql += ' AND status = ?';
        params.push(query.status);
      }
      
      const result = db.prepare(sql).get(...params);
      return result.count;
    } else {
      const result = db.prepare('SELECT COUNT(*) as count FROM inquiries').get();
      return result.count;
    }
  }

  // 实例方法：保存询价
  async save() {
    const db = getDatabase();
    
    // 将对象字段转换为 JSON 字符串存储
    const dataToStore = {
      ...this,
      underlyingAsset: typeof this.underlyingAsset === 'object' ? JSON.stringify(this.underlyingAsset) : this.underlyingAsset,
      quotes: typeof this.quotes === 'object' ? JSON.stringify(this.quotes) : this.quotes,
      bestQuote: typeof this.bestQuote === 'object' ? JSON.stringify(this.bestQuote) : this.bestQuote,
      marketData: typeof this.marketData === 'object' ? JSON.stringify(this.marketData) : this.marketData,
      riskMetrics: typeof this.riskMetrics === 'object' ? JSON.stringify(this.riskMetrics) : this.riskMetrics,
      updatedAt: new Date().toISOString()
    };
    
    const stmt = db.prepare(`
      UPDATE inquiries SET
        inquiryId = @inquiryId, userId = @userId, accountId = @accountId, optionType = @optionType,
        underlyingAsset = @underlyingAsset, strikePrice = @strikePrice, expiryDate = @expiryDate,
        exerciseStyle = @exerciseStyle, settlementType = @settlementType, notionalAmount = @notionalAmount,
        quantity = @quantity, direction = @direction, status = @status, quotes = @quotes,
        bestQuote = @bestQuote, marketData = @marketData, riskMetrics = @riskMetrics,
        source = @source, notes = @notes, validUntil = @validUntil, updatedAt = @updatedAt
      WHERE id = @id
    `);
    
    stmt.run(dataToStore);
    
    return this;
  }

  // 实例方法：添加报价
  async addQuote(quoteData) {
    if (!this.quotes || !Array.isArray(this.quotes)) {
      this.quotes = [];
    }
    this.quotes.push(quoteData);
    
    // 更新最优报价
    if (!this.bestQuote || quoteData.premium < this.bestQuote.premium) {
      this.bestQuote = {
        quoteId: quoteData.quoteId,
        dealerId: quoteData.dealerId,
        premium: quoteData.premium,
        quotedAt: quoteData.quotedAt || new Date().toISOString()
      };
    }
    
    // 更新状态
    if (this.status === 'pending') {
      this.status = 'quoted';
    }
    
    return this.save();
  }
  
  // 获取询价 ID
  get inquiryId() {
    return this.inquiryId || this.id;
  }
}

module.exports = Inquiry;