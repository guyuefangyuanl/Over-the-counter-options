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
  try {
    const triggerName = event?.TriggerName || ''
    const updatePreClose =
      event?.updatePreClose === true || /daily/i.test(triggerName)

    /* 1️⃣ P0-1: 流式 Pipeline 处理（避免 OOM） */
    const countRes = await db.collection('quotes').count()
    const total = countRes.total
    if (total === 0) return { success: true, msg: 'No stocks found' }

    const PAGE_SIZE = 200
    const pages = Math.ceil(total / PAGE_SIZE)
    const now = db.serverDate()
    let updatedCount = 0

    // 按页处理，处理完即释放内存
    for (let i = 0; i < pages; i++) {
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

      // 2. 分批请求新浪行情（当前页内部分批）
      const FETCH_BATCH = 50
      for (let j = 0; j < codes.length; j += FETCH_BATCH) {
        const batchCodes = codes.slice(j, j + FETCH_BATCH)
        try {
          const raw = await fetchStockData(batchCodes)
          Object.assign(pageUpdatesMap, parseSinaData(raw))
        } catch (e) {
          console.error('Fetch batch failed:', batchCodes, e.message)
        }
      }

      // 3. 并发写库（仅处理当前页）
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
            await db.collection('quotes').doc(stock._id).update({
              data: updateData
            })
          }
        })
        .filter(Boolean)

      if (writeTasks.length > 0) {
        await withConcurrency(writeTasks, 10, task => task())
        updatedCount += writeTasks.length
      }
    }

    return {
      success: true,
      updatedCount,
      updatePreClose
    }

  } catch (err) {
    console.error(err)
    return {
      success: false,
      error: err.message || String(err)
    }
  }
}
