/**
 * 询价服务模块
 * 封装询价提交和查询，统一通过云函数调用
 */

/**
 * 提交询价（通过云函数，带服务端校验）
 * @param {Object} submitData - 询价数据
 * @returns {Promise<{success: boolean, message: string, data?: {inquiryId: string}}>}
 */
function submitInquiry(submitData) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'submitInquiry',
      data: { data: submitData },
      success: (res) => {
        const result = res.result || {}
        if (result.success) {
          resolve(result)
        } else {
          reject(new Error(result.message || '询价提交失败'))
        }
      },
      fail: (err) => {
        console.error('调用 submitInquiry 云函数失败:', err)
        reject(new Error('网络异常，请稍后重试'))
      }
    })
  })
}

/**
 * 查询当前用户的询价列表
 * @param {Object} options - { page, pageSize, status }
 * @returns {Promise<{success: boolean, data?: {list: Array, total: number}}>}
 */
function getMyInquiries(options = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'handleInquiry',
      data: {
        action: 'getMyList',
        data: {
          page: options.page || 1,
          pageSize: options.pageSize || 20,
          status: options.status || ''
        }
      },
      success: (res) => {
        resolve(res.result || {})
      },
      fail: (err) => {
        console.error('调用 handleInquiry 云函数失败:', err)
        reject(new Error('查询询价列表失败'))
      }
    })
  })
}

/**
 * 查询单条询价详情
 * @param {string} inquiryId
 * @returns {Promise<{success: boolean, data?: Object}>}
 */
function getInquiryDetail(inquiryId) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'handleInquiry',
      data: {
        action: 'getDetail',
        data: { id: inquiryId }
      },
      success: (res) => {
        resolve(res.result || {})
      },
      fail: (err) => {
        console.error('调用 handleInquiry 云函数失败:', err)
        reject(new Error('查询询价详情失败'))
      }
    })
  })
}

module.exports = {
  submitInquiry,
  getMyInquiries,
  getInquiryDetail
}
