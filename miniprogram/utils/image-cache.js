/**
 * 图片缓存工具（简化版）
 * - 将远程图片下载到本地文件系统并缓存其路径
 * - 对于本地图片路径（以 /images/ 开头），直接返回原路径
 * - 失败时回退到原始 URL
 */

const STORAGE_KEY = 'IMAGE_CACHE_MAP_V1';

function getCacheMap() {
  try {
    const map = wx.getStorageSync(STORAGE_KEY);
    return map || {};
  } catch (e) {
    return {};
  }
}

function setCacheMap(map) {
  try {
    wx.setStorageSync(STORAGE_KEY, map);
  } catch (e) {}
}

/**
 * 检查并缓存图片，返回可用路径（本地或原始）
 * @param {string} url 远程或本地图片 URL
 * @returns {Promise<string>} 可直接用于 <image src> 的路径
 */
function ensure(url) {
  return new Promise((resolve, reject) => {
    // 本地资源直接返回
    if (typeof url === 'string' && url.startsWith('/images/')) {
      resolve(url);
      return;
    }

    const map = getCacheMap();
    if (map[url]) {
      resolve(map[url]);
      return;
    }

    // 下载文件
    wx.downloadFile({
      url,
      timeout: 10000,
      success(res) {
        if (res.statusCode === 200) {
          // 保存到本地文件系统
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success(sv) {
              map[url] = sv.savedFilePath;
              setCacheMap(map);
              resolve(sv.savedFilePath);
            },
            fail(err) {
              console.warn('保存图片失败，回退 URL', err);
              resolve(url);
            }
          });
        } else {
          console.warn('下载图片失败', res.statusCode);
          resolve(url);
        }
      },
      fail(err) {
        console.warn('下载异常', err);
        resolve(url);
      }
    });
  });
}

module.exports = { ensure };

