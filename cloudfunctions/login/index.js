// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ 
  env: 'develop-8gx7kh9g045e6c9a' // 使用配置的云环境ID
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    // 获取用户openid
    const openid = wxContext.OPENID
    const appid = wxContext.APPID
    const unionid = wxContext.UNIONID
    
    // 从event中获取用户信息（由小程序端传入）
    const userInfo = event.userInfo || {}
    
    // 查询或创建用户记录
    const usersCollection = db.collection('users')
    
    // 查找用户
    const userResult = await usersCollection.where({
      openid: openid
    }).get()
    
    let userId
    const now = new Date()
    
    if (userResult.data && userResult.data.length > 0) {
      // 用户已存在，更新登录时间和用户信息
      userId = userResult.data[0]._id
      await usersCollection.doc(userId).update({
        data: {
          lastLoginTime: now,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          gender: userInfo.gender,
          updatedAt: now
        }
      })
    } else {
      // 新用户，创建记录
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
          isActive: true
        }
      })
      userId = createResult._id
    }
    
    // 生成token（简单实现，实际项目中应该使用JWT等加密方式）
    const token = Buffer.from(`${openid}_${Date.now()}`).toString('base64')
    
    // 返回登录结果
    return {
      success: true,
      message: '登录成功',
      data: {
        userId: userId,
        openid: openid,
        unionid: unionid,
        token: token,
        userInfo: {
          nickName: userInfo.nickName || '微信用户',
          avatarUrl: userInfo.avatarUrl || '',
          gender: userInfo.gender || 0
        }
      }
    }
  } catch (error) {
    console.error('登录失败:', error)
    return {
      success: false,
      message: '登录失败：' + error.message,
      error: error.toString()
    }
  }
}