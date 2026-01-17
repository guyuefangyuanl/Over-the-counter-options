// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  switch (action) {
    case 'updateStatus':
      return await updateInquiryStatus(data, OPENID)
    case 'getStats':
      return await getInquiryStats()
    default:
      return {
        success: false,
        message: '未知操作'
      }
  }
}

/**
 * 更新询价状态
 * @param {Object} data { id, status, remark }
 * @param {String} operatorOpenid
 */
async function updateInquiryStatus(data, operatorOpenid) {
  const { id, status, remark } = data
  if (!id || !status) {
    return { success: false, message: '缺少必要参数' }
  }

  try {
    const res = await db.collection('inquiries').doc(id).update({
      data: {
        status,
        remark: remark || '',
        updateTime: db.serverDate(),
        operatorOpenid
      }
    })

    if (res.stats.updated > 0) {
      return { success: true, message: '状态更新成功' }
    } else {
      return { success: false, message: '更新失败，记录可能不存在' }
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}

/**
 * 获取询价统计
 */
async function getInquiryStats() {
  try {
    const $ = db.command.aggregate
    const stats = await db.collection('inquiries').aggregate()
      .group({
        _id: '$status',
        count: $.sum(1)
      })
      .end()

    return {
      success: true,
      data: stats.list
    }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
