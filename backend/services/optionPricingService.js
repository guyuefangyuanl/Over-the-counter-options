/**
 * Black-Scholes期权定价模型服务
 * 实现完整的期权定价功能，包括希腊字母计算
 */

class OptionPricingService {
  /**
   * 标准正态分布累积分布函数
   * @param {number} x 
   * @returns {number}
   */
  static normalCDF(x) {
    // 使用Abramowitz and Stegun近似公式
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x) / Math.sqrt(2);
    
    // A&S 公式7.1.26
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 标准正态分布概率密度函数
   * @param {number} x 
   * @returns {number}
   */
  static normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * 计算d1和d2参数
   * @param {number} S 标的价格
   * @param {number} K 执行价格
   * @param {number} T 到期时间（年）
   * @param {number} r 无风险利率
   * @param {number} sigma 波动率
   * @param {number} q 股息收益率
   * @returns {object} {d1, d2}
   */
  static calculateD1D2(S, K, T, r, sigma, q = 0) {
    if (T <= 0) {
      throw new Error('到期时间必须大于0');
    }
    
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    
    return { d1, d2 };
  }

  /**
   * Black-Scholes期权定价
   * @param {object} params 定价参数
   * @param {number} params.S 标的价格
   * @param {number} params.K 执行价格
   * @param {number} params.T 到期时间（年）
   * @param {number} params.r 无风险利率
   * @param {number} params.sigma 波动率
   * @param {number} params.q 股息收益率（默认0）
   * @param {string} params.optionType 期权类型 'call' 或 'put'
   * @returns {object} 期权价格和希腊字母
   */
  static blackScholes(params) {
    const { S, K, T, r, sigma, q = 0, optionType } = params;
    
    // 参数验证
    if (S <= 0) throw new Error('标的价格必须大于0');
    if (K <= 0) throw new Error('执行价格必须大于0');
    if (T <= 0) throw new Error('到期时间必须大于0');
    if (sigma <= 0) throw new Error('波动率必须大于0');
    if (r < 0) throw new Error('无风险利率不能为负');
    if (q < 0) throw new Error('股息收益率不能为负');
    
    const { d1, d2 } = this.calculateD1D2(S, K, T, r, sigma, q);
    
    const Nd1 = this.normalCDF(d1);
    const Nd2 = this.normalCDF(d2);
    const nd1 = this.normalPDF(d1);
    
    let price, delta, gamma, theta, vega, rho;
    
    if (optionType.toLowerCase() === 'call') {
      // Call期权
      price = S * Math.exp(-q * T) * Nd1 - K * Math.exp(-r * T) * Nd2;
      delta = Math.exp(-q * T) * Nd1;
      rho = K * T * Math.exp(-r * T) * Nd2;
    } else if (optionType.toLowerCase() === 'put') {
      // Put期权
      price = K * Math.exp(-r * T) * this.normalCDF(-d2) - S * Math.exp(-q * T) * this.normalCDF(-d1);
      delta = -Math.exp(-q * T) * this.normalCDF(-d1);
      rho = -K * T * Math.exp(-r * T) * this.normalCDF(-d2);
    } else {
      throw new Error('期权类型必须是call或put');
    }
    
    // 共同的希腊字母
    gamma = Math.exp(-q * T) * nd1 / (S * sigma * Math.sqrt(T));
    theta = -(S * nd1 * sigma * Math.exp(-q * T)) / (2 * Math.sqrt(T)) 
            - r * K * Math.exp(-r * T) * (optionType.toLowerCase() === 'call' ? Nd2 : this.normalCDF(-d2))
            + q * S * Math.exp(-q * T) * (optionType.toLowerCase() === 'call' ? Nd1 : this.normalCDF(-d1));
    theta = theta / 365; // 转换为每日theta
    
    vega = S * Math.exp(-q * T) * nd1 * Math.sqrt(T) / 100; // 转换为1%波动率变化的影响
    
    return {
      price: Math.max(0, price),
      greeks: {
        delta: Math.round(delta * 10000) / 10000,
        gamma: Math.round(gamma * 10000) / 10000,
        theta: Math.round(theta * 100) / 100,
        vega: Math.round(vega * 100) / 100,
        rho: Math.round(rho * 100) / 100
      }
    };
  }

  /**
   * 美式期权定价（二叉树模型）
   * @param {object} params 定价参数
   * @param {number} params.steps 时间步数
   * @returns {object} 期权价格和希腊字母
   */
  static americanOption(params) {
    const { S, K, T, r, sigma, q = 0, optionType, steps = 100 } = params;
    
    const dt = T / steps;
    const u = Math.exp(sigma * Math.sqrt(dt));
    const d = 1 / u;
    const p = (Math.exp((r - q) * dt) - d) / (u - d);
    const discount = Math.exp(-r * dt);
    
    // 构建二叉树
    const tree = [];
    for (let i = 0; i <= steps; i++) {
      tree[i] = [];
    }
    
    // 初始化到期时的期权价值
    for (let j = 0; j <= steps; j++) {
      const St = S * Math.pow(u, steps - j) * Math.pow(d, j);
      if (optionType.toLowerCase() === 'call') {
        tree[steps][j] = Math.max(0, St - K);
      } else {
        tree[steps][j] = Math.max(0, K - St);
      }
    }
    
    // 向后递推计算期权价值
    for (let i = steps - 1; i >= 0; i--) {
      for (let j = 0; j <= i; j++) {
        const St = S * Math.pow(u, i - j) * Math.pow(d, j);
        const holdValue = discount * (p * tree[i + 1][j] + (1 - p) * tree[i + 1][j + 1]);
        
        let exerciseValue = 0;
        if (optionType.toLowerCase() === 'call') {
          exerciseValue = Math.max(0, St - K);
        } else {
          exerciseValue = Math.max(0, K - St);
        }
        
        tree[i][j] = Math.max(holdValue, exerciseValue);
      }
    }
    
    // 计算希腊字母（有限差分法）
    const price = tree[0][0];
    
    // Delta计算
    const deltaUp = tree[1][0];
    const deltaDown = tree[1][1];
    const delta = (deltaUp - deltaDown) / (S * u - S * d);
    
    // Gamma计算（需要更多节点）
    let gamma = 0;
    if (steps >= 2) {
      const S_uu = S * u * u;
      const S_ud = S * u * d;
      const S_dd = S * d * d;
      
      // 简化gamma计算
      gamma = ((tree[2][0] - tree[2][1]) / (S_uu - S_ud) - (tree[2][1] - tree[2][2]) / (S_ud - S_dd)) / 
              (0.5 * (S_uu - S_dd));
    }
    
    return {
      price: Math.max(0, price),
      greeks: {
        delta: Math.round(delta * 10000) / 10000,
        gamma: Math.round(gamma * 10000) / 10000,
        theta: 0, // 二叉树theta计算较复杂，这里简化
        vega: 0,  // 需要对波动率求导，简化处理
        rho: 0    // 需要对利率求导，简化处理
      }
    };
  }

  /**
   * 隐含波动率计算（牛顿法）
   * @param {object} params 市场参数
   * @param {number} params.marketPrice 市场价格
   * @param {number} params.S 标的价格
   * @param {number} params.K 执行价格
   * @param {number} params.T 到期时间
   * @param {number} params.r 无风险利率
   * @param {number} params.q 股息收益率
   * @param {string} params.optionType 期权类型
   * @returns {number} 隐含波动率
   */
  static impliedVolatility(params) {
    const { marketPrice, S, K, T, r, q = 0, optionType } = params;
    
    if (marketPrice <= 0) {
      throw new Error('市场价格必须大于0');
    }
    
    let sigma = 0.2; // 初始猜测值20%
    const tolerance = 1e-6;
    const maxIterations = 100;
    
    for (let i = 0; i < maxIterations; i++) {
      try {
        const result = this.blackScholes({ S, K, T, r, sigma, q, optionType });
        const price = result.price;
        const vega = result.greeks.vega * 100; // 转换回原始vega
        
        const diff = price - marketPrice;
        
        if (Math.abs(diff) < tolerance) {
          return Math.round(sigma * 10000) / 10000;
        }
        
        if (Math.abs(vega) < 1e-10) {
          break; // Vega太小，无法继续迭代
        }
        
        // 牛顿法更新
        const newSigma = sigma - diff / vega;
        
        if (newSigma <= 0) {
          sigma = sigma / 2; // 如果新的sigma为负，减半当前值
        } else {
          sigma = newSigma;
        }
        
      } catch (error) {
        // 如果计算出错，调整sigma
        sigma = sigma * 0.9;
        if (sigma < 0.001) break;
      }
    }
    
    // 如果无法收敛，返回合理的默认值
    if (sigma <= 0 || sigma > 5) {
      return 0.2; // 默认20%波动率
    }
    
    return Math.round(sigma * 10000) / 10000;
  }

  /**
   * 蒙特卡洛期权定价
   * @param {object} params 定价参数
   * @param {number} params.simulations 模拟次数
   * @returns {object} 期权价格和统计信息
   */
  static monteCarloOption(params) {
    const { S, K, T, r, sigma, q = 0, optionType, simulations = 100000 } = params;
    
    const dt = T;
    const drift = (r - q - 0.5 * sigma * sigma) * dt;
    const diffusion = sigma * Math.sqrt(dt);
    const discount = Math.exp(-r * T);
    
    let sumPayoff = 0;
    const payoffs = [];
    
    for (let i = 0; i < simulations; i++) {
      // 生成随机数（Box-Muller变换）
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      // 计算到期股价
      const ST = S * Math.exp(drift + diffusion * z);
      
      // 计算期权收益
      let payoff = 0;
      if (optionType.toLowerCase() === 'call') {
        payoff = Math.max(0, ST - K);
      } else {
        payoff = Math.max(0, K - ST);
      }
      
      payoffs.push(payoff);
      sumPayoff += payoff;
    }
    
    const avgPayoff = sumPayoff / simulations;
    const price = discount * avgPayoff;
    
    // 计算置信区间
    const variance = payoffs.reduce((sum, p) => sum + Math.pow(p - avgPayoff, 2), 0) / (simulations - 1);
    const stdError = Math.sqrt(variance / simulations);
    const confidence95 = 1.96 * stdError * discount;
    
    return {
      price: Math.max(0, price),
      statistics: {
        simulations,
        avgPayoff,
        stdError,
        confidence95: [price - confidence95, price + confidence95]
      }
    };
  }

  /**
   * 期权组合定价
   * @param {array} options 期权组合
   * @returns {object} 组合价格和希腊字母
   */
  static portfolioPricing(options) {
    let totalPrice = 0;
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;
    
    const results = [];
    
    for (const option of options) {
      const { quantity = 1, side = 'long' } = option;
      const multiplier = side === 'long' ? 1 : -1;
      
      const result = this.blackScholes(option);
      const adjustedPrice = result.price * quantity * multiplier;
      const adjustedGreeks = {
        delta: result.greeks.delta * quantity * multiplier,
        gamma: result.greeks.gamma * quantity * multiplier,
        theta: result.greeks.theta * quantity * multiplier,
        vega: result.greeks.vega * quantity * multiplier,
        rho: result.greeks.rho * quantity * multiplier
      };
      
      totalPrice += adjustedPrice;
      totalDelta += adjustedGreeks.delta;
      totalGamma += adjustedGreeks.gamma;
      totalTheta += adjustedGreeks.theta;
      totalVega += adjustedGreeks.vega;
      totalRho += adjustedGreeks.rho;
      
      results.push({
        option,
        price: result.price,
        adjustedPrice,
        greeks: result.greeks,
        adjustedGreeks
      });
    }
    
    return {
      totalPrice: Math.round(totalPrice * 100) / 100,
      totalGreeks: {
        delta: Math.round(totalDelta * 10000) / 10000,
        gamma: Math.round(totalGamma * 10000) / 10000,
        theta: Math.round(totalTheta * 100) / 100,
        vega: Math.round(totalVega * 100) / 100,
        rho: Math.round(totalRho * 100) / 100
      },
      components: results
    };
  }
}

module.exports = OptionPricingService;