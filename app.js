const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// 加载环境变量
const defaultEnvPath = path.resolve(__dirname, '.env')
const localEnvPath = path.resolve(__dirname, '.env.local')

if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath })
  console.log('✅ 已从 .env 加载基础环境变量')
}

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true })
  console.log('✅ 已从 .env.local 加载并覆盖本地环境变量')
}

const compression = require('compression')
const cors = require('cors')
const express = require('express')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')
const { spawn } = require('child_process')
const multer = require('multer')
const XLSX = require('xlsx')
const { parse: csvParse } = require('csv-parse/sync')
const { v4: uuidv4 } = require('uuid')

const { cloudDb, getMockDbPath, loadMockDb, writeMockDb, parsePagination } = require('./backend-utils/db')
const response = require('./backend-utils/response')

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { customLogger, requestLogger } = require('./middleware/logger')

const app = express()

app.set('trust proxy', true)

app.use(helmet({
  contentSecurityPolicy: false,
}))
app.use(compression())
app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)
app.use(customLogger)

// 静态文件服务
app.use(express.static(path.join(__dirname, 'admin-ui/dist')))
app.use('/admin-web', express.static(path.join(__dirname, 'admin-web')))
app.use('/images', express.static(path.join(__dirname, 'images')))

// 清理旧的上传会话文件
try {
  const cacheDir = path.resolve(__dirname, 'temp_uploads')
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir)
    const now = Date.now()
    files.forEach((file) => {
      const filePath = path.join(cacheDir, file)
      const stats = fs.statSync(filePath)
      // 删除超过 24 小时的文件
      if (now - stats.mtimeMs > 24 * 3600 * 1000) {
        fs.unlinkSync(filePath)
      }
    })
  }
} catch (e) {
  console.warn('⚠️ 清理临时上传文件失败:', e.message)
}

// 路由配置
app.use('/api/v1/groups', require('./routes/group'))

app.get('/api/v1/health', (req, res) => {
  return response.success(res, {
    status: 'healthy',
    version: 'v1',
    service: 'stock-trading-backend',
    environment: process.env.NODE_ENV || 'development',
  }, 'API v1 运行正常')
})

function getBearerToken(req) {
  const raw = req.headers && typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (!raw.startsWith('Bearer ')) return null
  const token = raw.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

function signAdminToken(username) {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'option_trading_secret_key_backup'
  const expiresInRaw = process.env.JWT_EXPIRES_SECONDS || '86400'
  const expiresIn = Number.parseInt(String(expiresInRaw), 10)
  const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400

  return jwt.sign({ sub: username, role: 'admin' }, secret, {
    algorithm: 'HS256',
    expiresIn: safeExpiresIn,
  })
}

app.post('/api/v1/auth/login', (req, res) => {
  const username = req.body && typeof req.body.username === 'string' ? req.body.username.trim() : ''
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : ''

  if (username === '') {
    return response.error(res, 'username 不能为空', 400)
  }
  if (password.trim() === '') {
    return response.error(res, 'password 不能为空', 400)
  }

  const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123'

  if (username !== expectedUsername || password !== expectedPassword) {
    return response.error(res, '用户名或密码错误', 401)
  }

  const expiresInRaw = process.env.JWT_EXPIRES_SECONDS || '86400'
  const expiresIn = Number.parseInt(String(expiresInRaw), 10)
  const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400
  const token = signAdminToken(username)

  return response.success(res, {
    token,
    tokenType: 'Bearer',
    expiresIn: safeExpiresIn,
  }, '登录成功')
})

app.get('/api/v1/auth/me', (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return response.error(res, '未登录或登录已过期', 401)
  }

  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'option_trading_secret_key_backup'

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    const username = payload && typeof payload === 'object' ? payload.sub : null
    const role = payload && typeof payload === 'object' ? payload.role : null

    return response.success(res, { username, role })
  } catch (e) {
    return response.error(res, '无效的登录凭证', 401)
  }
})

app.get('/api/v1/admin/stats', adminAuth, async (req, res) => {
  try {
    if (cloudDb) {
      const [stockCount, inquiryCount, orderCount] = await Promise.all([
        cloudDb.count('quotes'),
        cloudDb.count('inquiries'),
        cloudDb.count('orders')
      ])
      return response.success(res, {
        stockCount: stockCount || 0,
        inquiryCount: inquiryCount || 0,
        pendingInquiryCount: 0,
        orderCount: orderCount || 0,
      })
    }

    const db = loadMockDb()
    const stocks = Array.isArray(db.stocks) ? db.stocks : []
    console.log(`[Quotes] Mock DB loaded: ${stocks.length} stocks found`)

    return response.success(res, {
      stockCount: stocks.length,
      inquiryCount: 0,
      pendingInquiryCount: 0,
      orderCount: 0,
    })
  } catch (e) {
    console.error('❌ 获取统计数据失败:', e.message)
    return response.error(res, '获取统计失败', 500)
  }
})

app.get('/api/v1/admin/quotes', adminAuth, async (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return response.error(res, pagination.error.message, pagination.error.status)
  }

  const { page, pageSize } = pagination.value
  const start = (page - 1) * pageSize

  try {
    console.log(`[Quotes] GET /api/v1/admin/quotes - page:${page}, pageSize:${pageSize}, forcing mock mode`)
    /* 暂时禁用云端，强制使用本地以排查显示问题
    if (cloudDb) {
      const total = await cloudDb.count('quotes')
      const items = await cloudDb.query(`db.collection("quotes").orderBy("updated_at", "desc").skip(${start}).limit(${pageSize}).get()`)
      
      return response.success(res, {
        items,
        pagination: {
          page,
          per_page: pageSize,
          total: total || 0,
          pages: Math.ceil((total || 0) / pageSize),
        },
      })
    }
    */

    const db = loadMockDb()
    const stocks = Array.isArray(db.stocks) ? db.stocks : []
    console.log(`[Quotes] Mock fallback reached. Stocks in DB: ${stocks.length}`)
    
    // 增加排序逻辑：按更新时间倒序排列，确保新同步的数据排在前面
    stocks.sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return tb - ta
    })

    const total = stocks.length
    const items = stocks.slice(start, start + pageSize)
    console.log(`[Quotes] Mock DB loaded. Total: ${total}, returning: ${items.length}`)

    return response.success(res, {
      items,
      pagination: {
        page,
        per_page: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    })
  } catch (e) {
    console.error('❌ 获取报价列表失败:', e.message)
    return response.error(res, '获取列表失败', 500)
  }
})

app.delete('/api/v1/admin/quotes', adminAuth, async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {}
  const rawCodes = payload.codes
  const codes = Array.isArray(rawCodes)
    ? rawCodes.map((c) => String(c || '').trim()).filter((c) => c !== '')
    : []

  try {
    if (cloudDb) {
      if (codes.length > 0) {
        let totalDeleted = 0
        for (let i = 0; i < codes.length; i += 200) {
          const batch = codes.slice(i, i + 200)
          const arrJs = JSON.stringify(batch)
          // 对于 HTTP API，使用 SDK 语法中的 _.in 往往需要配合定义 _，
          // 但在简单的 where 字符串中，直接使用 JSON 语法的 $in 更为通用
          const whereJs = `{stock_code: {"$in": ${arrJs}}}`
          const deleted = await cloudDb.deleteWhere('quotes', whereJs)
          totalDeleted += Number(deleted || 0)
        }
        return response.success(res, { deleted: totalDeleted }, `已成功删除 ${totalDeleted} 条记录`)
      }

      const taskId = uuidv4()
      const session = {
        task_id: taskId,
        type: 'clear_quotes',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'processing',
        deleted: 0,
        result: null,
        requested_by: req.admin && typeof req.admin === 'object' ? req.admin.sub : null,
      }
      saveUploadSession(taskId, session)

      return response.success(res, { status: 'processing', taskId }, '清空任务已创建，正在处理中', 202)
    }

    const db = loadMockDb()
    const stocks = Array.isArray(db.stocks) ? db.stocks : []
    const before = stocks.length
    if (codes.length > 0) {
      const set = new Set(codes)
      db.stocks = stocks.filter((s) => !(s && typeof s === 'object' && set.has(String(s.stock_code || '').trim())))
    } else {
      db.stocks = []
    }
    writeMockDb(db)
    const deleted = before - (Array.isArray(db.stocks) ? db.stocks.length : 0)
    return response.success(res, { deleted }, `已成功删除 ${deleted} 条记录`)
  } catch (e) {
    console.error('❌ 删除报价失败:', e.message)
    return response.error(res, `删除失败: ${e.message}`, 500)
  }
})

app.get('/api/v1/admin/quotes/delete-task/:taskId', adminAuth, async (req, res) => {
  const rawId = req.params && typeof req.params.taskId === 'string' ? req.params.taskId.trim() : ''
  if (!rawId) {
    return response.error(res, '缺少 taskId', 400)
  }

  const session = loadUploadSession(rawId)
  if (!session || session.type !== 'clear_quotes') {
    return response.error(res, '任务不存在或已过期', 404)
  }

  if (session.status === 'processed') {
    const deleted = Number(session.deleted || 0)
    return response.success(res, { status: 'processed', taskId: rawId, deleted, durationMs: session.result?.durationMs || 0 }, `已清空 ${deleted} 条记录`)
  }

  if (session.status === 'failed') {
    return response.error(res, session.result?.message ? String(session.result.message) : '删除失败', 500, { status: 'failed', taskId: rawId })
  }

  if (!cloudDb) {
    return response.error(res, '当前环境未启用云数据库，无法处理任务', 500)
  }

  try {
    const startedAt = typeof session.created_at === 'string' ? Date.parse(session.created_at) : NaN
    const timeBudgetMs = 4500
    const maxLoopsRaw = process.env.WX_DB_DELETE_BATCHES_PER_POLL || '20'
    const maxLoops = Math.max(1, Number.parseInt(String(maxLoopsRaw), 10) || 20)
    const whereAll = '{_id: db.command.exists(true)}'
    const t0 = Date.now()

    let deletedThisPoll = 0
    let loops = 0
    while (loops < maxLoops && Date.now() - t0 < timeBudgetMs) {
      const deleted = await cloudDb.deleteWhere('quotes', whereAll)
      const n = Number(deleted || 0)
      if (n <= 0) break
      deletedThisPoll += n
      loops++
    }

    session.deleted = Number(session.deleted || 0) + deletedThisPoll
    session.updated_at = new Date().toISOString()

    if (deletedThisPoll <= 0) {
      const durationMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 0
      session.status = 'processed'
      session.processed_at = new Date().toISOString()
      session.result = { success: true, deleted: Number(session.deleted || 0), durationMs }
      saveUploadSession(rawId, session)

      const deleted = Number(session.deleted || 0)
      return response.success(res, { status: 'processed', taskId: rawId, deleted, durationMs }, `已清空 ${deleted} 条记录`)
    }

    saveUploadSession(rawId, session)
    const deleted = Number(session.deleted || 0)
    return response.success(res, { status: 'processing', taskId: rawId, deleted }, `清空进行中，已删除 ${deleted} 条记录`)
  } catch (e) {
    session.status = 'failed'
    session.updated_at = new Date().toISOString()
    session.result = { success: false, message: e instanceof Error ? e.message : String(e) }
    saveUploadSession(rawId, session)
    return response.error(res, session.result.message, 500, { status: 'failed', taskId: rawId })
  }
})

app.get('/api/v1/admin/orders', adminAuth, (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return response.error(res, pagination.error.message, pagination.error.status)
  }

  const { page, pageSize } = pagination.value
  return response.success(res, {
    items: [],
    pagination: {
      page,
      per_page: pageSize,
      total: 0,
      pages: 0,
    },
  }, '当前环境未接入订单数据源，已返回空列表')
})

app.get('/api/v1/admin/inquiries', adminAuth, (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return response.error(res, pagination.error.message, pagination.error.status)
  }

  const { page, pageSize } = pagination.value
  return response.success(res, {
    items: [],
    pagination: {
      page,
      per_page: pageSize,
      total: 0,
      pages: 0,
    },
  }, '当前环境未接入询价数据源，已返回空列表')
})

app.get('/api/v1/admin/sync-logs', adminAuth, async (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return response.error(res, pagination.error.message, pagination.error.status)
  }

  const { page, pageSize } = pagination.value
  const skip = (page - 1) * pageSize

  try {
    if (cloudDb) {
      const items = await cloudDb.query(`db.collection("sync_logs").orderBy("created_at", "desc").skip(${skip}).limit(${pageSize}).get()`)
      const total = await cloudDb.count('sync_logs')
      return response.success(res, {
        items,
        pagination: {
          page,
          per_page: pageSize,
          total: total || 0,
          pages: Math.ceil((total || 0) / pageSize),
        },
      })
    }

    // 本地模式暂时返回空列表
    return response.success(res, {
      items: [],
      pagination: { page, per_page: pageSize, total: 0, pages: 0 },
    })
  } catch (e) {
    console.error('❌ 获取同步历史失败:', e.message)
    return response.error(res, '获取失败', 500)
  }
})

app.post('/api/v1/admin/sync-all-quotes', adminAuth, async (req, res) => {
  const taskId = uuidv4()
  const session = {
    task_id: taskId,
    type: 'sync_all_quotes',
    created_at: new Date().toISOString(),
    status: 'processing',
    result: null,
    requested_by: req.admin?.sub || 'admin',
  }
  saveUploadSession(taskId, session)

  // 异步执行 Python 脚本
  const fileDbPath = getMockDbPath()
  const args = ['-3.12', 'sina_quotes.py', '--all', '--update-mock-db', '--mock-db-path', fileDbPath]
  const child = spawn('py', args, {
    cwd: __dirname,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  // 给全量同步更长的时间（5分钟）
  const killTimer = setTimeout(() => {
    child.kill()
  }, 300_000)

  child.stdout.on('data', (buf) => { stdout += buf.toString('utf8') })
  child.stderr.on('data', (buf) => { stderr += buf.toString('utf8') })

  child.on('close', (code) => {
    clearTimeout(killTimer)
    const latest = loadUploadSession(taskId) || session
    
    if (code !== 0 && code !== 2) {
      latest.status = 'failed'
      latest.result = { success: false, message: stderr.trim() || '全量同步失败' }
    } else {
      try {
        const parsed = JSON.parse(stdout)
        latest.status = 'processed'
        latest.result = { 
          success: true, 
          processed: Array.isArray(parsed.data) ? parsed.data.length : 0,
          durationMs: Date.now() - Date.parse(latest.created_at)
        }
      } catch (e) {
        latest.status = 'failed'
        latest.result = { success: false, message: '行情同步返回解析失败' }
      }
    }
    latest.updated_at = new Date().toISOString()
    saveUploadSession(taskId, latest)
  })

  return response.success(res, { status: 'processing', taskId }, '全量同步任务已创建，后台处理中', 202)
})

app.get('/api/v1/admin/sync-all-quotes/status/:taskId', adminAuth, (req, res) => {
  const { taskId } = req.params
  const session = loadUploadSession(taskId)
  if (!session || session.type !== 'sync_all_quotes') {
    return response.error(res, '任务不存在或已过期', 404)
  }
  return response.success(res, session)
})

app.post('/api/v1/admin/sync-quotes', adminAuth, (req, res) => {
  void req

  const db = loadMockDb()
  const stocks = Array.isArray(db.stocks) ? db.stocks : []
  const codes = stocks
    .map((s) => (s && typeof s === 'object' ? String(s.stock_code || '').trim() : ''))
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, 50)

  const fallbackCodes = String(process.env.SINA_DEFAULT_CODES || '600519,000001')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, 50)

  const targetCodes = codes.length > 0 ? codes : fallbackCodes
  if (targetCodes.length === 0) {
    return res.status(400).json({
      success: false,
      data: null,
      message: '未找到可同步的股票代码：请先导入行情或配置 SINA_DEFAULT_CODES',
    })
  }

  const fileDbPath = getMockDbPath()

  const args = ['-3.12', 'sina_quotes.py', '--codes', ...targetCodes, '--update-mock-db', '--mock-db-path', fileDbPath]
  const child = spawn('py', args, {
    cwd: __dirname,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  const killTimer = setTimeout(() => {
    child.kill()
  }, 30_000)

  child.stdout.on('data', (buf) => {
    stdout += buf.toString('utf8')
  })

  child.stderr.on('data', (buf) => {
    stderr += buf.toString('utf8')
  })

  child.on('error', (e) => {
    clearTimeout(killTimer)
    return res.status(500).json({
      success: false,
      data: null,
      message: e instanceof Error ? e.message : String(e),
    })
  })

  child.on('close', (code) => {
    clearTimeout(killTimer)
    if (code !== 0 && code !== 2) {
      return res.status(500).json({
        success: false,
        data: null,
        message: stderr.trim() || '行情同步失败',
      })
    }

    try {
      const parsed = JSON.parse(stdout)
      const data = parsed && typeof parsed === 'object' ? parsed.data : null
      const processed = Array.isArray(data) ? data.length : 0
      return res.json({
        success: true,
        data: { processed, codes: targetCodes },
        message: processed > 0 ? `已同步 ${processed} 条行情` : '同步完成',
      })
    } catch (e) {
      return res.status(500).json({
        success: false,
        data: null,
        message: '行情同步返回解析失败',
      })
    }
  })
})

app.post('/api/v1/admin/crawl-quotes', adminAuth, (req, res) => {
  void req

  const db = loadMockDb()
  const stocks = Array.isArray(db.stocks) ? db.stocks : []
  const codes = stocks
    .map((s) => (s && typeof s === 'object' ? String(s.stock_code || '').trim() : ''))
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, 50)

  const fallbackCodes = String(process.env.SINA_DEFAULT_CODES || '600519,000001')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, 50)

  const targetCodes = codes.length > 0 ? codes : fallbackCodes
  if (targetCodes.length === 0) {
    return res.status(400).json({
      success: false,
      data: null,
      message: '未找到可同步的股票代码：请先导入行情或配置 SINA_DEFAULT_CODES',
    })
  }

  const fileDbPath = getMockDbPath()

  const args = ['-3.12', 'sina_quotes.py', '--codes', ...targetCodes, '--update-mock-db', '--mock-db-path', fileDbPath]
  const child = spawn('py', args, {
    cwd: __dirname,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  const killTimer = setTimeout(() => {
    child.kill()
  }, 30_000)

  child.stdout.on('data', (buf) => {
    stdout += buf.toString('utf8')
  })

  child.stderr.on('data', (buf) => {
    stderr += buf.toString('utf8')
  })

  child.on('error', (e) => {
    clearTimeout(killTimer)
    return res.status(500).json({
      success: false,
      data: null,
      message: e instanceof Error ? e.message : String(e),
    })
  })

  child.on('close', (code) => {
    clearTimeout(killTimer)
    if (code !== 0 && code !== 2) {
      return res.status(500).json({
        success: false,
        data: null,
        message: stderr.trim() || '行情同步失败',
      })
    }

    try {
      const parsed = JSON.parse(stdout)
      const data = parsed && typeof parsed === 'object' ? parsed.data : null
      const processed = Array.isArray(data) ? data.length : 0
      return res.json({
        success: true,
        data: { processed, codes: targetCodes },
        message: processed > 0 ? `已同步 ${processed} 条行情` : '同步完成',
      })
    } catch (e) {
      return res.status(500).json({
        success: false,
        data: null,
        message: '行情同步返回解析失败',
      })
    }
  })
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getUploadCacheDir()
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`)
  }
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

function getUploadCacheDir() {
  const dir = path.resolve(__dirname, 'temp_uploads')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getUploadSessionPath(uploadId) {
  const safeId = String(uploadId).replace(/[^a-zA-Z0-9-]/g, '')
  return path.join(getUploadCacheDir(), `${safeId}.json`)
}

function saveUploadSession(uploadId, data) {
  const filePath = getUploadSessionPath(uploadId)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function loadUploadSession(uploadId) {
  const filePath = getUploadSessionPath(uploadId)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error(`❌ 读取上传会话 ${uploadId} 失败:`, e.message)
    return null
  }
}

function deleteUploadSession(uploadId) {
  const filePath = getUploadSessionPath(uploadId)
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath)
    } catch (e) {
      // ignore
    }
  }
}

function normalizeStockCode(value) {
  if (value === null || value === undefined) return null
  let raw = String(value).trim()
  if (!raw || raw.toLowerCase() === 'nan' || raw.toLowerCase() === 'none') return null
  if (raw.endsWith('.0')) raw = raw.slice(0, -2)
  const digits = raw.match(/\d+/g)
  if (!digits) return null
  const merged = digits.join('')
  return merged.padStart(6, '0').slice(-6)
}

function parseQuotesBuffer(filename, buffer) {
  const ext = filename.split('.').pop().toLowerCase()
  let rows = []

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    rows = XLSX.utils.sheet_to_json(worksheet)
  } else if (ext === 'csv') {
    rows = csvParse(buffer, { columns: true, skip_empty_lines: true })
  } else {
    throw new Error('仅支持 Excel (.xlsx, .xls) 或 CSV 文件')
  }

  const columnMapping = {
    stock_code: ['代码', '股票代码', 'Code', '证券代码', 'A股代码', 'code', 'stock_code'],
    name: ['名称', '股票名称', 'Name', '证券简称', 'A股简称', 'name'],
    price: ['现价', '最新价', '价格', 'Price', '收盘价', 'price'],
    changePercent: ['涨跌幅', '涨跌', 'Change', '涨跌幅(%)', 'changePercent'],
    open: ['开盘', 'open'],
    high: ['最高', 'high'],
    low: ['最低', 'low'],
    pre_close: ['昨收', '昨收盘', 'pre_close', 'preClose'],
    volume: ['成交量', 'Volume', '总手', 'volume'],
    amount: ['成交额', 'Amount', '金额', 'amount'],
  }

  const items = []
  const seen = new Set()

  rows.forEach((row) => {
    let foundCodeKey = null
    for (const key of columnMapping.stock_code) {
      if (row[key] !== undefined) {
        foundCodeKey = key
        break
      }
    }

    if (!foundCodeKey) return

    const code = normalizeStockCode(row[foundCodeKey])
    if (!code || seen.has(code)) return
    seen.add(code)

    const item = {
      stock_code: code,
      code: code,
      name: '',
      updateSource: 'file_upload',
      updated_at: new Date().toISOString(),
    }

    // 映射其他列
    Object.keys(columnMapping).forEach((field) => {
      if (field === 'stock_code') return
      for (const cand of columnMapping[field]) {
        if (row[cand] !== undefined) {
          if (field === 'name') {
            item.name = String(row[cand])
          } else {
            const v = parseFloat(row[cand])
            if (!isNaN(v)) item[field] = v
          }
          break
        }
      }
    })

    items.push(item)
  })

  return items
}

function adminAuth(req, res, next) {
  const token = getBearerToken(req)
  if (!token) {
    return response.error(res, '未登录或登录已过期', 401)
  }

  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'option_trading_secret_key_backup'

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    req.admin = payload
    next()
  } catch (e) {
    return response.error(res, '无效的登录凭证', 401)
  }
}

app.post('/api/v1/admin/upload-quotes/preview', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return response.error(res, '未找到上传文件', 400)
  }

  try {
    const buffer = fs.readFileSync(req.file.path)
    const items = parseQuotesBuffer(req.file.originalname, buffer)
    const uploadId = uuidv4()
    const session = {
      upload_id: uploadId,
      created_at: new Date().toISOString(),
      status: 'pending',
      items: items,
      original_path: req.file.path
    }

    saveUploadSession(uploadId, session)

    return response.success(res, {
      uploadId: uploadId,
      total: items.length,
      preview: items.slice(0, 20),
    }, '解析成功，请确认入库')
  } catch (e) {
    console.error('❌ 文件预览解析失败:', e.message)
    return response.error(res, `解析失败: ${e.message}`, 500)
  }
})

app.post('/api/v1/admin/upload-quotes/confirm', adminAuth, async (req, res) => {
  const { uploadId } = req.body || {}
  if (!uploadId) {
    return response.error(res, '缺少 uploadId', 400)
  }

  const session = loadUploadSession(uploadId)
  if (!session) {
    return response.error(res, '预览数据已过期或不存在', 400)
  }

  if (session.status === 'processing') {
    return response.success(res, { status: 'processing' }, '入库正在处理中')
  }

  if (session.status === 'processed') {
    return response.success(res, {
      status: 'processed',
      processed: session.result?.processed || 0,
      durationMs: session.result?.durationMs || 0,
    }, '入库已完成')
  }

  if (session.status === 'failed') {
    return response.error(res, session.result?.message ? String(session.result.message) : '入库失败', 500, { status: 'failed' })
  }

  // 开始处理
  session.status = 'processing'
  session.processing_started_at_ms = Date.now()
  saveUploadSession(uploadId, session)

  // 异步处理入库
  const processUpload = async () => {
    try {
      const t0 = typeof session.processing_started_at_ms === 'number' ? session.processing_started_at_ms : Date.now()
      const items = session.items
      let processed = 0

      if (cloudDb) {
        const rawWorkers = process.env.WX_DB_MAX_WORKERS || process.env.WX_CLOUD_MAX_WORKERS || '8'
        const writeConcurrency = Number.parseInt(String(rawWorkers), 10)
        const safeConcurrency = Number.isFinite(writeConcurrency) && writeConcurrency > 0 ? writeConcurrency : 8
        const result = await cloudDb.batchUpsert('quotes', 'stock_code', items, {
          chunkSize: 50,
          writeConcurrency: safeConcurrency,
        })
        processed = Number(result && result.processed ? result.processed : 0)
      } else {
        // 本地入库 - 使用 Map 优化查找性能
        const db = loadMockDb()
        if (!Array.isArray(db.stocks)) db.stocks = []

        const stockMap = new Map(db.stocks.map((s) => [s.stock_code, s]))

        items.forEach((item) => {
          if (stockMap.has(item.stock_code)) {
            const existing = stockMap.get(item.stock_code)
            Object.assign(existing, item)
          } else {
            db.stocks.push(item)
            stockMap.set(item.stock_code, item)
          }
          processed++
        })
        writeMockDb(db)
      }

      session.status = 'processed'
      session.result = { success: true, processed, durationMs: Math.max(0, Date.now() - t0) }
      session.processed_at = new Date().toISOString()
      
      // 清理原文件
      if (session.original_path && fs.existsSync(session.original_path)) {
        fs.unlinkSync(session.original_path)
      }
      
      saveUploadSession(uploadId, session)
    } catch (e) {
      console.error('❌ 入库处理失败:', e.message)
      session.status = 'failed'
      session.result = { success: false, message: e.message }
      saveUploadSession(uploadId, session)
    }
  }

  // 立即开始异步处理
  processUpload()

  return response.success(res, { status: 'processing' }, '入库已开始处理')
})

app.post('/api/v1/admin/bench-quotes', adminAuth, async (req, res) => {
  if (String(process.env.ENABLE_BENCHMARK_API || 'false').toLowerCase() !== 'true') {
    return res.status(404).json({ success: false, data: null, message: 'Not Found' })
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {}
  const compare = Boolean(payload.compare)
  const count = Number.parseInt(String(payload.count ?? 500), 10)
  if (!Number.isFinite(count) || count < 1 || count > 20000) {
    return res.status(400).json({ success: false, data: null, message: 'count 必须为 1-20000' })
  }

  const chunkSize = Number.parseInt(String(payload.chunkSize ?? 50), 10)
  if (!Number.isFinite(chunkSize) || chunkSize < 1 || chunkSize > 200) {
    return res.status(400).json({ success: false, data: null, message: 'chunkSize 必须为 1-200' })
  }

  const maxWorkersRaw = payload.maxWorkers ?? payload.max_workers
  const maxWorkers = maxWorkersRaw === undefined || maxWorkersRaw === null ? null : Number.parseInt(String(maxWorkersRaw), 10)
  if (maxWorkersRaw !== undefined && (!Number.isFinite(maxWorkers) || maxWorkers < 1)) {
    return res.status(400).json({ success: false, data: null, message: 'maxWorkers 必须为正整数' })
  }

  const mode = String(payload.mode || 'roundtrip').trim().toLowerCase()
  if (!['upsert', 'delete', 'roundtrip'].includes(mode)) {
    return res.status(400).json({ success: false, data: null, message: 'mode 必须为 upsert/delete/roundtrip' })
  }

  const seed = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const codes = Array.from({ length: count }, (_, i) => `BENCH_${seed}_${String(i).padStart(6, '0')}`)
  const nowIso = new Date().toISOString()
  const docs = codes.map((code, i) => ({
    stock_code: code,
    code,
    name: 'BENCH',
    price: Number(i),
    changePercent: 0,
    updateSource: 'benchmark',
    updated_at: nowIso,
  }))

  const runOnce = async (label, workers) => {
    const t0 = Date.now()
    let processed = 0
    let errors = []
    if (cloudDb) {
      const upsertRes = await cloudDb.batchUpsert('quotes', 'stock_code', docs, {
        chunkSize,
        writeConcurrency: workers,
      })
      processed = Number(upsertRes && upsertRes.processed ? upsertRes.processed : 0)
      errors = Array.isArray(upsertRes && upsertRes.errors) ? upsertRes.errors.slice(0, 20) : []
    } else {
      const db = loadMockDb()
      if (!Array.isArray(db.stocks)) db.stocks = []
      const stockMap = new Map(db.stocks.map((s) => [s.stock_code, s]))
      for (const it of docs) {
        if (stockMap.has(it.stock_code)) Object.assign(stockMap.get(it.stock_code), it)
        else {
          db.stocks.push(it)
          stockMap.set(it.stock_code, it)
        }
      }
      writeMockDb(db)
      processed = docs.length
    }
    const upsertMs = Date.now() - t0

    let deleted = 0
    let deleteMs = 0
    if (mode === 'delete' || mode === 'roundtrip') {
      const t1 = Date.now()
      if (cloudDb) {
        let totalDeleted = 0
        for (let i = 0; i < codes.length; i += 200) {
          const batch = codes.slice(i, i + 200)
          const arrJs = JSON.stringify(batch)
          const whereJs = `{stock_code: db.command.in(${arrJs})}`
          const n = await cloudDb.deleteWhere('quotes', whereJs)
          totalDeleted += Number(n || 0)
        }
        deleted = totalDeleted
      } else {
        const db = loadMockDb()
        const stocks = Array.isArray(db.stocks) ? db.stocks : []
        const before = stocks.length
        const set = new Set(codes)
        db.stocks = stocks.filter((s) => !(s && typeof s === 'object' && set.has(String(s.stock_code || '').trim())))
        writeMockDb(db)
        deleted = before - (Array.isArray(db.stocks) ? db.stocks.length : 0)
      }
      deleteMs = Date.now() - t1
    }

    return {
      label,
      maxWorkers: workers,
      count,
      chunkSize,
      processed,
      deleted,
      errors,
      upsertMs,
      deleteMs,
      totalMs: upsertMs + deleteMs,
    }
  }

  try {
    if (compare) {
      const baseline = await runOnce('baseline', 1)
      const targetWorkers = Math.max(1, Number(maxWorkers || process.env.WX_DB_MAX_WORKERS || 8))
      const optimized = await runOnce('optimized', targetWorkers)
      return res.json({ success: true, data: { results: [baseline, optimized] }, message: '基准测试完成' })
    }
    const workers = Math.max(1, Number(maxWorkers || process.env.WX_DB_MAX_WORKERS || 8))
    const single = await runOnce('single', workers)
    return res.json({ success: true, data: single, message: '基准测试完成' })
  } catch (e) {
    console.error('❌ 行情基准测试失败:', e.message)
    return res.status(500).json({ success: false, data: null, message: `基准测试失败: ${e.message}` })
  }
})

app.post(
  '/api/v1/admin/upload-quotes',
  adminAuth,
  express.raw({
    type: () => true,
    limit: '50mb',
  }),
  (req, res) => {
    const contentType = req.headers['content-type']
    if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
      return res.status(400).json({ success: false, data: null, message: '仅支持 multipart/form-data' })
    }

    const current = loadMockDb()
    if (!current || typeof current !== 'object') {
      return res.status(500).json({ success: false, data: null, message: '读取本地数据失败' })
    }

    try {
      writeMockDb(current)
      return res.json({
        success: true,
        data: { processed: 0 },
        message: '已接收文件（当前为占位实现，未解析内容）',
      })
    } catch (e) {
      return res.status(500).json({
        success: false,
        data: null,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  },
)

app.use('/api/auth', require('./routes/auth'))
app.use('/api/products', require('./routes/products'))
app.use('/api/orders', require('./routes/orders'))

app.all('/api/webviewClick', (req, res) => {
  void req
  return res.json({ success: true, data: null })
})

app.use(notFoundHandler)
app.use(errorHandler)

const portRaw = process.env.PORT || '5002'
const port = Number.parseInt(String(portRaw), 10)
const listenPort = Number.isFinite(port) && port > 0 ? port : 5002

app.listen(listenPort, () => {
  console.log(`✅ Node API Server running at http://127.0.0.1:${listenPort}`)
})
