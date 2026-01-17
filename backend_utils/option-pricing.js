/**
 * 微信小程序版本的期权报价核心功能
 * 适配小程序环境，保持核心业务逻辑不变
 */

class OptionPricingSystem {
    constructor() {
        this.currentStock = null;
        this.pricingData = [];
        this.tradingDates = [];
        this.traders = [];
        this.init();
    }

    // 初始化系统
    init() {
        this.loadDefaultData();
        this.generatePricingData();
    }

    // 加载默认数据
    loadDefaultData() {
        // 默认股票数据
        this.currentStock = {
            code: '000001',
            name: '平安银行',
            market: 'SZ',
            currentPrice: 11.36,
            change: 0.61,
            changePercent: 5.68
        };

        // 交易日期数据
        this.tradingDates = [
            { label: '最新2024/12/19', value: '2024-12-19', isDefault: true },
            { label: '昨日2024/12/18', value: '2024-12-18', isDefault: false }
        ];

        // 交易商数据
        this.traders = [
            { code: 'BEST', name: '最优报价', isDefault: true },
            { code: 'ZXZZ', name: '中信证券', isDefault: false },
            { code: 'HTCC', name: '华泰财富', isDefault: false },
            { code: 'YHRD', name: '银河瑞德', isDefault: false },
            { code: 'YAZB', name: '亚洲证券', isDefault: false }
        ];
    }

    // 生成报价数据
    generatePricingData() {
        const strategies = ['香草', '雪球'];
        const directions = ['看涨', '看跌'];
        const terms = ['1个月', '3个月', '6个月', '12个月'];
        
        this.pricingData = [];
        
        strategies.forEach(strategy => {
            directions.forEach(direction => {
                terms.forEach(term => {
                    this.pricingData.push({
                        id: `${strategy}_${direction}_${term}`,
                        strategy: strategy,
                        direction: direction,
                        term: term,
                        strikePrice: this.calculateStrikePrice(),
                        premium: this.calculatePremium(),
                        impliedVolatility: this.calculateImpliedVolatility(),
                        delta: this.calculateDelta(),
                        gamma: this.calculateGamma(),
                        theta: this.calculateTheta(),
                        vega: this.calculateVega(),
                        trader: this.getRandomTrader(),
                        timestamp: new Date().toISOString()
                    });
                });
            });
        });
    }

    // 计算执行价格
    calculateStrikePrice() {
        const basePrice = this.currentStock.currentPrice;
        const variations = [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15];
        const variation = variations[Math.floor(Math.random() * variations.length)];
        return parseFloat((basePrice * (1 + variation)).toFixed(2));
    }

    // 计算期权费率
    calculatePremium() {
        return parseFloat((Math.random() * 15 + 2).toFixed(2));
    }

    // 计算隐含波动率
    calculateImpliedVolatility() {
        const baseVol = 20 + Math.random() * 40;
        const marketSentiment = this.getMarketSentiment();
        return parseFloat((baseVol * marketSentiment).toFixed(2));
    }
    
    // 获取市场情绪指数
    getMarketSentiment() {
        const hour = new Date().getHours();
        let sentiment = 1.0;
        
        // 模拟不同时间段的市场情绪
        if (hour >= 9 && hour <= 11) {
            sentiment = 0.9 + Math.random() * 0.3; // 上午相对稳定
        } else if (hour >= 13 && hour <= 15) {
            sentiment = 1.0 + Math.random() * 0.4; // 下午波动较大
        } else {
            sentiment = 0.8 + Math.random() * 0.4; // 非交易时间
        }
        
        return sentiment;
    }

    // 计算Delta
    calculateDelta() {
        return parseFloat((Math.random() * 0.8 + 0.1).toFixed(3));
    }

    // 计算Gamma
    calculateGamma() {
        return parseFloat((Math.random() * 0.05).toFixed(4));
    }

    // 计算Theta
    calculateTheta() {
        return parseFloat((-Math.random() * 0.1).toFixed(4));
    }

    // 计算Vega
    calculateVega() {
        return parseFloat((Math.random() * 0.3).toFixed(3));
    }

    // 获取随机交易商
    getRandomTrader() {
        return this.traders[Math.floor(Math.random() * this.traders.length)];
    }

    // 获取期权报价
    getOptionQuotes(filters = {}) {
        let filteredData = [...this.pricingData];
        
        if (filters.strategy) {
            filteredData = filteredData.filter(item => item.strategy === filters.strategy);
        }
        
        if (filters.direction) {
            filteredData = filteredData.filter(item => item.direction === filters.direction);
        }
        
        if (filters.term) {
            filteredData = filteredData.filter(item => item.term === filters.term);
        }
        
        if (filters.trader) {
            filteredData = filteredData.filter(item => item.trader.code === filters.trader);
        }
        
        filteredData.sort((a, b) => a.premium - b.premium);
        return filteredData;
    }

    // 获取最优报价
    getBestQuote(strategy, direction, term) {
        const quotes = this.getOptionQuotes({ strategy, direction, term });
        return quotes.length > 0 ? quotes[0] : null;
    }

    // 搜索股票报价
    searchStockQuotes(stockCode) {
        const stockDatabase = {
            '000001': { name: '平安银行', market: 'SZ', price: 11.36, change: 0.61 },
            '000002': { name: '万科A', market: 'SZ', price: 8.92, change: -0.15 },
            '600036': { name: '招商银行', market: 'SH', price: 35.67, change: 1.23 },
            '600519': { name: '贵州茅台', market: 'SH', price: 1678.90, change: -12.34 },
            '000858': { name: '五粮液', market: 'SZ', price: 128.45, change: 2.67 }
        };
        
        const stock = stockDatabase[stockCode];
        if (stock) {
            this.currentStock = {
                code: stockCode,
                name: stock.name,
                market: stock.market,
                currentPrice: stock.price,
                change: stock.change,
                changePercent: parseFloat(((stock.change / stock.price) * 100).toFixed(2))
            };
            
            this.generatePricingData();
            return true;
        }
        return false;
    }

    // 提交询价请求
    submitInquiry(inquiryData) {
        const inquiry = {
            id: this.generateInquiryId(),
            stockCode: inquiryData.stockCode || this.currentStock.code,
            stockName: inquiryData.stockName || this.currentStock.name,
            strategy: inquiryData.strategy,
            direction: inquiryData.direction,
            term: inquiryData.term,
            notionalAmount: inquiryData.notionalAmount,
            strikePrice: inquiryData.strikePrice,
            contactInfo: inquiryData.contactInfo,
            status: 'pending',
            submitTime: new Date().toISOString(),
            quotes: []
        };
        
        // 模拟异步响应（适配小程序环境）
        setTimeout(() => {
            this.simulateTraderResponse(inquiry);
        }, 2000);
        
        return inquiry;
    }

    // 模拟交易商响应
    simulateTraderResponse(inquiry) {
        const respondingTraders = this.traders.slice(0, 3);
        
        respondingTraders.forEach((trader, index) => {
            setTimeout(() => {
                const quote = {
                    traderId: trader.code,
                    traderName: trader.name,
                    premium: this.calculatePremium(),
                    minAmount: 50,
                    maxAmount: 1000,
                    validUntil: new Date(Date.now() + 30 * 60000).toISOString(),
                    responseTime: new Date().toISOString()
                };
                
                inquiry.quotes.push(quote);
                
                // 触发页面更新回调
                if (this.onQuoteUpdate) {
                    this.onQuoteUpdate(inquiry);
                }
            }, index * 1000);
        });
    }

    // 生成询价ID
    generateInquiryId() {
        return 'INQ' + Date.now().toString(36).toUpperCase();
    }

    // 实时更新报价（适配小程序环境）
    updatePricing() {
        this.pricingData.forEach(item => {
            const variation = (Math.random() - 0.5) * 0.1;
            item.premium = parseFloat((item.premium * (1 + variation)).toFixed(2));
            item.impliedVolatility = parseFloat((item.impliedVolatility * (1 + variation * 0.5)).toFixed(2));
            item.timestamp = new Date().toISOString();
        });
        
        // 触发更新回调
        if (this.onPricingUpdate) {
            this.onPricingUpdate();
        }
    }

    // 设置更新回调
    setUpdateCallback(callback) {
        this.onPricingUpdate = callback;
    }

    // 设置报价更新回调
    setQuoteUpdateCallback(callback) {
        this.onQuoteUpdate = callback;
    }

    // 启动实时更新（优化版）
    startRealTimeUpdate(interval = 3000) {
        // 清除之前的定时器
        this.stopRealTimeUpdate();
        
        this.updateTimer = setInterval(() => {
            this.updatePricing();
        }, interval);
        
        // 添加WebSocket模拟
        this.simulateWebSocketConnection();
    }
    
    // 模拟WebSocket实时连接
    simulateWebSocketConnection() {
        // 模拟更频繁的价格波动
        this.wsTimer = setInterval(() => {
            this.updateSingleQuote();
        }, 1000);
    }
    
    // 更新单个报价（模拟实时波动）
    updateSingleQuote() {
        if (this.pricingData.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * this.pricingData.length);
        const item = this.pricingData[randomIndex];
        
        // 小幅度价格波动
        const variation = (Math.random() - 0.5) * 0.02; // ±1%波动
        item.premium = Math.max(0.01, parseFloat((item.premium * (1 + variation)).toFixed(2)));
        item.timestamp = new Date().toISOString();
        
        // 触发单个报价更新回调
        if (this.onSingleQuoteUpdate) {
            this.onSingleQuoteUpdate(randomIndex, item);
        }
    }

    // 停止实时更新
    stopRealTimeUpdate() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        if (this.wsTimer) {
            clearInterval(this.wsTimer);
            this.wsTimer = null;
        }
    }

    // 获取系统状态
    getSystemStatus() {
        return {
            currentStock: this.currentStock,
            totalQuotes: this.pricingData.length,
            activeTraders: this.traders.length,
            lastUpdate: new Date().toISOString(),
            isRealTime: !!this.updateTimer
        };
    }
}

module.exports = OptionPricingSystem;