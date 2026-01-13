const axios = require('axios')
const crypto = require('crypto')

/**
 * 微信云开发数据库客户端 (Node.js 版)
 */
class CloudDbClient {
  constructor({ envId, appId, secret, timeout = 10000 }) {
    this.envId = envId
    this.appId = appId
    this.secret = secret
    this.timeout = timeout
    this.accessToken = null
    this.expiresAt = 0

    this.client = axios.create({
      baseURL: 'https://api.weixin.qq.com',
      timeout: this.timeout,
    })

    this._maxInflight = this._loadMaxInflight()
    this._maxRetries = this._loadMaxRetries()
    this._active = 0
    this._waiters = []
  }

  static fromEnv() {
    const envId = (process.env.WX_CLOUD_ENV || process.env.WX_ENV_ID || '').trim()
    const appId = (process.env.WX_APPID || process.env.WECHAT_APPID || '').trim()
    const secret = (process.env.WX_SECRET || process.env.WECHAT_SECRET || '').trim()

    if (!envId || !appId || !secret || envId.includes('your_') || appId.includes('your_') || secret.includes('your_')) {
      throw new Error('微信云开发配置未就绪或仍为占位符')
    }

    return new CloudDbClient({ envId, appId, secret })
  }

  _loadMaxInflight() {
    const raw = (process.env.WX_DB_MAX_INFLIGHT || process.env.WX_CLOUD_MAX_INFLIGHT || '').trim()
    if (!raw) return 16
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 16
  }

  _loadMaxRetries() {
    const raw = (process.env.WX_DB_MAX_RETRIES || process.env.WX_CLOUD_MAX_RETRIES || '').trim()
    if (!raw) return 3
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 3
  }

  async _sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async _acquire() {
    if (this._active < this._maxInflight) {
      this._active++
      return
    }
    await new Promise((resolve) => this._waiters.push(resolve))
    this._active++
  }

  _release() {
    this._active = Math.max(0, this._active - 1)
    const next = this._waiters.shift()
    if (next) next()
  }

  async getAccessToken() {
    const now = Date.now()
    if (this.accessToken && now < this.expiresAt - 300000) {
      return this.accessToken
    }

    try {
      const resp = await this.client.get('/cgi-bin/token', {
        params: {
          grant_type: 'client_credential',
          appid: this.appId,
          secret: this.secret,
        },
      })

      if (resp.data.errcode) {
        throw new Error(`获取 access_token 失败: ${resp.data.errmsg}`)
      }

      this.accessToken = resp.data.access_token
      this.expiresAt = now + resp.data.expires_in * 1000
      return this.accessToken
    } catch (e) {
      console.error('❌ 获取微信 access_token 失败:', e.message)
      throw e
    }
  }

  async _post(apiPath, query) {
    const token = await this.getAccessToken()
    let lastErr = null
    for (let attempt = 0; attempt < this._maxRetries; attempt++) {
      await this._acquire()
      try {
        const resp = await this.client.post(`/${apiPath}?access_token=${token}`, {
          env: this.envId,
          query,
        })

        if (resp.data && resp.data.errcode) {
          throw new Error(`云数据库请求失败 [${resp.data.errcode}]: ${resp.data.errmsg}`)
        }

        return resp.data
      } catch (e) {
        lastErr = e
        if (attempt < this._maxRetries - 1) {
          const msg = String(e && e.message ? e.message : e).toLowerCase()
          const jitter = Math.random() * 150
          if (msg.includes('rate') || msg.includes('qps') || msg.includes('freq') || msg.includes('too many')) {
            await this._sleep(Math.min(3000, 600 * 2 ** attempt + jitter))
          } else {
            await this._sleep(Math.min(2000, 300 * 2 ** attempt + jitter))
          }
        }
      } finally {
        this._release()
      }
    }
    console.error(`❌ 云数据库 API 调用失败 (${apiPath}):`, lastErr && lastErr.message ? lastErr.message : String(lastErr))
    throw lastErr
  }

  /**
   * 查询数据
   */
  async query(queryStr) {
    const resp = await this._post('tcb/databasequery', queryStr)
    return (resp.data || []).map((item) => {
      try {
        return JSON.parse(item)
      } catch (e) {
        return item
      }
    })
  }

  /**
   * 添加数据
   */
  async add(collection, data) {
    const query = `db.collection("${collection}").add({data: ${JSON.stringify(data)}})`
    const resp = await this._post('tcb/databaseadd', query)
    return resp.id_list
  }

  /**
   * 更新数据 (根据条件)
   */
  async updateWhere(collection, whereJs, data) {
    const query = `db.collection("${collection}").where(${whereJs}).update({data: ${JSON.stringify(data)}})`
    const resp = await this._post('tcb/databaseupdate', query)
    return resp.updated
  }

  /**
   * 删除数据 (根据条件)
   */
  async deleteWhere(collection, whereJs) {
    const query = `db.collection("${collection}").where(${whereJs}).remove()`
    const resp = await this._post('tcb/databasedelete', query)
    return resp.deleted
  }

  /**
   * Upsert 操作
   * 支持两种调用方式:
   * 1. upsert(collection, "key", "value", data)
   * 2. upsert(collection, { key: "value" }, data)
   */
  async upsert(collection, uniqueKeyOrWhere, uniqueValue, data) {
    let whereJs
    let finalData

    if (typeof uniqueKeyOrWhere === 'object' && data === undefined) {
      // 方式 2: upsert(collection, { key: "value" }, data)
      whereJs = JSON.stringify(uniqueKeyOrWhere)
      finalData = uniqueValue
    } else {
      // 方式 1: upsert(collection, "key", "value", data)
      whereJs = JSON.stringify({ [uniqueKeyOrWhere]: uniqueValue })
      finalData = data
    }

    const existing = await this.query(`db.collection("${collection}").where(${whereJs}).limit(1).get()`)

    const nowIso = new Date().toISOString()
    if (existing && existing.length > 0) {
      const updateData = { ...finalData, updated_at: nowIso }
      // 移除可能存在的 _id 字段，避免更新失败
      delete updateData._id
      await this.updateWhere(collection, whereJs, updateData)
      return 'updated'
    } else {
      const insertData = { ...finalData, created_at: nowIso, updated_at: nowIso }
      // 如果 uniqueKeyOrWhere 是对象，合并到 insertData 中
      if (typeof uniqueKeyOrWhere === 'object') {
        Object.assign(insertData, uniqueKeyOrWhere)
      } else {
        insertData[uniqueKeyOrWhere] = uniqueValue
      }
      await this.add(collection, insertData)
      return 'inserted'
    }
  }

  async batchUpsert(collection, uniqueKey, items, options = {}) {
    const chunkSizeRaw = options.chunkSize ?? options.chunk_size ?? process.env.WX_DB_CHUNK_SIZE ?? 50
    const writeConcurrencyRaw =
      options.writeConcurrency ?? options.write_concurrency ?? process.env.WX_DB_MAX_WORKERS ?? process.env.WX_CLOUD_MAX_WORKERS ?? 8

    const chunkSize = Math.max(1, Number.parseInt(String(chunkSizeRaw), 10) || 50)
    const writeConcurrency = Math.max(1, Number.parseInt(String(writeConcurrencyRaw), 10) || 8)

    const normalized = []
    for (const it of items || []) {
      if (!it || typeof it !== 'object') continue
      const v = it[uniqueKey]
      if (v === undefined || v === null) continue
      normalized.push({ ...it, [uniqueKey]: String(v) })
    }

    if (normalized.length === 0) {
      return { processed: 0, errors: [] }
    }

    const byKey = new Map()
    for (const it of normalized) {
      byKey.set(String(it[uniqueKey]), it)
    }

    const keys = Array.from(byKey.keys())
    const nowIso = new Date().toISOString()
    let processed = 0
    const errors = []

    const chunked = []
    for (let i = 0; i < keys.length; i += chunkSize) {
      chunked.push(keys.slice(i, i + chunkSize))
    }

    const withConcurrency = async (arr, limit, fn) => {
      let idx = 0
      const workers = Array.from({ length: Math.max(1, limit) }, async () => {
        while (idx < arr.length) {
          const current = idx++
          await fn(arr[current], current)
        }
      })
      await Promise.all(workers)
    }

    for (const batch of chunked) {
      const arrJs = JSON.stringify(batch)
      const whereJs = `{${uniqueKey}: db.command.in(${arrJs})}`
      const existing = await this.query(
        `db.collection("${collection}").where(${whereJs}).field({${uniqueKey}: true}).get()`,
      )
      const existingKeys = new Set()
      for (const doc of existing || []) {
        const val = doc && typeof doc === 'object' ? doc[uniqueKey] : null
        if (val !== undefined && val !== null) existingKeys.add(String(val))
      }

      await withConcurrency(batch, Math.min(writeConcurrency, batch.length), async (k) => {
        const item = byKey.get(k)
        if (!item) return
        const whereOne = JSON.stringify({ [uniqueKey]: k })
        try {
          const payload = { ...item, updated_at: item.updated_at || nowIso }
          delete payload._id
          if (existingKeys.has(k)) {
            await this.updateWhere(collection, whereOne, payload)
            processed++
            return
          }

          const updated = await this.updateWhere(collection, whereOne, payload)
          if (Number(updated) > 0) {
            processed++
            return
          }

          const insertData = { ...item }
          delete insertData._id
          if (!insertData.created_at) insertData.created_at = nowIso
          if (!insertData.updated_at) insertData.updated_at = payload.updated_at
          await this.add(collection, insertData)
          processed++
        } catch (e) {
          errors.push({ key: k, message: e && e.message ? e.message : String(e) })
        }
      })
    }

    return { processed, errors }
  }

  /**
   * 统计数量
   */
  async count(collection, whereJs = '{}') {
    const query = `db.collection("${collection}").where(${whereJs}).count()`
    const resp = await this._post('tcb/databasecount', query)
    return resp.count
  }
}

module.exports = CloudDbClient
