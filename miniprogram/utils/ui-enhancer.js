// 轻量 UI 增强工具，兼容微信小程序 API
const loadingKeys = new Set();

function pageLoadWithAnimation(page, task, opts = {}) {
  const { loadingText = '加载中...', errorText = '加载失败' } = opts;
  return new Promise(async (resolve, reject) => {
    try {
      showLoading(loadingText, 'page-load');
      page.setData && page.setData({ pageLoading: true });
      await task();
      page.setData && page.setData({ pageLoading: false });
      hideLoading('page-load');
      resolve();
    } catch (e) {
      console.error(e);
      hideLoading('page-load');
      showError(errorText);
      reject(e);
    }
  });
}

function showLoading(title = '加载中...', key = 'global') {
  if (!loadingKeys.has(key)) {
    loadingKeys.add(key);
    if (wx && wx.showLoading) wx.showLoading({ title, mask: true });
  }
}

function hideLoading(key = 'global') {
  if (loadingKeys.has(key)) {
    loadingKeys.delete(key);
    if (wx && wx.hideLoading) wx.hideLoading();
  }
}

function showToast(title = '提示', icon = 'none') {
  if (wx && wx.showToast) wx.showToast({ title, icon });
}

function showError(title = '出错了') {
  showToast(title, 'error');
}

function showModal(title, content, onConfirm, options = {}) {
  if (wx && wx.showModal) {
    wx.showModal({ title, content, ...options, success: (res) => { if (res.confirm && onConfirm) onConfirm(); } });
  }
}

function hapticFeedback(level = 'light') {}

module.exports = {
  pageLoadWithAnimation,
  showLoading,
  hideLoading,
  showToast,
  showError,
  showModal,
  hapticFeedback,
};
