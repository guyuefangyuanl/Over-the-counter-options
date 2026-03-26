/**
 * 询价服务模块
 * 封装询价提交和查询，通过 Flask API 调用
 *
 * 用户身份处理策略：
 * 1. 已登录用户：Token 自动携带，后端从认证上下文获取 userId
 * 2. 游客模式：携带游客 Token，后端标记 isGuest=true
 * 3. 匿名模式：无 Token，仅收集联系人信息
 */

const { getApiUrl } = require('../config/api.config.js');
const fileUpload = require('./fileUpload.js');
const loginService = require('./loginService.js');

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
 * 获取当前用户状态
 * @returns {{isLoggedIn: boolean, isGuest: boolean, userInfo: Object|null}}
 */
function getUserStatus() {
  const token = getToken();
  const userInfo = wx.getStorageSync('userInfo') || null;

  // 检查是否为游客模式
  const isGuest = userInfo && userInfo.isGuest === true;
  const isLoggedIn = !!(token && userInfo && userInfo.isLoggedIn);

  return {
    isLoggedIn,
    isGuest,
    userInfo,
    token
  };
}

/**
 * 检查是否可以提交询价
 * @returns {{canSubmit: boolean, reason: string, suggestion: string}}
 */
function checkSubmitPermission() {
  const { isLoggedIn, isGuest } = getUserStatus();

  if (isGuest) {
    return {
      canSubmit: true,
      reason: 'guest_mode',
      suggestion: '您正在使用游客模式，询价记录将无法在账户中保存。建议登录以获取完整服务。'
    };
  }

  if (isLoggedIn) {
    return {
      canSubmit: true,
      reason: 'logged_in',
      suggestion: ''
    };
  }

  // 匿名用户允许提交，但需要填写联系人信息
  return {
    canSubmit: true,
    reason: 'anonymous',
    suggestion: '您尚未登录，询价记录将无法在账户中查看。建议登录后提交。'
  };
}

/**
 * 构建询价提交数据（简化版，用户身份由后端处理）
 * @param {Object} formData - 表单数据
 * @returns {Object} - 提交数据
 */
function buildSubmitData(formData) {
  const { isLoggedIn, isGuest, userInfo } = getUserStatus();

  // 基础提交数据（前端不再传递 userId/openid，由后端从认证上下文获取）
  const submitData = {
    // 产品信息
    selectedProduct: formData.selectedProduct || null,
    productName: formData.productName || formData.selectedProduct?.name || '',
    productCode: formData.productCode || formData.selectedProduct?.code || '',

    // 询价参数
    optionType: formData.optionType || 'call',
    structure: formData.structure || 'vanilla',
    term: formData.term || '1M',
    notionalAmount: formData.notionalAmount,
    strikePrice: formData.strikePrice || '100',
    selectedDealers: formData.selectedDealers || [],

    // 联系信息（必填）
    contactName: formData.contactName || '',
    contactPhone: formData.contactPhone || '',
    contactEmail: formData.contactEmail || '',
    notes: formData.notes || '',

    // 来源标记
    source: formData.source || 'miniprogram'
  };

  // 游客模式标记
  if (isGuest) {
    submitData.source = 'guest_miniprogram';
  }

  return submitData;
}

/**
 * 提交询价（通过 Flask API）
 * @param {Object} submitData - 询价数据
 * @param {Array} attachments - 附件列表 [{tempFilePath, name, size}]
 * @returns {Promise<{success: boolean, message: string, data?: {id: string}}>}
 */
async function submitInquiry(submitData, attachments = []) {
  try {
    // 检查提交权限
    const permission = checkSubmitPermission();

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
            // 处理游客模式提示
            if (result.data?.guestNotice) {
              wx.showToast({
                title: '游客模式',
                icon: 'none',
                duration: 2000
              });
            }

            resolve({
              success: true,
              message: result.message || '询价提交成功',
              data: result.data,
              permission: permission.reason
            });
          } else {
            // 处理特定错误
            const errorMsg = result.message || '询价提交失败';

            // 认证错误处理
            if (res.statusCode === 401 || result.code === 401) {
              console.warn('Token 已过期，建议重新登录');
              // 不自动跳转，让用户决定
            }

            reject(new Error(errorMsg));
          }
        },
        fail: (err) => {
          console.error('调用询价 API 失败:', err);
          // 网络错误时的降级提示
          reject(new Error('网络异常，请检查网络后重试'));
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
  getInquiryDetail,
  getUserStatus,
  checkSubmitPermission,
  buildSubmitData
}
