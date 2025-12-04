/**
 * 市场数据服务
 * 负责获取、更新和管理市场数据
 */

const { MarketData } = require('../models');
const axios = require('axios');

class MarketDataService {
  /**
   * 初始化市场数据
   */
  static async initialize() {
    // 创建一些模拟的市场数据
    const symbols = [
      { symbol: '000001', name: '平安银行', market: 'SZ' },
      { symbol: '000002', name: '万科A', market: 'SZ' },
      { symbol: '600000', name: '浦发银行', market: 'SH' },
      { symbol: '600036', name: '招商银行', market: 'SH' },
      { symbol: '000858', name: '五粮液', market: 'SZ' },
      { symbol: '600519', name: '贵州茅台', market: 'SH' },
      { symbol: '000100', name: 'TCL科技', market: 'SZ' },
      { symbol: '600276', name: '恒瑞医药', market: 'SH' }
    ];

    for (const stock of symbols) {
      await this.createOrUpdateMarketData(stock);
    }
  }

  /**
   * 创建或更新市场数据
   * @param {object} stockInfo 股票信息
   */
  static async createOrUpdateMarketData(stockInfo) {
    try {
      const { symbol, name, market } = stockInfo;
      
      // 生成模拟价格数据
      const basePrice = Math.random() * 100 + 10; // 10-110之间的价格
      const change = (Math.random() - 0.5) * basePrice * 0.1; // ±5%的变动
      const changePercent = (change / basePrice) * 100;
      
      const currentPrice = Math.round((basePrice + change) * 100) / 100;
      const openPrice = Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.05) * 100) / 100;
      const highPrice = Math.max(currentPrice, openPrice, Math.round((basePrice + Math.random() * basePrice * 0.08) * 100) / 100);
      const lowPrice = Math.min(currentPrice, openPrice, Math.round((basePrice - Math.random() * basePrice * 0.08) * 100) / 100);
      const prevClosePrice = Math.round(basePrice * 100) / 100;
      
      const volume = Math.floor(Math.random() * 10000000 + 1000000); // 100万-1000万成交量
      const turnover = Math.round(volume * currentPrice);
      
      // 生成技术指标
      const technicalIndicators = this.generateTechnicalIndicators(currentPrice, basePrice);
      
      // 生成历史波动率
      const historicalVolatility = this.generateHistoricalVolatility();
      
      // 生成期权链数据
      const optionChain = this.generateOptionChain(currentPrice);

      const marketData = {
        symbol,
        name,
        market,
        assetType: 'stock',
        currentPrice,
        openPrice,
        highPrice,
        lowPrice,
        prevClosePrice,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume,
        turnover,
        impliedVolatility: Math.random() * 0.3 + 0.1, // 10%-40%的隐含波动率
        historicalVolatility,
        optionData: {
          riskFreeRate: 0.03,
          dividendYield: Math.random() * 0.05,
          optionChain
        },
        technicalIndicators,
        fundamentals: this.generateFundamentals(currentPrice, volume),
        news: this.generateNews(name),
        dataQuality: {
          lastUpdateTime: new Date(),
          dataSource: 'simulation',
          isReliable: true,
          delaySeconds: 0
        },
        marketStatus: this.getMarketStatus(),
        tradingDate: new Date()
      };

      // 查找已存在的数据
      const existingData = await MarketData.findOne({ 
        symbol, 
        tradingDate: {
          $gte: new Date().setHours(0, 0, 0, 0),
          $lt: new Date().setHours(23, 59, 59, 999)
        }
      }).sort({ timestamp: -1 });

      if (existingData) {
        // 更新现有数据
        Object.assign(existingData, marketData);
        await existingData.save();
        return existingData;
      } else {
        // 创建新数据
        const newMarketData = new MarketData(marketData);
        await newMarketData.save();
        return newMarketData;
      }

    } catch (error) {
      console.error('创建或更新市场数据失败:', error);
      throw error;
    }
  }

  /**
   * 生成技术指标
   * @param {number} currentPrice 当前价格
   * @param {number} basePrice 基准价格
   * @returns {object} 技术指标
   */
  static generateTechnicalIndicators(currentPrice, basePrice) {
    return {
      sma: {
        sma5: Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.02) * 100) / 100,
        sma10: Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.03) * 100) / 100,
        sma20: Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.05) * 100) / 100,
        sma50: Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.08) * 100) / 100,
        sma200: Math.round((basePrice + (Math.random() - 0.5) * basePrice * 0.15) * 100) / 100
      },
      ema: {
        ema12: Math.round((currentPrice + (Math.random() - 0.5) * currentPrice * 0.02) * 100) / 100,
        ema26: Math.round((currentPrice + (Math.random() - 0.5) * currentPrice * 0.03) * 100) / 100
      },
      macd: {
        macd: Math.round((Math.random() - 0.5) * currentPrice * 0.01 * 100) / 100,
        signal: Math.round((Math.random() - 0.5) * currentPrice * 0.008 * 100) / 100,
        histogram: Math.round((Math.random() - 0.5) * currentPrice * 0.005 * 100) / 100
      },
      rsi: {
        rsi14: Math.round((Math.random() * 60 + 20) * 100) / 100 // 20-80之间
      },
      bollinger: {
        upper: Math.round((currentPrice * 1.02 + Math.random() * currentPrice * 0.02) * 100) / 100,
        middle: Math.round((currentPrice + (Math.random() - 0.5) * currentPrice * 0.01) * 100) / 100,
        lower: Math.round((currentPrice * 0.98 - Math.random() * currentPrice * 0.02) * 100) / 100
      }
    };
  }

  /**
   * 生成历史波动率
   * @returns {object} 历史波动率
   */
  static generateHistoricalVolatility() {
    const base = Math.random() * 0.2 + 0.1; // 基础波动率10%-30%
    return {
      h5d: Math.round((base + (Math.random() - 0.5) * 0.05) * 10000) / 10000,
      h10d: Math.round((base + (Math.random() - 0.5) * 0.04) * 10000) / 10000,
      h20d: Math.round((base + (Math.random() - 0.5) * 0.03) * 10000) / 10000,
      h30d: Math.round((base + (Math.random() - 0.5) * 0.02) * 10000) / 10000,
      h60d: Math.round((base + (Math.random() - 0.5) * 0.01) * 10000) / 10000,
      h90d: Math.round(base * 10000) / 10000
    };
  }

  /**
   * 生成期权链数据
   * @param {number} spotPrice 现货价格
   * @returns {array} 期权链
   */
  static generateOptionChain(spotPrice) {
    const expiryDates = [
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),   // 1周后
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),  // 1月后
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),  // 3月后
      new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)  // 6月后
    ];

    return expiryDates.map(expiryDate => {
      // 生成执行价格（现价上下20%范围内）
      const strikes = [];
      const priceStep = Math.max(0.1, Math.round(spotPrice * 0.01 * 10) / 10); // 价格步长
      const minStrike = Math.round((spotPrice * 0.8) / priceStep) * priceStep;
      const maxStrike = Math.round((spotPrice * 1.2) / priceStep) * priceStep;

      for (let strike = minStrike; strike <= maxStrike; strike += priceStep) {
        strike = Math.round(strike * 100) / 100;
        
        const timeToExpiry = (expiryDate - Date.now()) / (1000 * 60 * 60 * 24 * 365);
        const moneyness = strike / spotPrice;
        
        // 生成期权价格和希腊字母（简化模拟）
        const callPrice = this.simulateOptionPrice(spotPrice, strike, timeToExpiry, 'call');
        const putPrice = this.simulateOptionPrice(spotPrice, strike, timeToExpiry, 'put');
        
        strikes.push({
          strikePrice: strike,
          call: {
            lastPrice: callPrice.price,
            bid: callPrice.price * 0.99,
            ask: callPrice.price * 1.01,
            volume: Math.floor(Math.random() * 1000),
            openInterest: Math.floor(Math.random() * 5000),
            impliedVolatility: Math.random() * 0.2 + 0.15,
            delta: callPrice.delta,
            gamma: callPrice.gamma,
            theta: callPrice.theta,
            vega: callPrice.vega,
            rho: callPrice.rho
          },
          put: {
            lastPrice: putPrice.price,
            bid: putPrice.price * 0.99,
            ask: putPrice.price * 1.01,
            volume: Math.floor(Math.random() * 1000),
            openInterest: Math.floor(Math.random() * 5000),
            impliedVolatility: Math.random() * 0.2 + 0.15,
            delta: putPrice.delta,
            gamma: putPrice.gamma,
            theta: putPrice.theta,
            vega: putPrice.vega,
            rho: putPrice.rho
          }
        });
      }

      return {
        expiryDate,
        strikes
      };
    });
  }

  /**
   * 模拟期权价格
   * @param {number} S 现货价格
   * @param {number} K 执行价格
   * @param {number} T 到期时间
   * @param {string} type 期权类型
   * @returns {object} 期权价格和希腊字母
   */
  static simulateOptionPrice(S, K, T, type) {
    const r = 0.03;
    const sigma = Math.random() * 0.2 + 0.15;
    
    // 简化的BS公式模拟
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    let price, delta;
    if (type === 'call') {
      price = Math.max(0, S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2));
      delta = this.normalCDF(d1);
    } else {
      price = Math.max(0, K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1));
      delta = -this.normalCDF(-d1);
    }
    
    const gamma = this.normalPDF(d1) / (S * sigma * Math.sqrt(T));
    const theta = -(S * this.normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * this.normalCDF(type === 'call' ? d2 : -d2);
    const vega = S * this.normalPDF(d1) * Math.sqrt(T);
    const rho = K * T * Math.exp(-r * T) * this.normalCDF(type === 'call' ? d2 : -d2);
    
    return {
      price: Math.round(price * 100) / 100,
      delta: Math.round(delta * 10000) / 10000,
      gamma: Math.round(gamma * 10000) / 10000,
      theta: Math.round(theta / 365 * 100) / 100,
      vega: Math.round(vega / 100 * 100) / 100,
      rho: Math.round(rho / 100 * 100) / 100
    };
  }

  /**
   * 标准正态分布累积分布函数（简化版）
   */
  static normalCDF(x) {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * 标准正态分布概率密度函数
   */
  static normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 误差函数（简化实现）
   */
  static erf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }

  /**
   * 生成基本面数据
   * @param {number} currentPrice 当前价格
   * @param {number} volume 成交量
   * @returns {object} 基本面数据
   */
  static generateFundamentals(currentPrice, volume) {
    return {
      marketCap: Math.round(currentPrice * (Math.random() * 5000000000 + 1000000000)), // 10亿-50亿市值
      peRatio: Math.round((Math.random() * 30 + 5) * 100) / 100, // 5-35倍PE
      pbRatio: Math.round((Math.random() * 5 + 0.5) * 100) / 100, // 0.5-5.5倍PB
      eps: Math.round((currentPrice / (Math.random() * 30 + 5)) * 100) / 100,
      dividend: Math.round((currentPrice * (Math.random() * 0.05 + 0.01)) * 100) / 100,
      dividendYield: Math.round((Math.random() * 5 + 1) * 100) / 100,
      bookValue: Math.round((currentPrice / (Math.random() * 5 + 0.5)) * 100) / 100,
      totalShares: Math.floor(Math.random() * 10000000000 + 1000000000),
      floatShares: Math.floor(Math.random() * 5000000000 + 500000000)
    };
  }

  /**
   * 生成新闻数据
   * @param {string} stockName 股票名称
   * @returns {array} 新闻列表
   */
  static generateNews(stockName) {
    const newsTemplates = [
      { title: `${stockName}发布季度财报，业绩超预期`, sentiment: 'positive' },
      { title: `${stockName}宣布重大投资计划`, sentiment: 'positive' },
      { title: `分析师上调${stockName}目标价`, sentiment: 'positive' },
      { title: `${stockName}面临行业监管压力`, sentiment: 'negative' },
      { title: `${stockName}董事长接受媒体采访`, sentiment: 'neutral' },
      { title: `机构调研${stockName}，关注未来发展`, sentiment: 'neutral' }
    ];

    return newsTemplates.slice(0, Math.floor(Math.random() * 4) + 1).map(template => ({
      title: template.title,
      summary: `${template.title}的相关报道...`,
      url: `https://news.example.com/news/${Math.random().toString(36).substr(2, 9)}`,
      publishTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      source: ['财经新闻', '证券时报', '上海证券报', '中国证券报'][Math.floor(Math.random() * 4)],
      sentiment: template.sentiment
    }));
  }

  /**
   * 获取市场状态
   * @returns {string} 市场状态
   */
  static getMarketStatus() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay();
    
    // 周末
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'holiday';
    }
    
    // 工作日时间判断
    if (hour < 9 || (hour === 9 && minute < 30)) {
      return 'pre_market';
    } else if ((hour >= 9 && hour < 11) || (hour === 11 && minute <= 30) || (hour >= 13 && hour < 15)) {
      return 'open';
    } else if (hour >= 15 && hour < 21) {
      return 'after_hours';
    } else {
      return 'close';
    }
  }

  /**
   * 实时更新市场数据
   * @param {string} symbol 股票代码
   * @param {object} updateData 更新数据
   */
  static async updateRealTimeData(symbol, updateData) {
    try {
      const marketData = await MarketData.findOne({ symbol })
        .sort({ timestamp: -1 });

      if (marketData) {
        if (updateData.price) {
          await marketData.updatePrice(updateData.price, updateData.volume || 0);
        }
        
        if (updateData.news) {
          await marketData.addNewsItem(updateData.news);
        }
        
        return marketData;
      }
      
      return null;
    } catch (error) {
      console.error('更新实时数据失败:', error);
      throw error;
    }
  }

  /**
   * 批量更新市场数据
   */
  static async batchUpdateMarketData() {
    try {
      // 获取最近一天的所有股票
      const symbols = await MarketData.distinct('symbol', {
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      const updatePromises = symbols.map(async (symbol) => {
        const latestData = await MarketData.findOne({ symbol })
          .sort({ timestamp: -1 });
        
        if (latestData) {
          // 生成价格变动
          const priceChange = (Math.random() - 0.5) * latestData.currentPrice * 0.02; // ±1%变动
          const newPrice = Math.max(0.01, latestData.currentPrice + priceChange);
          const volume = Math.floor(Math.random() * 100000 + 10000);
          
          return this.updateRealTimeData(symbol, {
            price: Math.round(newPrice * 100) / 100,
            volume
          });
        }
      });

      await Promise.all(updatePromises);
      console.log(`批量更新了 ${symbols.length} 只股票的市场数据`);
      
    } catch (error) {
      console.error('批量更新市场数据失败:', error);
      throw error;
    }
  }

  /**
   * 启动实时数据推送
   * @param {object} io Socket.IO实例
   */
  static startRealTimeDataFeed(io) {
    // 每5秒更新一次市场数据
    setInterval(async () => {
      try {
        await this.batchUpdateMarketData();
        
        // 获取最新数据并推送
        const latestData = await MarketData.find({
          timestamp: { $gte: new Date(Date.now() - 10 * 1000) } // 最近10秒的数据
        }).limit(50);

        if (latestData.length > 0) {
          io.emit('market_data_update', {
            timestamp: new Date(),
            data: latestData.map(data => ({
              symbol: data.symbol,
              name: data.name,
              currentPrice: data.currentPrice,
              change: data.change,
              changePercent: data.changePercent,
              volume: data.volume,
              marketStatus: data.marketStatus
            }))
          });
        }
        
      } catch (error) {
        console.error('实时数据推送失败:', error);
      }
    }, 5000);

    console.log('实时市场数据推送已启动');
  }
}

module.exports = MarketDataService;