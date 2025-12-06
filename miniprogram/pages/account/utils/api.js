const wait = (ms) => new Promise(r => setTimeout(r, ms))

exports.getAccount = async () => {
  await wait(200)
  return {
    userId: 'U123456789',
    nickName: '交易员小王',
    avatar: '/images/profile.png',
    vipLevel: 'VIP1',
    totalAssets: 1250500.00,
    availableFunds: 500000.00,
    frozenFunds: 50000.00,
    profitLoss: 125050.00,
    profitLossRate: 11.1,
    assetDistribution: [
      { name: '现金', value: 500000, percentage: 40 },
      { name: '持仓权益', value: 650000, percentage: 52 },
      { name: '待结算', value: 50000, percentage: 4 },
      { name: '冻结资金', value: 50000, percentage: 4 }
    ]
  }
}

exports.getPositions = async () => {
  await wait(200)
  return [
    { code: '600519', name: '贵州茅台', type: 'stock', quantity: 100, avgCost: 1680.50, currentPrice: 1720.00, marketValue: 172000.00, profitLoss: 3950.00, profitLossRate: 2.34, direction: 'long' },
    { code: '000858', name: '五粮液', type: 'stock', quantity: 300, avgCost: 128.40, currentPrice: 126.00, marketValue: 37800.00, profitLoss: -720.00, profitLossRate: -1.87, direction: 'long' }
  ]
}

exports.getTrades = async ({ page=1, pageSize=10, dir='all' }={}) => {
  await wait(200)
  const all = [
    { id: 'TR001', timestamp: '2025-11-21 14:30:00', underlying: '600519', direction: 'buy', quantity: 100, price: 1680.50, amount: 168050.00, fee: 168.05, status: 'completed' },
    { id: 'TR002', timestamp: '2025-11-21 15:10:00', underlying: '000858', direction: 'sell', quantity: 200, price: 129.00, amount: 25800.00, fee: 25.80, status: 'completed' }
  ]
  const filtered = dir==='all' ? all : all.filter(i=>i.direction===dir)
  const list = filtered.slice((page-1)*pageSize, page*pageSize)
  return { list, total: filtered.length }
}

exports.getFlows = async ({ page=1, pageSize=10 }={}) => {
  await wait(200)
  const all = [
    { id: 'FL001', timestamp: '2025-11-20 10:00:00', type: '入金', amount: 500000.00, status: '成功' },
    { id: 'FL002', timestamp: '2025-11-21 13:00:00', type: '出金', amount: 20000.00, status: '成功' }
  ]
  const list = all.slice((page-1)*pageSize, page*pageSize)
  return { list, total: all.length }
}

exports.getUnreadCount = async () => {
  await wait(100)
  return 3
}