// 头像工具类
const config = require('./avatarConfig.js');

const AvatarUtils = {
  
  /**
   * 获取默认头像URL
   * @returns {string} 默认头像路径
   */
  getDefaultAvatar() {
    // 使用base64编码的SVG默认头像，避免网络请求错误
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiNFNkYzRkYiLz4KPGNpcmNsZSBjeD0iMzIiIGN5PSIyNCIgcj0iOCIgZmlsbD0iIzQwOUVGRiIvPgo8cGF0aCBkPSJNMTYgNTJjMC04LjgzNyA3LjE2My0xNiAxNi0xNnMxNiA3LjE2MyAxNiAxNnY0SDE2di00eiIgZmlsbD0iIzQwOUVGRiIvPgo8L3N2Zz4=';
  },

  /**
   * 获取用户头像URL，如果没有则返回默认头像
   * @param {string} avatarUrl 用户头像URL
   * @returns {string} 头像URL
   */
  getUserAvatar(avatarUrl) {
    if (!avatarUrl || avatarUrl.trim() === '' || !this.isValidAvatarUrl(avatarUrl)) {
      return this.getDefaultAvatar();
    }
    return avatarUrl;
  },

  /**
   * 验证头像URL是否有效
   * @param {string} avatarUrl - 头像URL
   * @returns {boolean} 是否有效
   */
  isValidAvatarUrl(avatarUrl) {
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return false;
    }
    
    // 检查是否为空字符串或占位符
    if (avatarUrl.trim() === '' || 
        avatarUrl.includes('default') || 
        avatarUrl.includes('placeholder') ||
        avatarUrl.startsWith('data:image')) {
      return false;
    }
    
    // 检查URL格式
    try {
      new URL(avatarUrl);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 处理头像加载错误
   * @param {Event} event 错误事件
   * @param {Object} that 页面this对象
   * @param {string} dataPath 数据路径
   */
  onAvatarError(event, that, dataPath = 'userInfo.avatar') {
    console.warn('头像加载失败，使用默认头像');
    const updateData = {};
    updateData[dataPath] = this.getDefaultAvatar();
    that.setData(updateData);
  },

  /**
   * 预览头像
   * @param {string} avatarUrl 头像URL
   */
  previewAvatar(avatarUrl) {
    if (!avatarUrl || avatarUrl === this.getDefaultAvatar()) {
      wx.showToast({
        title: '暂无头像可预览',
        icon: 'none'
      });
      return;
    }
    
    wx.previewImage({
      urls: [avatarUrl],
      current: avatarUrl
    });
  },

  /**
   * 上传头像到服务器
   * @param {string} tempFilePath 临时文件路径
   * @param {string} userId 用户ID
   * @returns {Promise<string>} 上传后的头像URL
   */
  async uploadAvatar(tempFilePath, userId) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${getApp().globalData.baseUrl}/api/upload/avatar`,
        filePath: tempFilePath,
        name: 'avatar',
        formData: {
          userId: userId
        },
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.success) {
              resolve(data.data.url);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('服务器响应格式错误'));
          }
        },
        fail: (err) => {
          reject(new Error('网络请求失败'));
        }
      });
    });
  },

  /**
   * 压缩图片
   * @param {string} filePath 原始文件路径
   * @param {Object} options 压缩选项
   * @returns {Promise<string>} 压缩后的文件路径
   */
  compressImage(filePath, options = {}) {
    const { 
      quality = config.upload.defaultQuality, 
      maxWidth = config.upload.maxWidth, 
      maxHeight = config.upload.maxHeight 
    } = options;
    
    return new Promise((resolve, reject) => {
      // 获取图片信息
      wx.getImageInfo({
        src: filePath,
        success: (info) => {
          const { width, height } = info;
          
          // 计算压缩比例
          let scale = 1;
          if (width > maxWidth || height > maxHeight) {
            scale = Math.min(maxWidth / width, maxHeight / height);
          }
          
          const newWidth = Math.floor(width * scale);
          const newHeight = Math.floor(height * scale);
          
          // 压缩图片
          wx.compressImage({
            src: filePath,
            quality: quality,
            success: (compressed) => {
              resolve(compressed.tempFilePath);
            },
            fail: (err) => {
              console.warn('图片压缩失败，使用原始图片:', err);
              resolve(filePath); // 压缩失败时使用原始图片
            }
          });
        },
        fail: (err) => {
          console.warn('获取图片信息失败:', err);
          resolve(filePath); // 获取信息失败时使用原始图片
        }
      });
    });
  },

  /**
   * 验证头像文件
   * @param {string} filePath 文件路径
   * @returns {Object} 验证结果 {valid: boolean, message: string}
   */
  validateAvatarFile(filePath) {
    // 检查文件是否存在
    if (!filePath) {
      return { valid: false, message: '请选择头像文件' };
    }

    // 检查文件大小
    try {
      const fileInfo = wx.getFileSystemManager().statSync(filePath);
      if (fileInfo.size > config.validation.maxFileSize) {
        return { valid: false, message: `头像文件过大，请选择小于${config.validation.maxFileSize / 1024 / 1024}MB的图片` };
      }
      if (fileInfo.size < config.validation.minFileSize) {
        return { valid: false, message: '头像文件过小' };
      }
    } catch (error) {
      console.warn('获取文件信息失败:', error);
      // 如果无法获取文件信息，继续后续验证
    }

    // 检查文件格式
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    if (!config.upload.allowedTypes.includes(ext.replace('.', ''))) {
      return { valid: false, message: `不支持的文件格式，请选择${config.upload.allowedTypes.join('、')}格式的图片` };
    }

    return { valid: true, message: '' };
  }
};

module.exports = AvatarUtils;