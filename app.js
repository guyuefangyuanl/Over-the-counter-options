const fs = require('fs')
const path = require('path')

const compression = require('compression')
const cors = require('cors')
const dotenv = require('dotenv')
const express = require('express')
const helmet = require('helmet')
const jwt = require('jsonwebtoken')
const { spawn } = require('child_process')
const multer = require('multer')
const XLSX = require('xlsx')
const { parse: csvParse } = require('csv-parse/sync')
const { v4: uuidv4 } = require('uuid')

const CloudDbClient = require('./services/cloud_db')

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const { customLogger, requestLogger } = require('./middleware/logger')

// 加载环境变量
const localEnvPath = path.resolve(__dirname, '.env.local')
const defaultEnvPath = path.resolve(__dirname, '.env')

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath })
  console.log('✅ 已从 .env.local 加载环境变量')
} else {
  dotenv.config({ path: defaultEnvPath })
  console.log('✅ 已从 .env 加载环境变量')
}

const app = express()

app.set('trust proxy', true)

app.use(helmet())
app.use(compression())
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)
app.use(customLogger)

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

// 初始化云数据库客户端
let cloudDb = null
try {
  cloudDb = CloudDbClient.fromEnv()
  console.log('✅ 微信云数据库客户端初始化成功')
} catch (e) {
  console.warn('⚠️ 微信云数据库配置未就绪，将回退到本地 Mock 存储:', e.message)
}

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

app.get('/api/v1/groups', async (req, res) => {
  void req

  let cloudGroups = []
  if (cloudDb) {
    try {
      const results = await cloudDb.query('db.collection("groups").get()')
      cloudGroups = results.map((g) => ({
        ...g,
        id: g._id || g.id,
        _source: 'cloud',
      }))
    } catch (e) {
      console.error('❌ 获取云端分组失败:', e.message)
    }
  }

  const db = loadMockDb()
  const localGroups = (Array.isArray(db.groups) ? db.groups : []).map((g) => ({
    ...g,
    _source: 'local',
  }))

  // 合并分组，如果 ID 相同则以云端为准
  const mergedGroups = [...cloudGroups]
  localGroups.forEach((local) => {
    if (!mergedGroups.some((cloud) => cloud.id === local.id)) {
      mergedGroups.push(local)
    }
  })

  return res.json({
    success: true,
    data: mergedGroups,
    message: cloudDb ? '获取成功 (云端+本地)' : '获取成功 (本地)',
  })
})

app.post('/api/v1/groups', async (req, res) => {
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name) {
    return res.status(400).json({ success: false, data: null, message: '分组名称不能为空' })
  }

  if (cloudDb) {
    try {
      const newGroup = {
        name,
        members: [],
        created_at: new Date().toISOString(),
      }
      const ids = await cloudDb.add('groups', newGroup)
      return res.json({
        success: true,
        data: { id: ids[0], ...newGroup },
        message: '创建成功 (云端)',
      })
    } catch (e) {
      console.error('❌ 创建云端分组失败:', e.message)
    }
  }

  const db = loadMockDb()
  if (!Array.isArray(db.groups)) {
    db.groups = []
  }

  const newGroup = {
    id: `g_${Date.now()}`,
    name,
    members: [],
    created_at: new Date().toISOString(),
  }

  db.groups.push(newGroup)
  writeMockDb(db)

  return res.json({
    success: true,
    data: newGroup,
    message: '创建成功 (本地)',
  })
})

app.put('/api/v1/groups/:id', async (req, res) => {
  const id = req.params.id
  const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : ''

  if (cloudDb) {
    try {
      const updateData = {}
      if (name) updateData.name = name
      updateData.updated_at = new Date().toISOString()

      const updatedCount = await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), updateData)
      if (updatedCount > 0) {
        return res.json({
          success: true,
          data: { id, ...updateData },
          message: '更新成功 (云端)',
        })
      }
    } catch (e) {
      console.error('❌ 更新云端分组失败:', e.message)
    }
  }

  const db = loadMockDb()
  const groups = Array.isArray(db.groups) ? db.groups : []
  const groupIndex = groups.findIndex((g) => g.id === id)

  if (groupIndex === -1) {
    return res.status(404).json({ success: false, data: null, message: '分组不存在' })
  }

  if (name) {
    groups[groupIndex].name = name
  }
  groups[groupIndex].updated_at = new Date().toISOString()

  writeMockDb(db)
  return res.json({
    success: true,
    data: groups[groupIndex],
    message: '更新成功 (本地)',
  })
})

app.delete('/api/v1/groups/:id', async (req, res) => {
  const id = req.params.id
  console.log(`🗑️ 尝试删除分组: ${id}`)

  if (cloudDb) {
    try {
      const deletedCount = await cloudDb.deleteWhere('groups', JSON.stringify({ _id: id }))
      console.log(`☁️ 云端删除结果: ${deletedCount}`)
      if (deletedCount > 0) {
        return res.json({
          success: true,
          data: null,
          message: '删除成功 (云端)',
        })
      }
    } catch (e) {
      console.error('❌ 删除云端分组失败:', e.message)
    }
  }

  const db = loadMockDb()
  const groups = Array.isArray(db.groups) ? db.groups : []
  const groupIndex = groups.findIndex((g) => g.id === id)

  if (groupIndex === -1) {
    console.warn(`⚠️ 分组不存在，无法删除: ${id}`)
    return res.status(404).json({ success: false, data: null, message: '分组不存在' })
  }

  db.groups.splice(groupIndex, 1)
  writeMockDb(db)
  console.log(`✅ 本地删除成功: ${id}`)

  return res.json({
    success: true,
    data: null,
    message: '删除成功 (本地)',
  })
})

app.post('/api/v1/groups/:id/members', async (req, res) => {
  const id = req.params.id
  const { stock_code, market, name } = req.body || {}

  if (!stock_code) {
    return res.status(400).json({ success: false, data: null, message: '股票代码不能为空' })
  }

  if (cloudDb) {
    try {
      // 在云端，成员管理需要先查询再更新，或者使用 db.command.push
      const groups = await cloudDb.query(`db.collection("groups").where({_id: "${id}"}).get()`)
      if (groups && groups.length > 0) {
        const group = groups[0]
        const members = group.members || []
        if (members.some((m) => m.stock_code === stock_code)) {
          return res.status(400).json({ success: false, data: null, message: '成员已存在' })
        }

        const newMember = {
          stock_code,
          market: market || '',
          name: name || '',
          added_at: new Date().toISOString(),
        }

        // 使用简单覆盖方式更新数组 (云 API 限制)
        await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), {
          members: [...members, newMember],
          updated_at: new Date().toISOString(),
        })

        return res.json({
          success: true,
          data: { id: group._id, ...group, members: [...members, newMember] },
          message: '添加成功 (云端)',
        })
      }
    } catch (e) {
      console.error('❌ 添加云端成员失败:', e.message)
    }
  }

  const db = loadMockDb()
  const groups = Array.isArray(db.groups) ? db.groups : []
  const groupIndex = groups.findIndex((g) => g.id === id)

  if (groupIndex === -1) {
    return res.status(404).json({ success: false, data: null, message: '分组不存在' })
  }

  if (!Array.isArray(groups[groupIndex].members)) {
    groups[groupIndex].members = []
  }

  const memberExists = groups[groupIndex].members.some((m) => m.stock_code === stock_code)
  if (memberExists) {
    return res.status(400).json({ success: false, data: null, message: '成员已存在' })
  }

  groups[groupIndex].members.push({
    stock_code,
    market: market || '',
    name: name || '',
    added_at: new Date().toISOString(),
  })

  writeMockDb(db)
  return res.json({
    success: true,
    data: groups[groupIndex],
    message: '添加成功 (本地)',
  })
})

app.delete('/api/v1/groups/:id/members/:stock_code', async (req, res) => {
  const { id, stock_code } = req.params

  if (cloudDb) {
    try {
      const groups = await cloudDb.query(`db.collection("groups").where({_id: "${id}"}).get()`)
      if (groups && groups.length > 0) {
        const group = groups[0]
        const members = group.members || []
        const memberIndex = members.findIndex((m) => m.stock_code === stock_code)

        if (memberIndex !== -1) {
          members.splice(memberIndex, 1)
          await cloudDb.updateWhere('groups', JSON.stringify({ _id: id }), {
            members,
            updated_at: new Date().toISOString(),
          })
          return res.json({
            success: true,
            data: null,
            message: '移除成功 (云端)',
          })
        }
      }
    } catch (e) {
      console.error('❌ 移除云端成员失败:', e.message)
    }
  }

  const db = loadMockDb()
  const groups = Array.isArray(db.groups) ? db.groups : []
  const groupIndex = groups.findIndex((g) => g.id === id)

  if (groupIndex === -1) {
    return res.status(404).json({ success: false, data: null, message: '分组不存在' })
  }

  if (!Array.isArray(groups[groupIndex].members)) {
    return res.status(400).json({ success: false, data: null, message: '该分组无成员' })
  }

  const memberIndex = groups[groupIndex].members.findIndex((m) => m.stock_code === stock_code)
  if (memberIndex === -1) {
    return res.status(404).json({ success: false, data: null, message: '成员不在该分组中' })
  }

  groups[groupIndex].members.splice(memberIndex, 1)
  writeMockDb(db)

  return res.json({
    success: true,
    data: null,
    message: '移除成功 (本地)',
  })
})

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

app.get('/api/v1/admin/stats', adminAuth, (req, res) => {
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

app.get('/api/v1/admin/quotes', adminAuth, (req, res) => {
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
          const whereJs = `{stock_code: db.command.in(${arrJs})}`
          const deleted = await cloudDb.deleteWhere('quotes', whereJs)
          totalDeleted += Number(deleted || 0)
        }
        return res.json({
          success: true,
          data: { deleted: totalDeleted },
          message: `已成功删除 ${totalDeleted} 条记录`,
        })
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

      return res.status(202).json({
        success: true,
        data: { status: 'processing', taskId },
        message: '清空任务已创建，正在处理中',
      })
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
    return res.json({
      success: true,
      data: { deleted },
      message: `已成功删除 ${deleted} 条记录`,
    })
  } catch (e) {
    console.error('❌ 删除报价失败:', e.message)
    return res.status(500).json({ success: false, data: null, message: `删除失败: ${e.message}` })
  }
})

app.get('/api/v1/admin/quotes/delete-task/:taskId', adminAuth, async (req, res) => {
  const rawId = req.params && typeof req.params.taskId === 'string' ? req.params.taskId.trim() : ''
  if (!rawId) {
    return res.status(400).json({ success: false, data: null, message: '缺少 taskId' })
  }

  const session = loadUploadSession(rawId)
  if (!session || session.type !== 'clear_quotes') {
    return res.status(404).json({ success: false, data: null, message: '任务不存在或已过期' })
  }

  if (session.status === 'processed') {
    const deleted = Number(session.deleted || 0)
    return res.json({
      success: true,
      data: { status: 'processed', taskId: rawId, deleted, durationMs: session.result?.durationMs || 0 },
      message: `已清空 ${deleted} 条记录`,
    })
  }

  if (session.status === 'failed') {
    return res.status(500).json({
      success: false,
      data: { status: 'failed', taskId: rawId },
      message: session.result?.message ? String(session.result.message) : '删除失败',
    })
  }

  if (!cloudDb) {
    return res.status(500).json({ success: false, data: null, message: '当前环境未启用云数据库，无法处理任务' })
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
      return res.json({
        success: true,
        data: { status: 'processed', taskId: rawId, deleted, durationMs },
        message: `已清空 ${deleted} 条记录`,
      })
    }

    saveUploadSession(rawId, session)
    const deleted = Number(session.deleted || 0)
    return res.json({
      success: true,
      data: { status: 'processing', taskId: rawId, deleted },
      message: `清空进行中，已删除 ${deleted} 条记录`,
    })
  } catch (e) {
    session.status = 'failed'
    session.updated_at = new Date().toISOString()
    session.result = { success: false, message: e instanceof Error ? e.message : String(e) }
    saveUploadSession(rawId, session)
    return res.status(500).json({ success: false, data: { status: 'failed', taskId: rawId }, message: session.result.message })
  }
})

app.get('/api/v1/admin/orders', adminAuth, (req, res) => {
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

app.get('/api/v1/admin/inquiries', adminAuth, (req, res) => {
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

const upload = multer({
  storage: multer.memoryStorage(),
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
    return res.status(401).json({ success: false, data: null, message: '未登录或登录已过期' })
  }

  const secret =
    process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || process.env.SECRET_KEY || 'dev-secret-key-change-in-production'

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] })
    req.admin = payload
    next()
  } catch (e) {
    return res.status(401).json({ success: false, data: null, message: '无效的登录凭证' })
  }
}

app.post('/api/v1/admin/upload-quotes/preview', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, data: null, message: '未找到上传文件' })
  }

  try {
    const items = parseQuotesBuffer(req.file.originalname, req.file.buffer)
    const uploadId = uuidv4()
    const session = {
      upload_id: uploadId,
      created_at: new Date().toISOString(),
      status: 'pending',
      items: items,
    }

    saveUploadSession(uploadId, session)

    return res.json({
      success: true,
      data: {
        uploadId: uploadId,
        total: items.length,
        preview: items.slice(0, 20),
      },
      message: '解析成功，请确认入库',
    })
  } catch (e) {
    console.error('❌ 文件预览解析失败:', e.message)
    return res.status(500).json({ success: false, data: null, message: `解析失败: ${e.message}` })
  }
})

app.post('/api/v1/admin/upload-quotes/confirm', adminAuth, async (req, res) => {
  const { uploadId } = req.body || {}
  if (!uploadId) {
    return res.status(400).json({ success: false, data: null, message: '缺少 uploadId' })
  }

  const session = loadUploadSession(uploadId)
  if (!session) {
    return res.status(400).json({ success: false, data: null, message: '预览数据已过期或不存在' })
  }

  if (session.status === 'processing') {
    return res.json({
      success: true,
      data: { status: 'processing' },
      message: '入库正在处理中',
    })
  }

  if (session.status === 'processed') {
    return res.json({
      success: true,
      data: {
        status: 'processed',
        processed: session.result?.processed || 0,
        durationMs: session.result?.durationMs || 0,
      },
      message: '入库已完成',
    })
  }

  if (session.status === 'failed') {
    return res.status(500).json({
      success: false,
      data: { status: 'failed' },
      message: session.result?.message ? String(session.result.message) : '入库失败',
    })
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

  return res.json({
    success: true,
    data: { status: 'processing' },
    message: '入库已开始处理',
  })
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
