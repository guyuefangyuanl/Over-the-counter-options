const fs = require('fs')
const path = require('path')

const compression = require('compression')
const cors = require('cors')
const dotenv = require('dotenv')
const express = require('express')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')
const { spawn } = require('child_process')

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { customLogger, requestLogger } = require('./middleware/logger')

dotenv.config()

const app = express()

app.set('trust proxy', true)

app.use(helmet())
app.use(compression())
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)
app.use(customLogger)

function isIntegerString(value) {
  return typeof value === 'string' && /^-?\d+$/.test(value)
}

function parsePagination(query) {
  const rawPage = query && query.page != null ? String(query.page) : '1'
  const rawPageSize = query && query.pageSize != null ? String(query.pageSize) : '10'

  if (!isIntegerString(rawPage) || !isIntegerString(rawPageSize)) {
    return { ok: false, error: { status: 400, message: '分页参数必须是整数' } }
  }

  const page = Number.parseInt(rawPage, 10)
  const pageSize = Number.parseInt(rawPageSize, 10)

  if (page < 1) return { ok: false, error: { status: 400, message: '页码必须大于等于1' } }
  if (pageSize < 1 || pageSize > 100) {
    return { ok: false, error: { status: 400, message: '每页数量必须在1-100之间' } }
  }

  return { ok: true, value: { page, pageSize } }
}

function getMockDbPath() {
  return path.resolve(__dirname, process.env.FILE_DB_PATH || 'mock_db.json')
}

function loadMockDb() {
  const filePath = getMockDbPath()
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (e) {
    console.error('❌ 读取 mock_db.json 失败:', e instanceof Error ? e.message : String(e))
  }
  return { stocks: [] }
}

function writeMockDb(nextDb) {
  const filePath = getMockDbPath()
  fs.writeFileSync(filePath, JSON.stringify(nextDb, null, 2), 'utf8')
}

app.get('/api/v1/health', (req, res) => {
  void req
  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: 'v1',
      service: 'stock-trading-backend',
      environment: process.env.NODE_ENV || 'development',
    },
    message: 'API v1 运行正常',
  })
})

function getBearerToken(req) {
  const raw = req.headers && typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (!raw.startsWith('Bearer ')) return null
  const token = raw.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

function signAdminToken(username) {
  const secret =
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY || 'dev-secret-key-change-in-production'
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
    return res.status(400).json({ success: false, data: null, message: 'username 不能为空' })
  }
  if (password.trim() === '') {
    return res.status(400).json({ success: false, data: null, message: 'password 不能为空' })
  }

  const expectedUsername = process.env.ADMIN_USERNAME || 'admin'
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123'

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ success: false, data: null, message: '用户名或密码错误' })
  }

  const expiresInRaw = process.env.JWT_EXPIRES_SECONDS || '86400'
  const expiresIn = Number.parseInt(String(expiresInRaw), 10)
  const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400
  const token = signAdminToken(username)

  return res.json({
    success: true,
    data: {
      token,
      tokenType: 'Bearer',
      expiresIn: safeExpiresIn,
    },
    message: '登录成功',
  })
})

app.get('/api/v1/auth/me', (req, res) => {
  const token = getBearerToken(req)
  if (!token) {
    return res.status(401).json({ success: false, data: null, message: '未登录或登录已过期' })
  }

  const secret =
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY || 'dev-secret-key-change-in-production'

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    const username = payload && typeof payload === 'object' ? payload.sub : null
    const role = payload && typeof payload === 'object' ? payload.role : null

    return res.json({
      success: true,
      data: { username, role },
    })
  } catch (e) {
    return res.status(401).json({ success: false, data: null, message: '无效的登录凭证' })
  }
})

app.get('/api/v1/admin/stats', (req, res) => {
  void req
  const db = loadMockDb()
  const stocks = Array.isArray(db.stocks) ? db.stocks : []

  res.json({
    success: true,
    data: {
      stockCount: stocks.length,
      inquiryCount: 0,
      pendingInquiryCount: 0,
      orderCount: 0,
    },
  })
})

app.get('/api/v1/admin/quotes', (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return res.status(pagination.error.status).json({
      success: false,
      data: null,
      message: pagination.error.message,
    })
  }

  const { page, pageSize } = pagination.value
  const db = loadMockDb()
  const stocks = Array.isArray(db.stocks) ? db.stocks : []

  const start = (page - 1) * pageSize
  const items = stocks.slice(start, start + pageSize)

  return res.json({
    success: true,
    data: items,
  })
})

app.get('/api/v1/admin/orders', (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return res.status(pagination.error.status).json({
      success: false,
      data: null,
      message: pagination.error.message,
    })
  }

  return res.json({
    success: true,
    data: [],
    message: '当前环境未接入订单数据源，已返回空列表',
  })
})

app.get('/api/v1/admin/inquiries', (req, res) => {
  const pagination = parsePagination(req.query)
  if (!pagination.ok) {
    return res.status(pagination.error.status).json({
      success: false,
      data: null,
      message: pagination.error.message,
    })
  }

  return res.json({
    success: true,
    data: [],
    message: '当前环境未接入询价数据源，已返回空列表',
  })
})

app.post('/api/v1/admin/crawl-quotes', (req, res) => {
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

app.post(
  '/api/v1/admin/upload-quotes',
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

const portRaw = process.env.PORT || process.env.FLASK_PORT || '5000'
const port = Number.parseInt(String(portRaw), 10)
const listenPort = Number.isFinite(port) && port > 0 ? port : 5000

app.listen(listenPort, () => {
  console.log(`✅ Node API Server running at http://127.0.0.1:${listenPort}`)
})
