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
    case 'getMyList':
      return await getMyInquiryList(data, OPENID)
    case 'getDetail':
      return await getInquiryDetail(data, OPENID)
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

/**
 * 查询当前用户的询价列表
 * @param {Object} data { page, pageSize, status }
 * @param {String} openid
 */
async function getMyInquiryList(data, openid) {
  if (!openid) {
    return { success: false, message: '用户身份验证失败' }
  }

  try {
    const page = Math.max(1, parseInt(data?.page) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(data?.pageSize) || 20))
    const skip = (page - 1) * pageSize

    let query = db.collection('inquiries').where({ openid })

    // 支持按状态筛选
    if (data?.status) {
      query = db.collection('inquiries').where({
        openid,
        status: data.status
      })
    }

    // 并行查询列表和总数
    const [listRes, countRes] = await Promise.all([
      query.orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get(),
      query.count()
    ])

    return {
      success: true,
      data: {
        list: listRes.data,
        total: countRes.total,
        page,
        pageSize
      }
    }
  } catch (err) {
    console.error('getMyInquiryList 失败:', err)
    return { success: false, message: err.message }
  }
}

/**
 * 查询单条询价详情（仅限当前用户）
 * @param {Object} data { id }
 * @param {String} openid
 */
async function getInquiryDetail(data, openid) {
  if (!openid) {
    return { success: false, message: '用户身份验证失败' }
  }
  if (!data?.id) {
    return { success: false, message: '缺少询价ID' }
  }

  try {
    const res = await db.collection('inquiries').doc(data.id).get()
    const record = res.data

    if (!record) {
      return { success: false, message: '询价记录不存在' }
    }

    // 权限校验：只能查看自己的询价
    if (record.openid !== openid) {
      return { success: false, message: '无权查看此询价记录' }
    }

    return {
      success: true,
      data: record
    }
  } catch (err) {
    if (err.errCode === -1) {
      return { success: false, message: '询价记录不存在' }
    }
    console.error('getInquiryDetail 失败:', err)
    return { success: false, message: err.message }
  }
}
