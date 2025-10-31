// utils/risk-monitor.js
/**
 * 风险监控工具类
 * 对标支付宝期权的风险管理功能
 */
class RiskMonitor {
  constructor() {
    this.riskThresholds = {
      positionRatio: 0.3, // 持仓比例阈值30%
      singlePositionRatio: 0.1, // 单笔持仓比例阈值10%
      leverageRatio: 5, // 杠杆倍数阈值5倍
      profitLossRatio: 0.2, // 盈亏比例阈值20%
      nearExpiryDays: 5 // 临近到期预警天数
    };
    
    this.riskLevels = {
      LOW: { level: 1, name: '低风险', color: '#52c41a' },
      MEDIUM: { level: 2, name: '中风险', color: '#faad14' },
      HIGH: { level: 3, name: '高风险', color: '#ff4d4f' },
      CRITICAL: { level: 4, name: '极高风险', color: '#a8071a' }
    };
  }

  /**
   * 综合风险评估
   * @param {Object} portfolioData - 投资组合数据
   * @returns {Object} 风险评估结果
   */
  assessOverallRisk(portfolioData) {
    const risks = {
      positionRisk: this.assessPositionRisk(portfolioData),
      leverageRisk: this.assessLeverageRisk(portfolioData),
      concentrationRisk: this.assessConcentrationRisk(portfolioData),
      timeRisk: this.assessTimeRisk(portfolioData),
      marketRisk: this.assessMarketRisk(portfolioData)
    };

    // 计算综合风险等级
    const maxRiskLevel = Math.max(...Object.values(risks).map(r => r.level));
    const overallRisk = Object.values(this.riskLevels).find(r => r.level === maxRiskLevel);

    return {
      overall: overallRisk,
      details: risks,
      recommendations: this.generateRecommendations(risks),
      alerts: this.generateAlerts(risks)
    };
  }

  /**
   * 持仓风险评估
   */
  assessPositionRisk(portfolioData) {
    const { totalAssets, totalPositions } = portfolioData;
    const positionRatio = totalPositions / totalAssets;

    if (positionRatio > this.riskThresholds.positionRatio * 1.5) {
      return { ...this.riskLevels.CRITICAL, reason: '持仓比例过高' };
    } else if (positionRatio > this.riskThresholds.positionRatio) {
      return { ...this.riskLevels.HIGH, reason: '持仓比例偏高' };
    } else if (positionRatio > this.riskThresholds.positionRatio * 0.7) {
      return { ...this.riskLevels.MEDIUM, reason: '持仓比例适中' };
    } else {
      return { ...this.riskLevels.LOW, reason: '持仓比例合理' };
    }
  }

  /**
   * 杠杆风险评估
   */
  assessLeverageRisk(portfolioData) {
    const { totalAssets, leverage = 1 } = portfolioData;
    
    if (leverage > this.riskThresholds.leverageRatio * 2) {
      return { ...this.riskLevels.CRITICAL, reason: '杠杆倍数极高' };
    } else if (leverage > this.riskThresholds.leverageRatio) {
      return { ...this.riskLevels.HIGH, reason: '杠杆倍数过高' };
    } else if (leverage > this.riskThresholds.leverageRatio * 0.6) {
      return { ...this.riskLevels.MEDIUM, reason: '杠杆倍数适中' };
    } else {
      return { ...this.riskLevels.LOW, reason: '杠杆倍数合理' };
    }
  }

  /**
   * 集中度风险评估
   */
  assessConcentrationRisk(portfolioData) {
    const { positions = [] } = portfolioData;
    
    if (positions.length === 0) {
      return { ...this.riskLevels.LOW, reason: '暂无持仓' };
    }

    // 计算最大单一持仓比例
    const maxPosition = Math.max(...positions.map(p => p.scale));
    const totalScale = positions.reduce((sum, p) => sum + p.scale, 0);
    const maxRatio = maxPosition / totalScale;

    if (maxRatio > 0.5) {
      return { ...this.riskLevels.HIGH, reason: '持仓过度集中' };
    } else if (maxRatio > 0.3) {
      return { ...this.riskLevels.MEDIUM, reason: '持仓集中度偏高' };
    } else {
      return { ...this.riskLevels.LOW, reason: '持仓分散合理' };
    }
  }

  /**
   * 时间风险评估
   */
  assessTimeRisk(portfolioData) {
    const { positions = [] } = portfolioData;
    const now = new Date();
    
    let nearExpiryCount = 0;
    let totalCount = positions.length;

    positions.forEach(position => {
      const expiryDate = new Date(position.expireTime);
      const daysToExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiry <= this.riskThresholds.nearExpiryDays) {
        nearExpiryCount++;
      }
    });

    const nearExpiryRatio = nearExpiryCount / totalCount;

    if (nearExpiryRatio > 0.5) {
      return { ...this.riskLevels.HIGH, reason: '多个持仓临近到期' };
    } else if (nearExpiryRatio > 0.2) {
      return { ...this.riskLevels.MEDIUM, reason: '部分持仓临近到期' };
    } else {
      return { ...this.riskLevels.LOW, reason: '到期时间合理' };
    }
  }

  /**
   * 市场风险评估
   */
  assessMarketRisk(portfolioData) {
    const { marketVolatility = 0.2, correlation = 0.5 } = portfolioData;

    if (marketVolatility > 0.4 && correlation > 0.8) {
      return { ...this.riskLevels.HIGH, reason: '市场波动大且相关性高' };
    } else if (marketVolatility > 0.3 || correlation > 0.7) {
      return { ...this.riskLevels.MEDIUM, reason: '市场风险适中' };
    } else {
      return { ...this.riskLevels.LOW, reason: '市场风险可控' };
    }
  }

  /**
   * 生成风险建议
   */
  generateRecommendations(risks) {
    const recommendations = [];

    Object.entries(risks).forEach(([type, risk]) => {
      switch (risk.level) {
        case 4: // CRITICAL
          recommendations.push({
            type: 'URGENT',
            message: `${type}: ${risk.reason}，建议立即调整持仓结构`,
            action: 'REDUCE_POSITION'
          });
          break;
        case 3: // HIGH
          recommendations.push({
            type: 'WARNING',
            message: `${type}: ${risk.reason}，建议适当降低风险敞口`,
            action: 'MONITOR_CLOSELY'
          });
          break;
        case 2: // MEDIUM
          recommendations.push({
            type: 'CAUTION',
            message: `${type}: ${risk.reason}，建议密切关注市场变化`,
            action: 'REGULAR_REVIEW'
          });
          break;
      }
    });

    return recommendations;
  }

  /**
   * 生成风险警报
   */
  generateAlerts(risks) {
    const alerts = [];
    const highRiskCount = Object.values(risks).filter(r => r.level >= 3).length;

    if (highRiskCount >= 3) {
      alerts.push({
        level: 'CRITICAL',
        title: '多重风险警告',
        message: '您的投资组合存在多重高风险因素，请立即采取风险控制措施'
      });
    } else if (highRiskCount >= 2) {
      alerts.push({
        level: 'HIGH',
        title: '风险提醒',
        message: '检测到多个风险因素，建议调整投资策略'
      });
    }

    return alerts;
  }

  /**
   * 实时风险监控
   */
  startRealTimeMonitoring(portfolioData, callback) {
    const monitor = () => {
      const riskAssessment = this.assessOverallRisk(portfolioData);
      callback(riskAssessment);
    };

    // 每5分钟监控一次
    const interval = setInterval(monitor, 5 * 60 * 1000);
    
    // 立即执行一次
    monitor();

    return {
      stop: () => clearInterval(interval)
    };
  }
}

// 资金管理工具类
class FundManager {
  constructor() {
    this.managementRules = {
      maxSinglePositionRatio: 0.1, // 单笔最大持仓比例10%
      maxTotalPositionRatio: 0.3, // 总持仓比例30%
      minCashReserve: 0.1, // 最低现金储备10%
      stopLossRatio: 0.05, // 止损比例5%
      takeProfitRatio: 0.15 // 止盈比例15%
    };
  }

  /**
   * 资金配置建议
   */
  getPositionSizeRecommendation(accountData, targetPosition) {
    const { totalAssets, availableFunds, riskTolerance = 'MEDIUM' } = accountData;
    const { expectedReturn, maxLoss, confidence } = targetPosition;

    // 基于风险承受能力调整配置比例
    const riskMultipliers = {
      LOW: 0.5,
      MEDIUM: 1.0,
      HIGH: 1.5
    };

    const baseRatio = this.managementRules.maxSinglePositionRatio;
    const adjustedRatio = baseRatio * riskMultipliers[riskTolerance] * (confidence || 1);
    const recommendedAmount = Math.min(
      totalAssets * adjustedRatio,
      availableFunds * 0.8
    );

    return {
      recommendedAmount,
      maxAmount: totalAssets * this.managementRules.maxSinglePositionRatio * 1.5,
      reasoning: `基于您的风险承受能力(${riskTolerance})和资金状况，建议投入金额`,
      warnings: this.generateFundWarnings(accountData, recommendedAmount)
    };
  }

  /**
   * 生成资金管理警告
   */
  generateFundWarnings(accountData, proposedAmount) {
    const warnings = [];
    const { totalAssets, availableFunds } = accountData;

    if (proposedAmount > availableFunds) {
      warnings.push('拟投入金额超过可用资金');
    }

    if (proposedAmount / totalAssets > this.managementRules.maxSinglePositionRatio) {
      warnings.push('单笔投入比例过高，建议降低投入金额');
    }

    const remainingCash = availableFunds - proposedAmount;
    if (remainingCash / totalAssets < this.managementRules.minCashReserve) {
      warnings.push('剩余现金储备不足，建议保留更多流动资金');
    }

    return warnings;
  }
}

// 交易记录管理类
class TransactionManager {
  constructor() {
    this.transactions = [];
  }

  /**
   * 记录交易
   */
  recordTransaction(transaction) {
    const record = {
      id: this.generateTransactionId(),
      timestamp: new Date(),
      ...transaction,
      status: 'RECORDED'
    };

    this.transactions.unshift(record);
    this.saveToStorage();
    
    return record;
  }

  /**
   * 获取交易历史
   */
  getTransactionHistory(filters = {}) {
    let filtered = [...this.transactions];

    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }

    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      filtered = filtered.filter(t => {
        const date = new Date(t.timestamp);
        return date >= start && date <= end;
      });
    }

    if (filters.underlying) {
      filtered = filtered.filter(t => t.underlying === filters.underlying);
    }

    return filtered;
  }

  /**
   * 计算交易统计
   */
  getTransactionStats(timeRange = '1M') {
    const now = new Date();
    const rangeStart = new Date();
    
    switch (timeRange) {
      case '1W':
        rangeStart.setDate(now.getDate() - 7);
        break;
      case '1M':
        rangeStart.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        rangeStart.setMonth(now.getMonth() - 3);
        break;
      case '1Y':
        rangeStart.setFullYear(now.getFullYear() - 1);
        break;
    }

    const rangeTransactions = this.transactions.filter(t => 
      new Date(t.timestamp) >= rangeStart
    );

    const totalCount = rangeTransactions.length;
    const totalVolume = rangeTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    const profitableCount = rangeTransactions.filter(t => (t.pnl || 0) > 0).length;
    const winRate = totalCount > 0 ? (profitableCount / totalCount * 100).toFixed(2) : 0;

    return {
      totalCount,
      totalVolume,
      winRate: `${winRate}%`,
      avgProfit: totalCount > 0 ? (rangeTransactions.reduce((sum, t) => sum + (t.pnl || 0), 0) / totalCount).toFixed(2) : 0,
      maxProfit: Math.max(...rangeTransactions.map(t => t.pnl || 0), 0),
      maxLoss: Math.min(...rangeTransactions.map(t => t.pnl || 0), 0)
    };
  }

  generateTransactionId() {
    return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase();
  }

  saveToStorage() {
    try {
      wx.setStorageSync('transaction_history', this.transactions.slice(0, 1000)); // 保留最近1000条
    } catch (error) {
      console.error('保存交易记录失败:', error);
    }
  }

  loadFromStorage() {
    try {
      const stored = wx.getStorageSync('transaction_history');
      if (stored && Array.isArray(stored)) {
        this.transactions = stored;
      }
    } catch (error) {
      console.error('加载交易记录失败:', error);
    }
  }
}

module.exports = {
  RiskMonitor,
  FundManager,
  TransactionManager
};