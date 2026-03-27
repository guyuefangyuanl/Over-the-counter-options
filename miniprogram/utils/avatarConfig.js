/**
 * 头像配置文件
 */

module.exports = {
  // 上传配置
  upload: {
    // 默认压缩质量 (0-100)
    defaultQuality: 80,
    // 最大宽度
    maxWidth: 800,
    // 最大高度
    maxHeight: 800,
    // 允许的文件类型
    allowedTypes: ['jpg', 'jpeg', 'png', 'gif', 'webp']
  },

  // 验证配置
  validation: {
    // 最大文件大小 (5MB)
    maxFileSize: 5 * 1024 * 1024,
    // 最小文件大小 (1KB)
    minFileSize: 1024
  }
};