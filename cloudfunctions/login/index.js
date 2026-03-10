/**
 * 微信登录云函数
 * 与后端Flask服务配合，实现JWT双Token认证
 */
const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')

cloud.init({ 
  env: 'develop-8gx7kh9g045e6c9a' // 使用配置的云环境ID
})

const db = cloud.database()

const DEFAULT_API_BASE_URL = 'https://flask-ym1v-210758-7-1374336462.sh.run.tcloudbase.com/api/v1'

const postJson = (url, payload) => new Promise((resolve, reject) => {
  const target = new URL(url)
  const client = target.protocol === 'https:' ? https : http
  const data = JSON.stringify(payload)
  const req = client.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    let raw = ''
    res.on('data', chunk => { raw += chunk })
    res.on('end', () => {
      if (!raw) {
        resolve({ statusCode: res.statusCode || 0, data: null })
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve({ statusCode: res.statusCode || 0, data: parsed })
      } catch (err) {
        reject(err)
      }
    })
  })
  req.on('error', reject)
  req.write(data)
  req.end()
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    // 获取用户openid
    const openid = wxContext.OPENID
    const appid = wxContext.APPID
    const unionid = wxContext.UNIONID
    
    if (!openid) {
      return {
        success: false,
        message: '获取用户openid失败'
      }
    }
    
    // 从event中获取用户信息（由小程序端传入）
    const userInfo = event.userInfo || {}
    
    // 查询或创建用户记录
    const usersCollection = db.collection('users')
    
    // 查找用户
    let userResult
    try {
      userResult = await usersCollection.where({
        openid: openid
      }).get()
    } catch (dbError) {
      console.error('查询用户失败:', dbError)
      // 数据库查询失败时继续执行，返回基本登录信息
      userResult = { data: [] }
    }
    
    let userId
    let userData
    const now = new Date()
    
    if (userResult.data && userResult.data.length > 0) {
      // 用户已存在，更新登录时间和用户信息
      userData = userResult.data[0]
      userId = userData._id
      
      try {
        await usersCollection.doc(userId).update({
          data: {
            lastLoginTime: now,
            loginCount: db.command.inc(1),
            updatedAt: now
          }
        })
      } catch (updateError) {
        console.warn('更新用户登录时间失败:', updateError)
      }
    } else {
      // 新用户，创建记录
      try {
        const createResult = await usersCollection.add({
          data: {
            openid: openid,
            unionid: unionid,
            appid: appid,
            nickName: userInfo.nickName || '微信用户',
            avatarUrl: userInfo.avatarUrl || '',
            gender: userInfo.gender || 0,
            createdAt: now,
            lastLoginTime: now,
            updatedAt: now,
            isActive: true,
            loginCount: 1
          }
        })
        userId = createResult._id
        userData = { _id: userId }
      } catch (createError) {
        console.error('创建用户失败:', createError)
        // 创建失败时继续使用openid作为标识
        userId = `temp_${openid}`
      }
    }
    
    const code = event.code
    if (!code) {
      return {
        success: false,
        message: '缺少code参数'
      }
    }

    const apiBaseUrl = process.env.API_BASE_URL || DEFAULT_API_BASE_URL
    const loginUrl = `${apiBaseUrl.replace(/\/$/, '')}/auth/wechat/login`
    const response = await postJson(loginUrl, {
      code: code,
      userInfo: userInfo
    })

    if (response && response.data) {
      return response.data
    }

    return {
      success: false,
      message: '登录失败'
    }
  } catch (error) {
    console.error('登录失败:', error)
    return {
      success: false,
      message: '登录失败：' + (error.message || '未知错误'),
      error: error.toString()
    }
  }
}
