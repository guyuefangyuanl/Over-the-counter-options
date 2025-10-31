/**
 * 期权报价核心功能模块
 * 场外期权报价系统 - 小程序核心代码
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
        this.bindEvents();
        this.renderUI();
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

        // 模拟报价数据
        this.generatePricingData();
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
        return parseFloat((Math.random() * 15 + 2).toFixed(2)); // 2%-17%之间
    }

    // 计算隐含波动率
    calculateImpliedVolatility() {
        return parseFloat((Math.random() * 40 + 20).toFixed(2)); // 20%-60%之间
    }

    // 计算Delta
    calculateDelta() {
        return parseFloat((Math.random() * 0.8 + 0.1).toFixed(3)); // 0.1-0.9之间
    }

    // 计算Gamma
    calculateGamma() {
        return parseFloat((Math.random() * 0.05).toFixed(4)); // 0-0.05之间
    }

    // 计算Theta
    calculateTheta() {
        return parseFloat((-Math.random() * 0.1).toFixed(4)); // 负值，时间价值衰减
    }

    // 计算Vega
    calculateVega() {
        return parseFloat((Math.random() * 0.3).toFixed(3)); // 0-0.3之间
    }

    // 获取随机交易商
    getRandomTrader() {
        return this.traders[Math.floor(Math.random() * this.traders.length)];
    }

    // 获取期权报价
    getOptionQuotes(filters = {}) {
        let filteredData = [...this.pricingData];
        
        // 按策略筛选
        if (filters.strategy) {
            filteredData = filteredData.filter(item => item.strategy === filters.strategy);
        }
        
        // 按方向筛选
        if (filters.direction) {
            filteredData = filteredData.filter(item => item.direction === filters.direction);
        }
        
        // 按期限筛选
        if (filters.term) {
            filteredData = filteredData.filter(item => item.term === filters.term);
        }
        
        // 按交易商筛选
        if (filters.trader) {
            filteredData = filteredData.filter(item => item.trader.code === filters.trader);
        }
        
        // 排序：按期权费率从低到高
        filteredData.sort((a, b) => a.premium - b.premium);
        
        return filteredData;
    }

    // 获取最优报价
    getBestQuote(strategy, direction, term) {
        const quotes = this.getOptionQuotes({ strategy, direction, term });
        return quotes.length > 0 ? quotes[0] : null;
    }

    // 实时更新报价
    updatePricing() {
        this.pricingData.forEach(item => {
            // 模拟价格波动 ±5%
            const variation = (Math.random() - 0.5) * 0.1;
            item.premium = parseFloat((item.premium * (1 + variation)).toFixed(2));
            item.impliedVolatility = parseFloat((item.impliedVolatility * (1 + variation * 0.5)).toFixed(2));
            item.timestamp = new Date().toISOString();
        });
        
        // 触发更新事件
        this.triggerUpdate();
    }

    // 查询指定股票报价
    searchStockQuotes(stockCode) {
        // 模拟股票查询
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
            
            // 重新生成该股票的报价数据
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
            notionalAmount: inquiryData.notionalAmount, // 名义本金
            strikePrice: inquiryData.strikePrice, // 执行价格
            contactInfo: inquiryData.contactInfo,
            status: 'pending', // pending, quoted, accepted, rejected
            submitTime: new Date().toISOString(),
            quotes: []
        };
        
        // 模拟交易商响应
        setTimeout(() => {
            this.simulateTraderResponse(inquiry);
        }, 2000);
        
        return inquiry;
    }

    // 模拟交易商响应
    simulateTraderResponse(inquiry) {
        const respondingTraders = this.traders.slice(0, 3); // 模拟3个交易商响应
        
        respondingTraders.forEach((trader, index) => {
            setTimeout(() => {
                const quote = {
                    traderId: trader.code,
                    traderName: trader.name,
                    premium: this.calculatePremium(),
                    minAmount: 50, // 最小交易金额（万元）
                    maxAmount: 1000, // 最大交易金额（万元）
                    validUntil: new Date(Date.now() + 30 * 60000).toISOString(), // 30分钟有效期
                    responseTime: new Date().toISOString()
                };
                
                inquiry.quotes.push(quote);
                
                // 触发报价更新事件
                this.triggerQuoteUpdate(inquiry);
            }, index * 1000); // 错开响应时间
        });
    }

    // 生成询价ID
    generateInquiryId() {
        return 'INQ' + Date.now().toString(36).toUpperCase();
    }

    // 计算期权理论价格（简化的Black-Scholes模型）
    calculateTheoreticalPrice(S, K, T, r, sigma, optionType = 'call') {
        // S: 现价, K: 执行价, T: 到期时间(年), r: 无风险利率, sigma: 波动率
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        
        // 标准正态分布累积函数（简化近似）
        const normCDF = (x) => {
            return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
        };
        
        if (optionType === 'call') {
            return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
        } else {
            return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
        }
    }

    // 误差函数近似
    erf(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        
        return sign * y;
    }

    // 绑定事件
    bindEvents() {
        // 模拟DOM事件绑定
        if (typeof document !== 'undefined') {
            // 搜索按钮事件
            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) {
                searchBtn.addEventListener('click', () => {
                    const stockCode = document.getElementById('stockInput').value;
                    this.handleSearch(stockCode);
                });
            }
            
            // 策略选择事件
            const strategySelect = document.getElementById('strategySelect');
            if (strategySelect) {
                strategySelect.addEventListener('change', (e) => {
                    this.handleStrategyChange(e.target.value);
                });
            }
            
            // 询价按钮事件
            const inquiryBtn = document.getElementById('inquiryBtn');
            if (inquiryBtn) {
                inquiryBtn.addEventListener('click', () => {
                    this.handleInquiry();
                });
            }
        }
    }

    // 处理搜索
    handleSearch(stockCode) {
        if (this.searchStockQuotes(stockCode)) {
            this.renderUI();
            this.showMessage('股票查询成功', 'success');
        } else {
            this.showMessage('未找到该股票代码', 'error');
        }
    }

    // 处理策略变更
    handleStrategyChange(strategy) {
        const quotes = this.getOptionQuotes({ strategy });
        this.renderQuotes(quotes);
    }

    // 处理询价
    handleInquiry() {
        const inquiryData = this.collectInquiryData();
        if (this.validateInquiryData(inquiryData)) {
            const inquiry = this.submitInquiry(inquiryData);
            this.showMessage('询价请求已提交', 'success');
            return inquiry;
        } else {
            this.showMessage('请完善询价信息', 'error');
        }
    }

    // 收集询价数据
    collectInquiryData() {
        // 从表单收集数据的模拟实现
        return {
            strategy: '香草',
            direction: '看涨',
            term: '1个月',
            notionalAmount: 100,
            strikePrice: this.currentStock.currentPrice,
            contactInfo: '客户联系方式'
        };
    }

    // 验证询价数据
    validateInquiryData(data) {
        return data.strategy && data.direction && data.term && data.notionalAmount > 0;
    }

    // 渲染UI
    renderUI() {
        this.renderStockInfo();
        this.renderQuotes();
    }

    // 渲染股票信息
    renderStockInfo() {
        if (typeof document !== 'undefined') {
            const stockInfoContainer = document.getElementById('stockInfo');
            if (stockInfoContainer) {
                stockInfoContainer.innerHTML = `
                    <div class="stock-info">
                        <h3>${this.currentStock.name} ${this.currentStock.code}.${this.currentStock.market}</h3>
                        <div class="price-info">
                            <span class="current-price">${this.currentStock.currentPrice}</span>
                            <span class="change ${this.currentStock.change >= 0 ? 'positive' : 'negative'}">
                                ${this.currentStock.change >= 0 ? '+' : ''}${this.currentStock.change} 
                                (${this.currentStock.changePercent}%)
                            </span>
                        </div>
                    </div>
                `;
            }
        }
    }

    // 渲染报价列表
    renderQuotes(quotes = null) {
        if (!quotes) {
            quotes = this.getOptionQuotes();
        }
        
        if (typeof document !== 'undefined') {
            const quotesContainer = document.getElementById('quotesContainer');
            if (quotesContainer) {
                quotesContainer.innerHTML = quotes.map(quote => `
                    <div class="quote-item">
                        <div class="quote-header">
                            <span class="strategy">${quote.strategy}</span>
                            <span class="direction">${quote.direction}</span>
                            <span class="term">${quote.term}</span>
                        </div>
                        <div class="quote-details">
                            <div class="price-info">
                                <span class="label">执行价:</span>
                                <span class="value">${quote.strikePrice}</span>
                            </div>
                            <div class="premium-info">
                                <span class="label">期权费率:</span>
                                <span class="value">${quote.premium}%</span>
                            </div>
                            <div class="trader-info">
                                <span class="label">交易商:</span>
                                <span class="value">${quote.trader.name}</span>
                            </div>
                        </div>
                        <div class="greeks">
                            <span>Delta: ${quote.delta}</span>
                            <span>Gamma: ${quote.gamma}</span>
                            <span>Theta: ${quote.theta}</span>
                            <span>Vega: ${quote.vega}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // 触发更新事件
    triggerUpdate() {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('pricingUpdate', {
                detail: { data: this.pricingData, timestamp: new Date().toISOString() }
            }));
        }
    }

    // 触发报价更新事件
    triggerQuoteUpdate(inquiry) {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('quoteUpdate', {
                detail: { inquiry, timestamp: new Date().toISOString() }
            }));
        }
    }

    // 显示消息
    showMessage(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        if (typeof document !== 'undefined') {
            const messageContainer = document.getElementById('messageContainer');
            if (messageContainer) {
                messageContainer.innerHTML = `
                    <div class="message ${type}">
                        ${message}
                    </div>
                `;
                
                setTimeout(() => {
                    messageContainer.innerHTML = '';
                }, 3000);
            }
        }
    }

    // 启动实时更新
    startRealTimeUpdate(interval = 10000) {
        setInterval(() => {
            this.updatePricing();
        }, interval);
    }

    // 获取系统状态
    getSystemStatus() {
        return {
            currentStock: this.currentStock,
            totalQuotes: this.pricingData.length,
            activeTraders: this.traders.length,
            lastUpdate: new Date().toISOString(),
            isRealTime: true
        };
    }
}

// 导出类和工具函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OptionPricingSystem;
} else if (typeof window !== 'undefined') {
    window.OptionPricingSystem = OptionPricingSystem;
}

// 初始化全局实例
if (typeof window !== 'undefined') {
    window.optionPricing = new OptionPricingSystem();
    
    // 页面加载完成后启动实时更新
    document.addEventListener('DOMContentLoaded', () => {
        window.optionPricing.startRealTimeUpdate();
    });
}