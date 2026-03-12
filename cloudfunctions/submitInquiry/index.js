/**
 * 询价提交云函数
 * 替代前端直接写入 inquiries 集合，增加服务端校验和权限控制
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 手机号格式校验
function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone)
}

// 清理和校验提交数据
function sanitizeSubmitData(data) {
  const errors = []

  // 必填字段检查
  if (!data.productName && !data.selectedProduct) {
    errors.push('产品名称不能为空')
  }

  if (data.notionalAmount !== undefined && data.notionalAmount !== '') {
    const amount = Number(data.notionalAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push('名义本金必须大于0')
    }
  }

  if (data.contactPhone && !isValidPhone(data.contactPhone)) {
    errors.push('手机号格式不正确')
  }

  if (data.notes && data.notes.length > 500) {
    errors.push('备注不能超过500字')
  }

  return { errors }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) {
    return { success: false, message: '用户身份验证失败' }
  }

  try {
    const data = event.data || event
    const { errors } = sanitizeSubmitData(data)

    if (errors.length > 0) {
      return { success: false, message: errors.join('; ') }
    }

    // 构造安全的询价记录：过滤掉前端传入的敏感字段
    const {
      openid: _ignoreOpenid,
      userId: _ignoreUserId,
      _id: _ignoreId,
      ...safeData
    } = data

    const inquiryRecord = {
      ...safeData,
      openid: OPENID,
      status: 'pending',
      source: data.source || 'miniprogram',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }

    const res = await db.collection('inquiries').add({ data: inquiryRecord })

    return {
      success: true,
      message: '询价提交成功',
      data: { inquiryId: res._id }
    }
  } catch (err) {
    console.error('submitInquiry 失败:', err)
    return {
      success: false,
      message: '询价提交失败: ' + (err.message || '未知错误')
    }
  }
}
