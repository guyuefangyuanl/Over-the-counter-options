// 云函数入口文件
const cloud = require('wx-server-sdk')
const http = require('http')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const db = cloud.database()

// 简单的股票代码前缀判断
function getFullCode(code) {
  code = String(code)
  if (code.startsWith('6')) return 'sh' + code
  if (code.startsWith('0') || code.startsWith('3')) return 'sz' + code
  return 'sh' + code // 默认兜底
}

// 请求新浪财经接口
function fetchStockData(codes) {
  return new Promise((resolve, reject) => {
    // 拼接代码，例如: sh600519,sz000001
    const queryCodes = codes.map(getFullCode).join(',')
    const url = `http://hq.sinajs.cn/list=${queryCodes}`

    http.get(url, (res) => {
      let rawData = ''
      res.setEncoding('utf8') // 新浪接口通常是GBK，这里可能需要注意乱码问题
      // 云函数环境通常支持 Buffer，这里为了简单先尝试 utf8，如果不行动再换 hex
      // 注意：新浪接口返回的是 GBK 编码，Node.js 原生处理 GBK 比较麻烦
      // 为了稳定性，我们这里只提取数字部分（价格、涨跌幅），名称暂时不更新以避免乱码
      
      res.on('data', (chunk) => { rawData += chunk })
      res.on('end', () => {
        resolve(rawData)
      })
    }).on('error', (e) => {
      reject(e)
    })
  })
}

// 解析新浪返回的数据
function parseSinaData(rawData) {
  // 格式: var hq_str_sh600519="贵州茅台,1750.00,..."
  const lines = rawData.split('\n')
  const updates = {}
  
  lines.forEach(line => {
    if (!line.includes('="')) return
    
    const parts = line.split('="')
    const codePart = parts[0] // var hq_str_sh600519
    const dataPart = parts[1] // 贵州茅台,1750.00,...
    
    const code = codePart.split('_').pop().slice(2) // 600519
    const values = dataPart.split(',')
    
    if (values.length > 3) {
      // 0: name, 1: open, 2: prev_close, 3: current_price
      const currentPrice = parseFloat(values[3])
      const prevClose = parseFloat(values[2])
      
      let changePercent = 0
      if (prevClose > 0) {
        changePercent = ((currentPrice - prevClose) / prevClose) * 100
      }

      updates[code] = {
        price: currentPrice,
        changePercent: parseFloat(changePercent.toFixed(2)),
        // volume: parseInt(values[8]), // 成交量
        // amount: parseInt(values[9]), // 成交额
        updateTime: values[30] + ' ' + values[31] // 日期 + 时间
      }
    }
  })
  return updates
}

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 1. 获取数据库中所有股票代码
    // 注意：如果有分页限制，这里只演示获取前 100 个
    const res = await db.collection('quotes').limit(100).get()
    const stocks = res.data
    if (stocks.length === 0) return { msg: 'No stocks found' }

    const codes = stocks.map(s => s.code)
    
    // 2. 抓取数据
    console.log('Fetching data for:', codes)
    const rawData = await fetchStockData(codes)
    const updates = parseSinaData(rawData)
    
    // 3. 批量更新数据库 (云数据库不支持直接批量更新所有记录，需要循环)
    const tasks = []
    for (const stock of stocks) {
      const newData = updates[stock.code]
      if (newData) {
        // 更新这一条记录
        const promise = db.collection('quotes').doc(stock._id).update({
          data: {
            price: newData.price,
            changePercent: newData.changePercent,
            updateTime: newData.updateTime
          }
        })
        tasks.push(promise)
      }
    }

    await Promise.all(tasks)
    
    return {
      success: true,
      updatedCount: tasks.length,
      msg: 'Updated successfully'
    }

  } catch (err) {
    console.error(err)
    return {
      success: false,
      error: err
    }
  }
}
