/**
 * 风险管理服务
 * 实现期权交易的风险控制和监控功能
 */

const { Trade, User, Dealer } = require('../models');

class RiskManagementService {
  /**
   * 用户风险限额配置
   */
  static getUserRiskLimits(riskLevel) {
    const limits = {
      conservative: {
        maxSinglePosition: 10000,     // 单笔最大持仓金额
        maxTotalPosition: 50000,      // 总持仓限额
        maxDailyLoss: 5000,          // 日最大亏损
        maxWeeklyLoss: 15000,        // 周最大亏损
        maxMonthlyLoss: 30000,       // 月最大亏损
        maxLeverage: 2,              // 最大杠杆
        deltaLimit: 0.3,             // Delta限额
        vegaLimit: 1000,             // Vega限额
        concentrationLimit: 0.3,     // 单一标的集中度限制
        liquidityBuffer: 0.2         // 流动性缓冲比例
      },
      moderate: {
        maxSinglePosition: 50000,
        maxTotalPosition: 200000,
        maxDailyLoss: 10000,
        maxWeeklyLoss: 30000,
        maxMonthlyLoss: 60000,
        maxLeverage: 3,
        deltaLimit: 0.5,
        vegaLimit: 3000,
        concentrationLimit: 0.4,
        liquidityBuffer: 0.15
      },
      aggressive: {
        maxSinglePosition: 100000,
        maxTotalPosition: 500000,
        maxDailyLoss: 25000,
        maxWeeklyLoss: 75000,
        maxMonthlyLoss: 150000,
        maxLeverage: 5,
        deltaLimit: 0.8,
        vegaLimit: 8000,
        concentrationLimit: 0.6,
        liquidityBuffer: 0.1
      }
    };
    
    return limits[riskLevel] || limits.conservative;
  }

  /**
   * 检查交易前风险
   * @param {object} params 交易参数
   * @returns {object} 风险检查结果
   */
  static async checkPreTradeRisk(params) {
    const { userId, accountId, tradeAmount, optionData, direction } = params;
    
    try {
      // 获取用户信息和风险配置
      const user = await User.findById(userId);
      if (!user) {
        return { passed: false, reason: '用户不存在' };
      }

      const riskLimits = this.getUserRiskLimits(user.riskLevel);
      const account = user.accounts.find(acc => acc.accountId === accountId);
      
      if (!account) {
        return { passed: false, reason: '账户不存在' };
      }

      // 1. 资金检查
      const requiredMargin = direction === 'buy' ? tradeAmount : tradeAmount * 0.2; // 卖出需要保证金
      if (account.balance < requiredMargin) {
        return { 
          passed: false, 
          reason: '账户余额不足',
          required: requiredMargin,
          available: account.balance
        };
      }

      // 2. 单笔限额检查
      if (tradeAmount > riskLimits.maxSinglePosition) {
        return { 
          passed: false, 
          reason: `单笔交易金额超限，最大允许：${riskLimits.maxSinglePosition}`,
          limit: riskLimits.maxSinglePosition
        };
      }

      // 3. 总持仓检查
      const activePositions = await Trade.findActivePositions(userId);
      const currentExposure = activePositions.reduce((sum, pos) => {
        return sum + (pos.currentValuation?.marketValue || pos.totalPremium);
      }, 0);

      if (currentExposure + tradeAmount > riskLimits.maxTotalPosition) {
        return { 
          passed: false, 
          reason: `总持仓金额超限，当前：${currentExposure}，限额：${riskLimits.maxTotalPosition}`,
          current: currentExposure,
          limit: riskLimits.maxTotalPosition
        };
      }

      // 4. 集中度检查
      const symbolExposure = activePositions
        .filter(pos => pos.optionContract.underlyingAsset.symbol === optionData.underlyingAsset.symbol)
        .reduce((sum, pos) => sum + (pos.currentValuation?.marketValue || pos.totalPremium), 0);
      
      const newSymbolExposure = symbolExposure + tradeAmount;
      const maxSymbolExposure = riskLimits.maxTotalPosition * riskLimits.concentrationLimit;
      
      if (newSymbolExposure > maxSymbolExposure) {
        return { 
          passed: false, 
          reason: `单一标的集中度超限，当前：${symbolExposure}，限额：${maxSymbolExposure}`,
          current: symbolExposure,
          limit: maxSymbolExposure
        };
      }

      // 5. 希腊字母检查
      const riskMetrics = await this.calculatePortfolioRisk(userId, optionData);
      if (Math.abs(riskMetrics.netDelta) > riskLimits.deltaLimit) {
        return { 
          passed: false, 
          reason: `Delta风险超限，当前：${riskMetrics.netDelta}，限额：${riskLimits.deltaLimit}`,
          current: riskMetrics.netDelta,
          limit: riskLimits.deltaLimit
        };
      }

      if (Math.abs(riskMetrics.netVega) > riskLimits.vegaLimit) {
        return { 
          passed: false, 
          reason: `Vega风险超限，当前：${riskMetrics.netVega}，限额：${riskLimits.vegaLimit}`,
          current: riskMetrics.netVega,
          limit: riskLimits.vegaLimit
        };
      }

      return { 
        passed: true, 
        riskScore: this.calculateRiskScore(riskMetrics, riskLimits),
        riskMetrics
      };

    } catch (error) {
      console.error('风险检查失败:', error);
      return { passed: false, reason: '风险检查系统错误' };
    }
  }

  /**
   * 计算投资组合风险
   * @param {string} userId 用户ID
   * @param {object} newPosition 新增仓位
   * @returns {object} 风险指标
   */
  static async calculatePortfolioRisk(userId, newPosition = null) {
    try {
      const activePositions = await Trade.findActivePositions(userId);
      
      let netDelta = 0;
      let netGamma = 0;
      let netTheta = 0;
      let netVega = 0;
      let netRho = 0;
      let totalValue = 0;
      let totalPnL = 0;
      
      const positionsBySymbol = {};

      // 计算现有持仓风险
      activePositions.forEach(position => {
        const symbol = position.optionContract.underlyingAsset.symbol;
        const multiplier = position.direction === 'buy' ? 1 : -1;
        
        if (position.currentGreeks) {
          netDelta += (position.currentGreeks.delta || 0) * multiplier * position.quantity;
          netGamma += (position.currentGreeks.gamma || 0) * multiplier * position.quantity;
          netTheta += (position.currentGreeks.theta || 0) * multiplier * position.quantity;
          netVega += (position.currentGreeks.vega || 0) * multiplier * position.quantity;
          netRho += (position.currentGreeks.rho || 0) * multiplier * position.quantity;
        }
        
        const marketValue = position.currentValuation?.marketValue || position.totalPremium;
        const pnl = position.currentValuation?.pnl || 0;
        
        totalValue += marketValue;
        totalPnL += pnl;
        
        // 按标的分组
        if (!positionsBySymbol[symbol]) {
          positionsBySymbol[symbol] = {
            symbol,
            value: 0,
            pnl: 0,
            delta: 0,
            vega: 0,
            positions: []
          };
        }
        
        positionsBySymbol[symbol].value += marketValue;
        positionsBySymbol[symbol].pnl += pnl;
        positionsBySymbol[symbol].delta += (position.currentGreeks?.delta || 0) * multiplier * position.quantity;
        positionsBySymbol[symbol].vega += (position.currentGreeks?.vega || 0) * multiplier * position.quantity;
        positionsBySymbol[symbol].positions.push(position);
      });

      // 如果有新增仓位，加入计算
      if (newPosition) {
        const newMultiplier = newPosition.direction === 'buy' ? 1 : -1;
        if (newPosition.greeks) {
          netDelta += (newPosition.greeks.delta || 0) * newMultiplier * newPosition.quantity;
          netGamma += (newPosition.greeks.gamma || 0) * newMultiplier * newPosition.quantity;
          netTheta += (newPosition.greeks.theta || 0) * newMultiplier * newPosition.quantity;
          netVega += (newPosition.greeks.vega || 0) * newMultiplier * newPosition.quantity;
          netRho += (newPosition.greeks.rho || 0) * newMultiplier * newPosition.quantity;
        }
      }

      // 计算风险指标
      const maxDrawdown = this.calculateMaxDrawdown(activePositions);
      const concentrationRisk = this.calculateConcentrationRisk(positionsBySymbol, totalValue);
      const liquidityRisk = this.calculateLiquidityRisk(activePositions);
      
      return {
        netDelta: Math.round(netDelta * 10000) / 10000,
        netGamma: Math.round(netGamma * 10000) / 10000,
        netTheta: Math.round(netTheta * 100) / 100,
        netVega: Math.round(netVega * 100) / 100,
        netRho: Math.round(netRho * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        totalPnL: Math.round(totalPnL * 100) / 100,
        pnlPercent: totalValue > 0 ? Math.round((totalPnL / totalValue) * 10000) / 100 : 0,
        maxDrawdown,
        concentrationRisk,
        liquidityRisk,
        positionsBySymbol: Object.values(positionsBySymbol)
      };

    } catch (error) {
      console.error('计算投资组合风险失败:', error);
      throw error;
    }
  }

  /**
   * 计算最大回撤
   * @param {array} positions 持仓列表
   * @returns {number} 最大回撤比例
   */
  static calculateMaxDrawdown(positions) {
    // 简化计算，实际应该基于历史净值数据
    let maxDrawdown = 0;
    positions.forEach(position => {
      if (position.currentValuation && position.currentValuation.pnlPercent < 0) {
        maxDrawdown = Math.min(maxDrawdown, position.currentValuation.pnlPercent);
      }
    });
    return maxDrawdown;
  }

  /**
   * 计算集中度风险
   * @param {object} positionsBySymbol 按标的分组的持仓
   * @param {number} totalValue 总价值
   * @returns {object} 集中度风险指标
   */
  static calculateConcentrationRisk(positionsBySymbol, totalValue) {
    if (totalValue === 0) return { maxConcentration: 0, topSymbols: [] };
    
    const concentrations = Object.values(positionsBySymbol).map(pos => ({
      symbol: pos.symbol,
      concentration: pos.value / totalValue,
      value: pos.value
    })).sort((a, b) => b.concentration - a.concentration);
    
    return {
      maxConcentration: concentrations.length > 0 ? concentrations[0].concentration : 0,
      topSymbols: concentrations.slice(0, 5)
    };
  }

  /**
   * 计算流动性风险
   * @param {array} positions 持仓列表
   * @returns {object} 流动性风险指标
   */
  static calculateLiquidityRisk(positions) {
    let totalValue = 0;
    let illiquidValue = 0;
    
    positions.forEach(position => {
      const value = position.currentValuation?.marketValue || position.totalPremium;
      totalValue += value;
      
      // 简化流动性判断：接近到期的期权流动性差
      const daysToExpiry = (position.optionContract.expiryDate - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysToExpiry < 7) {
        illiquidValue += value;
      }
    });
    
    return {
      illiquidRatio: totalValue > 0 ? illiquidValue / totalValue : 0,
      illiquidValue,
      totalValue
    };
  }

  /**
   * 计算风险分数
   * @param {object} riskMetrics 风险指标
   * @param {object} riskLimits 风险限额
   * @returns {number} 风险分数 (0-100)
   */
  static calculateRiskScore(riskMetrics, riskLimits) {
    let score = 0;
    let factors = 0;
    
    // Delta风险 (权重: 25%)
    const deltaRatio = Math.abs(riskMetrics.netDelta) / riskLimits.deltaLimit;
    score += Math.min(deltaRatio * 25, 25);
    factors++;
    
    // Vega风险 (权重: 25%)
    const vegaRatio = Math.abs(riskMetrics.netVega) / riskLimits.vegaLimit;
    score += Math.min(vegaRatio * 25, 25);
    factors++;
    
    // 集中度风险 (权重: 20%)
    const concentrationRatio = riskMetrics.concentrationRisk.maxConcentration / riskLimits.concentrationLimit;
    score += Math.min(concentrationRatio * 20, 20);
    factors++;
    
    // 流动性风险 (权重: 15%)
    score += riskMetrics.liquidityRisk.illiquidRatio * 15;
    factors++;
    
    // 最大回撤 (权重: 15%)
    score += Math.abs(riskMetrics.maxDrawdown) * 15 / 50; // 假设50%为极限回撤
    factors++;
    
    return Math.min(Math.round(score), 100);
  }

  /**
   * 实时风险监控
   * @param {string} userId 用户ID
   * @returns {object} 风险监控结果
   */
  static async realTimeRiskMonitoring(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      const riskLimits = this.getUserRiskLimits(user.riskLevel);
      const riskMetrics = await this.calculatePortfolioRisk(userId);
      const riskScore = this.calculateRiskScore(riskMetrics, riskLimits);
      
      const alerts = [];
      
      // 检查各项风险指标
      if (Math.abs(riskMetrics.netDelta) > riskLimits.deltaLimit * 0.8) {
        alerts.push({
          type: 'warning',
          level: 'medium',
          message: `Delta风险接近限额: ${riskMetrics.netDelta}/${riskLimits.deltaLimit}`,
          action: '建议调整Delta中性'
        });
      }
      
      if (Math.abs(riskMetrics.netVega) > riskLimits.vegaLimit * 0.8) {
        alerts.push({
          type: 'warning',
          level: 'medium',
          message: `Vega风险接近限额: ${riskMetrics.netVega}/${riskLimits.vegaLimit}`,
          action: '建议对冲波动率风险'
        });
      }
      
      if (riskMetrics.concentrationRisk.maxConcentration > riskLimits.concentrationLimit * 0.8) {
        alerts.push({
          type: 'warning',
          level: 'high',
          message: `单一标的集中度过高: ${(riskMetrics.concentrationRisk.maxConcentration * 100).toFixed(1)}%`,
          action: '建议分散投资'
        });
      }
      
      if (riskMetrics.liquidityRisk.illiquidRatio > 0.3) {
        alerts.push({
          type: 'info',
          level: 'low',
          message: `流动性风险提醒: ${(riskMetrics.liquidityRisk.illiquidRatio * 100).toFixed(1)}%持仓流动性较差`,
          action: '关注到期日管理'
        });
      }

      return {
        userId,
        timestamp: new Date(),
        riskScore,
        riskLevel: this.getRiskLevel(riskScore),
        riskMetrics,
        riskLimits,
        alerts,
        recommendations: this.generateRiskRecommendations(riskMetrics, riskLimits)
      };

    } catch (error) {
      console.error('实时风险监控失败:', error);
      throw error;
    }
  }

  /**
   * 获取风险等级
   * @param {number} riskScore 风险分数
   * @returns {string} 风险等级
   */
  static getRiskLevel(riskScore) {
    if (riskScore < 30) return 'low';
    if (riskScore < 60) return 'medium';
    if (riskScore < 80) return 'high';
    return 'critical';
  }

  /**
   * 生成风险建议
   * @param {object} riskMetrics 风险指标
   * @param {object} riskLimits 风险限额
   * @returns {array} 建议列表
   */
  static generateRiskRecommendations(riskMetrics, riskLimits) {
    const recommendations = [];
    
    // Delta建议
    if (Math.abs(riskMetrics.netDelta) > riskLimits.deltaLimit * 0.5) {
      if (riskMetrics.netDelta > 0) {
        recommendations.push({
          type: 'hedge',
          priority: 'medium',
          message: 'Portfolio Delta偏多，建议卖出看涨期权或买入看跌期权进行对冲'
        });
      } else {
        recommendations.push({
          type: 'hedge',
          priority: 'medium',
          message: 'Portfolio Delta偏空，建议买入看涨期权或卖出看跌期权进行对冲'
        });
      }
    }
    
    // Theta建议
    if (riskMetrics.netTheta < -50) {
      recommendations.push({
        type: 'time_decay',
        priority: 'low',
        message: 'Portfolio受时间价值衰减影响较大，注意到期日管理'
      });
    }
    
    // 集中度建议
    if (riskMetrics.concentrationRisk.maxConcentration > 0.4) {
      recommendations.push({
        type: 'diversification',
        priority: 'high',
        message: '投资过于集中，建议分散到更多标的以降低单一标的风险'
      });
    }
    
    return recommendations;
  }

  /**
   * 压力测试
   * @param {string} userId 用户ID
   * @param {object} scenarios 压力情景
   * @returns {object} 压力测试结果
   */
  static async stressTesting(userId, scenarios = {}) {
    try {
      const activePositions = await Trade.findActivePositions(userId);
      if (activePositions.length === 0) {
        return { message: '无活跃持仓' };
      }

      // 默认压力情景
      const defaultScenarios = {
        market_crash: { priceChange: -0.2, volatilityChange: 0.5 },
        market_rally: { priceChange: 0.2, volatilityChange: -0.2 },
        volatility_spike: { priceChange: 0, volatilityChange: 1.0 },
        volatility_crush: { priceChange: 0, volatilityChange: -0.5 },
        interest_rate_up: { rateChange: 0.02 },
        interest_rate_down: { rateChange: -0.02 }
      };

      const testScenarios = { ...defaultScenarios, ...scenarios };
      const results = {};

      for (const [scenarioName, scenario] of Object.entries(testScenarios)) {
        let totalPnL = 0;
        const positionResults = [];

        activePositions.forEach(position => {
          // 简化的压力测试计算
          const currentValue = position.currentValuation?.marketValue || position.totalPremium;
          let newValue = currentValue;

          // 价格变化影响
          if (scenario.priceChange) {
            const deltaEffect = (position.currentGreeks?.delta || 0) * scenario.priceChange * 
                              position.optionContract.underlyingAsset.currentPrice;
            newValue += deltaEffect * position.quantity;
          }

          // 波动率变化影响
          if (scenario.volatilityChange) {
            const vegaEffect = (position.currentGreeks?.vega || 0) * scenario.volatilityChange * 100;
            newValue += vegaEffect * position.quantity;
          }

          // 利率变化影响
          if (scenario.rateChange) {
            const rhoEffect = (position.currentGreeks?.rho || 0) * scenario.rateChange * 100;
            newValue += rhoEffect * position.quantity;
          }

          const pnl = newValue - currentValue;
          totalPnL += pnl;

          positionResults.push({
            tradeId: position.tradeId,
            symbol: position.optionContract.underlyingAsset.symbol,
            currentValue,
            newValue,
            pnl,
            pnlPercent: currentValue > 0 ? (pnl / currentValue) * 100 : 0
          });
        });

        results[scenarioName] = {
          scenario,
          totalPnL: Math.round(totalPnL * 100) / 100,
          positions: positionResults
        };
      }

      return {
        userId,
        timestamp: new Date(),
        scenarios: results
      };

    } catch (error) {
      console.error('压力测试失败:', error);
      throw error;
    }
  }
}

module.exports = RiskManagementService;