// 云函数入口文件
const cloud = require('wx-server-sdk')
const http = require('http')
const iconv = require('iconv-lite')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/* ---------------- 工具函数 ---------------- */

// 股票代码转新浪格式
function getFullCode(code) {
  code = String(code)
  if (code.startsWith('6')) return 'sh' + code
  if (code.startsWith('0') || code.startsWith('3')) return 'sz' + code
  return 'sh' + code
}

// 简单并发池（避免 Promise.all 写库爆掉）
async function withConcurrency(items, limit, fn) {
  let index = 0
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = index++
      await fn(items[current], current)
    }
  })
  await Promise.all(workers)
}

// 请求新浪行情
function fetchStockData(codes) {
  return new Promise((resolve, reject) => {
    const queryCodes = codes.map(getFullCode).join(',')
    const url = `http://hq.sinajs.cn/list=${queryCodes}`

    const req = http.get(url, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const rawData = iconv.decode(buffer, 'gbk')
        resolve(rawData)
      })
    })

    req.on('error', reject)
    
    // P0-2: 设置超时，防止请求挂起阻塞云函数
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('Request timeout (8s)'))
    })
  })
}

/**
 * 性能指标收集器
 */
class PerformanceMetrics {
  constructor() {
    this.startTime = Date.now()
    this.metrics = {
      totalStocks: 0,
      successCount: 0,
      failCount: 0,
      fetchRetries: 0,
      dbRetries: 0,
      fetchTime: 0,
      dbTime: 0
    }
  }
  
  recordFetchSuccess(count, duration) {
    this.metrics.successCount += count
    this.metrics.fetchTime += duration
  }
  
  recordFetchFail(count) {
    this.metrics.failCount += count
  }
  
  recordRetry(type) {
    if (type === 'fetch') this.metrics.fetchRetries++
    if (type === 'db') this.metrics.dbRetries++
  }
  
  recordDbTime(duration) {
    this.metrics.dbTime += duration
  }
  
  getSummary() {
    const totalTime = Date.now() - this.startTime
    return {
      ...this.metrics,
      totalTime,
      avgFetchTime: this.metrics.fetchTime / Math.max(1, this.metrics.successCount),
      successRate: (this.metrics.successCount / Math.max(1, this.metrics.totalStocks) * 100).toFixed(2) + '%'
    }
  }
}

// 解析新浪返回
function parseSinaData(rawData) {
  const lines = rawData.split('\n')
  const updates = {}

  lines.forEach(line => {
    if (!line.includes('="')) return

    const parts = line.split('="')
    const codePart = parts[0]
    const dataPart = parts[1]

    const code = codePart.split('_').pop().slice(2)
    const values = dataPart.split(',')

    if (values.length < 4) return

    const currentPrice = parseFloat(values[3])
    const prevClose = parseFloat(values[2])
    if (!Number.isFinite(currentPrice) || !Number.isFinite(prevClose)) return

    const changePercent = prevClose > 0
      ? ((currentPrice - prevClose) / prevClose) * 100
      : 0

    updates[code] = {
      price: currentPrice,
      preClose: prevClose,
      changePercent: parseFloat(changePercent.toFixed(2))
    }
  })

  return updates
}

/* ---------------- 云函数入口 ---------------- */

exports.main = async (event, context) => {
  const perfMetrics = new PerformanceMetrics()
  
  try {
    const triggerName = event?.TriggerName || ''
    const updatePreClose =
      event?.updatePreClose === true || /daily/i.test(triggerName)

    /* 1️⃣ P0-1: 流式Pipeline处理（避免OOM） */
    const countRes = await db.collection('quotes').count()
    const total = countRes.total
    if (total === 0) return { success: true, msg: 'No stocks found' }

    perfMetrics.metrics.totalStocks = total
    console.log(`📈 开始更新 ${total} 支股票行情...`)

    const PAGE_SIZE = 200
    const pages = Math.ceil(total / PAGE_SIZE)
    const now = db.serverDate()
    let updatedCount = 0

    // 按页处理，处理完即释放内存
    for (let i = 0; i < pages; i++) {
      console.log(`📋 处理第 ${i + 1}/${pages} 页...`)
      
      // 1. 读取当前页
      const res = await db.collection('quotes')
        .skip(i * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .field({ _id: true, code: true })
        .get()
      
      const pageStocks = res.data
      if (!pageStocks || pageStocks.length === 0) continue

      const codes = pageStocks.map(s => s.code).filter(Boolean)
      const pageUpdatesMap = {}

      // 2. 分批请求新浪行情（当前页内部分批）+ 重试机制
      const FETCH_BATCH = 50
      for (let j = 0; j < codes.length; j += FETCH_BATCH) {
        const batchCodes = codes.slice(j, j + FETCH_BATCH)
        try {
          const fetchStart = Date.now()
          const raw = await fetchStockDataWithRetry(batchCodes, 3, 1000)
          const fetchDuration = Date.now() - fetchStart
          
          const parsed = parseSinaData(raw)
          Object.assign(pageUpdatesMap, parsed)
          
          perfMetrics.recordFetchSuccess(batchCodes.length, fetchDuration)
        } catch (e) {
          console.error(`❌ 批次最终失败: ${batchCodes.slice(0,3).join(',')}, 错误: ${e.message}`)
          perfMetrics.recordFetchFail(batchCodes.length)
        }
      }

      // 3. 并发写库（仅处理当前页）+ 重试机制
      const writeTasks = pageStocks
        .map(stock => {
          const data = pageUpdatesMap[stock.code]
          if (!data) return null

          const updateData = {
            price: data.price,
            changePercent: data.changePercent,
            updateTime: now
          }
          if (updatePreClose) updateData.preClose = data.preClose

          return async () => {
            const dbStart = Date.now()
            await updateDocWithRetry(db, stock._id, updateData, 2)
            perfMetrics.recordDbTime(Date.now() - dbStart)
          }
        })
        .filter(Boolean)

      if (writeTasks.length > 0) {
        // P0-3: 提高写并发到50，以加速大批量存储（分钟级目标）
        await withConcurrency(writeTasks, 50, task => task())
        updatedCount += writeTasks.length
      }
      
      // 页间延迟，避免请求过于频繁
      if (i < pages - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    const summary = perfMetrics.getSummary()
    console.log('🏁 更新完成，性能指标:', JSON.stringify(summary, null, 2))

    return {
      success: true,
      updatedCount,
      updatePreClose,
      performance: summary
    }

  } catch (err) {
    console.error('❌ 云函数执行错误:', err)
    return {
      success: false,
      error: err.message || String(err),
      performance: perfMetrics.getSummary()
    }
  }
}
