/**
 * 询价服务模块
 * 封装询价提交和查询，通过 Flask API 调用
 */

const { getApiUrl } = require('../config/api.config.js');

/**
 * 获取存储的 token
 */
function getToken() {
  try {
    return wx.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

/**
 * 提交询价（通过 Flask API）
 * @param {Object} submitData - 询价数据
 * @returns {Promise<{success: boolean, message: string, data?: {id: string}}>}
 */
function submitInquiry(submitData) {
  return new Promise((resolve, reject) => {
    const url = getApiUrl('/inquiry');
    const token = getToken();
    
    wx.request({
      url: url,
      method: 'POST',
      data: submitData,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        const result = res.data || {};
        if (result.success) {
          resolve({
            success: true,
            message: result.message || '询价提交成功',
            data: result.data
          });
        } else {
          reject(new Error(result.message || '询价提交失败'));
        }
      },
      fail: (err) => {
        console.error('调用询价 API 失败:', err);
        reject(new Error('网络异常，请稍后重试'));
      }
    });
  });
}

/**
 * 查询当前用户的询价列表
 * @param {Object} options - { page, pageSize, status }
 * @returns {Promise<{success: boolean, data?: {list: Array, total: number}}>}
 */
function getMyInquiries(options = {}) {
  return new Promise((resolve, reject) => {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const status = options.status || '';
    
    let url = getApiUrl(`/inquiries?page=${page}&pageSize=${pageSize}`);
    if (status) {
      url += `&status=${status}`;
    }
    
    const token = getToken();
    
    wx.request({
      url: url,
      method: 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        const result = res.data || {};
        if (result.success) {
          resolve({
            success: true,
            data: {
              list: result.data?.items || result.data || [],
              total: result.data?.pagination?.total || result.data?.total || 0
            }
          });
        } else {
          reject(new Error(result.message || '查询失败'));
        }
      },
      fail: (err) => {
        console.error('查询询价列表失败:', err);
        reject(new Error('查询询价列表失败'));
      }
    });
  });
}

/**
 * 查询单条询价详情
 * @param {string} inquiryId
 * @returns {Promise<{success: boolean, data?: Object}>}
 */
function getInquiryDetail(inquiryId) {
  return new Promise((resolve, reject) => {
    const url = getApiUrl(`/inquiries/${inquiryId}`);
    const token = getToken();
    
    wx.request({
      url: url,
      method: 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        const result = res.data || {};
        if (result.success) {
          resolve({
            success: true,
            data: result.data
          });
        } else {
          reject(new Error(result.message || '查询详情失败'));
        }
      },
      fail: (err) => {
        console.error('查询询价详情失败:', err);
        reject(new Error('查询询价详情失败'));
      }
    });
  });
}

module.exports = {
  submitInquiry,
  getMyInquiries,
  getInquiryDetail
}
