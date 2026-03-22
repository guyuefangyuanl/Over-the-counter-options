/**
 * 询价服务模块
 * 封装询价提交和查询，通过 Flask API 调用
 */

const { getApiUrl } = require('../config/api.config.js');
const fileUpload = require('./fileUpload.js');

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
 * @param {Array} attachments - 附件列表 [{tempFilePath, name, size}]
 * @returns {Promise<{success: boolean, message: string, data?: {id: string}}>}
 */
async function submitInquiry(submitData, attachments = []) {
  try {
    // 1. 处理附件上传
    const uploadedFiles = [];
    
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        try {
          // 根据文件类型选择上传方式
          const ext = (attachment.name || '').split('.').pop().toLowerCase();
          const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
          
          if (imageExts.includes(ext)) {
            // 图片上传
            const uploadRes = await new Promise((resolve, reject) => {
              wx.cloud.uploadFile({
                cloudPath: `inquiries/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`,
                filePath: attachment.tempFilePath,
                success: res => resolve(res),
                fail: err => reject(err)
              });
            });
            uploadedFiles.push({
              fileID: uploadRes.fileID,
              name: attachment.name,
              type: 'image'
            });
          } else {
            // 文档上传
            const uploadRes = await new Promise((resolve, reject) => {
              wx.cloud.uploadFile({
                cloudPath: `inquiries/${Date.now()}_${attachment.name}`,
                filePath: attachment.tempFilePath,
                success: res => resolve(res),
                fail: err => reject(err)
              });
            });
            uploadedFiles.push({
              fileID: uploadRes.fileID,
              name: attachment.name,
              type: 'document'
            });
          }
        } catch (uploadErr) {
          console.warn('附件上传失败:', uploadErr);
          // 继续处理其他附件
        }
      }
    }
    
    // 2. 构建提交数据
    const finalData = {
      ...submitData,
      attachments: uploadedFiles
    };
    
    // 3. 提交询价
    return new Promise((resolve, reject) => {
      const url = getApiUrl('/inquiry');
      const token = getToken();
      
      wx.request({
        url: url,
        method: 'POST',
        data: finalData,
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
    
  } catch (error) {
    console.error('提交询价失败:', error);
    throw error;
  }
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
