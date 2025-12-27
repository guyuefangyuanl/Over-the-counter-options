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
  }

  static fromEnv() {
    const envId = process.env.WX_CLOUD_ENV || process.env.WX_ENV_ID
    const appId = process.env.WX_APPID || process.env.WECHAT_APPID
    const secret = process.env.WX_SECRET || process.env.WECHAT_SECRET

    if (!envId || !appId || !secret) {
      throw new Error('缺少微信云开发配置环境变量: WX_CLOUD_ENV, WX_APPID, WX_SECRET')
    }

    return new CloudDbClient({ envId, appId, secret })
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
    try {
      const resp = await this.client.post(`/${apiPath}?access_token=${token}`, {
        env: this.envId,
        query,
      })

      if (resp.data.errcode) {
        throw new Error(`云数据库请求失败 [${resp.data.errcode}]: ${resp.data.errmsg}`)
      }

      return resp.data
    } catch (e) {
      console.error(`❌ 云数据库 API 调用失败 (${apiPath}):`, e.message)
      throw e
    }
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
}

module.exports = CloudDbClient
