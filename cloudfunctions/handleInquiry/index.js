// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 统一的询价状态定义
const INQUIRY_STATUS = {
  PENDING: 'pending',       // 待处理
  PROCESSING: 'processing', // 处理中
  QUOTED: 'quoted',         // 已报价
  COMPLETED: 'completed',   // 已成交
  REJECTED: 'rejected'      // 已拒绝
}

// 状态标签映射
const STATUS_LABELS = {
  [INQUIRY_STATUS.PENDING]: '待处理',
  [INQUIRY_STATUS.PROCESSING]: '处理中',
  [INQUIRY_STATUS.QUOTED]: '已报价',
  [INQUIRY_STATUS.COMPLETED]: '已成交',
  [INQUIRY_STATUS.REJECTED]: '已拒绝'
}

// 合法的状态转换
const VALID_TRANSITIONS = {
  [INQUIRY_STATUS.PENDING]: [
    INQUIRY_STATUS.PROCESSING,
    INQUIRY_STATUS.QUOTED,
    INQUIRY_STATUS.REJECTED
  ],
  [INQUIRY_STATUS.PROCESSING]: [
    INQUIRY_STATUS.QUOTED,
    INQUIRY_STATUS.COMPLETED,
    INQUIRY_STATUS.REJECTED
  ],
  [INQUIRY_STATUS.QUOTED]: [
    INQUIRY_STATUS.COMPLETED,
    INQUIRY_STATUS.REJECTED
  ],
  [INQUIRY_STATUS.COMPLETED]: [],  // 终态
  [INQUIRY_STATUS.REJECTED]: []    // 终态
}

/**
 * 验证状态转换是否合法
 * @param {String} fromStatus 当前状态
 * @param {String} toStatus 目标状态
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validateTransition(fromStatus, toStatus) {
  // 检查目标状态是否有效
  const allStatuses = Object.values(INQUIRY_STATUS)
  if (!allStatuses.includes(toStatus)) {
    return { valid: false, error: `无效的目标状态: ${toStatus}` }
  }

  // 检查状态转换是否合法
  const allowedTransitions = VALID_TRANSITIONS[fromStatus]
  if (allowedTransitions === undefined) {
    // 未知状态，允许转换（兼容历史数据）
    return { valid: true, error: null }
  }

  if (!allowedTransitions.includes(toStatus)) {
    const allowedLabels = allowedTransitions.map(s => STATUS_LABELS[s])
    return {
      valid: false,
      error: `状态'${STATUS_LABELS[fromStatus]}'不能转换为'${STATUS_LABELS[toStatus]}'，允许的转换: ${allowedLabels.length > 0 ? allowedLabels.join('、') : '无'}`
    }
  }

  return { valid: true, error: null }
}

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

  // 验证目标状态是否有效
  const allStatuses = Object.values(INQUIRY_STATUS)
  if (!allStatuses.includes(status)) {
    return { success: false, message: `无效的状态值: ${status}` }
  }

  try {
    // 获取当前记录以验证状态流转
    const currentRes = await db.collection('inquiries').doc(id).get()
    const currentRecord = currentRes.data

    if (!currentRecord) {
      return { success: false, message: '询价记录不存在' }
    }

    const currentStatus = currentRecord.status || INQUIRY_STATUS.PENDING

    // 验证状态转换
    const validation = validateTransition(currentStatus, status)
    if (!validation.valid) {
      console.warn(`状态流转验证失败: ${id}, ${currentStatus} -> ${status}, error: ${validation.error}`)
      return { success: false, message: validation.error }
    }

    // 执行更新
    const res = await db.collection('inquiries').doc(id).update({
      data: {
        status,
        remark: remark || '',
        updateTime: db.serverDate(),
        operatorOpenid
      }
    })

    if (res.stats.updated > 0) {
      console.log(`状态更新成功: ${id}, ${currentStatus} -> ${status}`)
      return { success: true, message: '状态更新成功' }
    } else {
      return { success: false, message: '更新失败，记录可能不存在' }
    }
  } catch (err) {
    console.error('updateInquiryStatus 失败:', err)
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

    // 确保所有状态都有统计值
    const result = {}
    Object.values(INQUIRY_STATUS).forEach(status => {
      result[status] = 0
    })

    stats.list.forEach(item => {
      if (item._id) {
        result[item._id] = item.count
      }
    })

    return {
      success: true,
      data: result
    }
  } catch (err) {
    console.error('getInquiryStats 失败:', err)
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
      // 验证状态值
      const allStatuses = Object.values(INQUIRY_STATUS)
      if (!allStatuses.includes(data.status)) {
        return { success: false, message: `无效的状态值: ${data.status}` }
      }
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