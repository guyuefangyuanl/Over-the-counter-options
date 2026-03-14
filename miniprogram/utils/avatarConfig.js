// 头像配置文件
module.exports = {
  // 头像上传配置
  upload: {
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedTypes: ['jpg', 'jpeg', 'png', 'gif'],
    defaultQuality: 80,
    maxWidth: 800,
    maxHeight: 800
  },
  
  // 重试配置
  retry: {
    maxAttempts: 3,
    delay: 1000, // 毫秒
    exponentialBackoff: true
  },
  
  // 验证配置
  validation: {
    minFileSize: 1024, // 1KB
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif']
  },
  
  // 默认头像配置
  defaultAvatar: {
    width: 100,
    height: 100,
    backgroundColor: '#cccccc',
    textColor: '#666666'
  }
};