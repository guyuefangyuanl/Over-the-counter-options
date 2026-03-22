/**
 * 文件上传工具
 * 支持微信云存储直传
 */

const api = require('./api.js');

/**
 * 选择并上传图片
 * @param {Object} options - 配置选项
 * @param {number} options.count - 最多选择图片数量，默认1
 * @param {Array} options.sizeType - 图片尺寸类型，默认['compressed']
 * @param {string} options.folder - 云存储文件夹，默认'inquiries'
 * @returns {Promise} 上传结果
 */
function chooseAndUploadImage(options = {}) {
  const { count = 1, sizeType = ['compressed'], folder = 'inquiries' } = options;
  
  return new Promise((resolve, reject) => {
    // 1. 选择图片
    wx.chooseMedia({
      count: count,
      mediaType: ['image'],
      sizeType: sizeType,
      sourceType: ['album', 'camera'],
      success: async (chooseRes) => {
        try {
          const uploadResults = [];
          
          for (const tempFile of chooseRes.tempFiles) {
            // 2. 准备上传
            const prepareRes = await api.post('/upload/prepare', {
              filename: tempFile.tempFilePath.split('/').pop() || `image_${Date.now()}.jpg`,
              fileSize: tempFile.size,
              folder: folder
            });
            
            if (!prepareRes.success) {
              throw new Error(prepareRes.message || '文件验证失败');
            }
            
            const cloudPath = prepareRes.data.cloudPath;
            
            // 3. 上传到云存储
            const uploadRes = await new Promise((uploadResolve, uploadReject) => {
              wx.cloud.uploadFile({
                cloudPath: cloudPath,
                filePath: tempFile.tempFilePath,
                success: (res) => uploadResolve(res),
                fail: (err) => uploadReject(err)
              });
            });
            
            // 4. 确认上传
            await api.post('/upload/confirm', {
              cloudPath: cloudPath,
              fileId: uploadRes.fileID
            });
            
            uploadResults.push({
              fileID: uploadRes.fileID,
              cloudPath: cloudPath,
              size: tempFile.size
            });
          }
          
          resolve({
            success: true,
            files: uploadResults
          });
          
        } catch (error) {
          console.error('上传失败:', error);
          reject({
            success: false,
            message: error.message || '上传失败'
          });
        }
      },
      fail: (err) => {
        reject({
          success: false,
          message: '取消选择图片'
        });
      }
    });
  });
}

/**
 * 选择并上传文件（文档类）
 * @param {Object} options - 配置选项
 * @param {string} options.folder - 云存储文件夹，默认'inquiries'
 * @returns {Promise} 上传结果
 */
function chooseAndUploadFile(options = {}) {
  const { folder = 'inquiries' } = options;
  
  return new Promise((resolve, reject) => {
    // 1. 选择文件
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
      success: async (chooseRes) => {
        try {
          const tempFile = chooseRes.tempFiles[0];
          
          // 检查文件大小（最大50MB）
          const maxSize = 50 * 1024 * 1024;
          if (tempFile.size > maxSize) {
            throw new Error('文件大小超过限制（50MB）');
          }
          
          // 2. 准备上传
          const prepareRes = await api.post('/upload/prepare', {
            filename: tempFile.name,
            fileSize: tempFile.size,
            folder: folder
          });
          
          if (!prepareRes.success) {
            throw new Error(prepareRes.message || '文件验证失败');
          }
          
          const cloudPath = prepareRes.data.cloudPath;
          
          // 3. 上传到云存储
          const uploadRes = await new Promise((uploadResolve, uploadReject) => {
            wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: tempFile.path,
              success: (res) => uploadResolve(res),
              fail: (err) => uploadReject(err)
            });
          });
          
          // 4. 确认上传
          await api.post('/upload/confirm', {
            cloudPath: cloudPath,
            fileId: uploadRes.fileID
          });
          
          resolve({
            success: true,
            file: {
              fileID: uploadRes.fileID,
              cloudPath: cloudPath,
              name: tempFile.name,
              size: tempFile.size
            }
          });
          
        } catch (error) {
          console.error('上传失败:', error);
          reject({
            success: false,
            message: error.message || '上传失败'
          });
        }
      },
      fail: (err) => {
        reject({
          success: false,
          message: '取消选择文件'
        });
      }
    });
  });
}

/**
 * 获取文件临时下载链接
 * @param {string} fileID - 文件ID
 * @returns {Promise} 下载链接
 */
function getDownloadUrl(fileID) {
  return new Promise((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          const fileInfo = res.fileList[0];
          if (fileInfo.status === 0) {
            resolve({
              success: true,
              url: fileInfo.tempFileURL
            });
          } else {
            reject({
              success: false,
              message: '获取下载链接失败'
            });
          }
        } else {
          reject({
            success: false,
            message: '文件不存在'
          });
        }
      },
      fail: (err) => {
        reject({
          success: false,
          message: '获取下载链接失败'
        });
      }
    });
  });
}

/**
 * 删除云存储文件
 * @param {string} fileID - 文件ID
 * @returns {Promise} 删除结果
 */
function deleteFile(fileID) {
  return new Promise((resolve, reject) => {
    wx.cloud.deleteFile({
      fileList: [fileID],
      success: (res) => {
        if (res.fileList && res.fileList.length > 0) {
          const fileInfo = res.fileList[0];
          if (fileInfo.status === 0) {
            resolve({
              success: true
            });
          } else {
            reject({
              success: false,
              message: '删除失败'
            });
          }
        } else {
          resolve({
            success: true
          });
        }
      },
      fail: (err) => {
        reject({
          success: false,
          message: '删除失败'
        });
      }
    });
  });
}

/**
 * 预览文档
 * @param {string} fileID - 文件ID
 * @returns {Promise} 预览结果
 */
async function previewDocument(fileID) {
  try {
    // 先获取下载链接
    const downloadRes = await getDownloadUrl(fileID);
    
    if (!downloadRes.success) {
      throw new Error(downloadRes.message);
    }
    
    // 下载文件
    const downloadFile = await new Promise((resolve, reject) => {
      wx.downloadFile({
        url: downloadRes.url,
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });
    
    // 预览文档
    wx.openDocument({
      filePath: downloadFile.tempFilePath,
      success: () => {
        return { success: true };
      },
      fail: (err) => {
        throw new Error('预览失败');
      }
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('预览文档失败:', error);
    return {
      success: false,
      message: error.message || '预览失败'
    };
  }
}

/**
 * 预览图片
 * @param {string} fileID - 文件ID
 * @param {Array} allFileIDs - 所有图片ID列表（用于滑动查看）
 * @returns {Promise} 预览结果
 */
async function previewImage(fileID, allFileIDs = []) {
  try {
    // 获取所有图片的下载链接
    const urls = [];
    
    if (allFileIDs.length > 0) {
      for (const id of allFileIDs) {
        const res = await getDownloadUrl(id);
        if (res.success) {
          urls.push(res.url);
        }
      }
    } else {
      const res = await getDownloadUrl(fileID);
      if (res.success) {
        urls.push(res.url);
      }
    }
    
    // 找到当前图片的索引
    const currentUrl = urls.find((url, index) => {
      // 简单匹配，假设URL包含fileID
      return url.indexOf(fileID) !== -1;
    }) || urls[0];
    
    // 预览图片
    wx.previewImage({
      current: currentUrl,
      urls: urls
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('预览图片失败:', error);
    return {
      success: false,
      message: error.message || '预览失败'
    };
  }
}

module.exports = {
  chooseAndUploadImage,
  chooseAndUploadFile,
  getDownloadUrl,
  deleteFile,
  previewDocument,
  previewImage
};