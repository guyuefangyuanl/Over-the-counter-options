/**
 * 错误上报云函数
 * 接收客户端错误信息并存储到数据库
 */
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const MAX_BATCH_SIZE = 50 // 单次批量写入上限

/**
 * 将单条错误记录写入数据库
 */
async function saveError(errorData, openid) {
  const now = new Date()
  return db.collection('error_logs').add({
    data: {
      type: errorData.type || 'unknown',
      message: String(errorData.message || ''),
      stack: String(errorData.stack || ''),
      page: errorData.page || 'unknown',
      userInfo: errorData.userInfo || null,
      systemInfo: errorData.systemInfo || null,
      performance: errorData.performance || null,
      env: errorData.env || null,
      openid: openid,
      clientTimestamp: errorData.timestamp || null,
      cachedAt: errorData.cachedAt || null,
      createdAt: now
    }
  })
}

// 云函数入口
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 批量上报
    if (event.type === 'batch' && Array.isArray(event.errors)) {
      const errors = event.errors.slice(0, MAX_BATCH_SIZE)
      const results = await Promise.allSettled(
        errors.map(err => saveError(err, openid))
      )

      const successCount = results.filter(r => r.status === 'fulfilled').length
      const failCount = results.length - successCount

      return {
        success: true,
        message: `批量上报完成: 成功 ${successCount}, 失败 ${failCount}`,
        data: { successCount, failCount, total: errors.length }
      }
    }

    // 单条上报
    await saveError(event, openid)
    return {
      success: true,
      message: '错误上报成功'
    }
  } catch (error) {
    console.error('错误上报处理失败:', error)
    return {
      success: false,
      message: '错误上报处理失败: ' + (error.message || '未知错误')
    }
  }
}
