// 头像工具类
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
    if (!avatarUrl || avatarUrl.trim() === '') {
      return this.getDefaultAvatar();
    }
    return avatarUrl;
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
  }
};

module.exports = AvatarUtils;