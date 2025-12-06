// utils/uiEnhancer.js

/**
 * 显示加载提示
 */
function showLoading(title) {
  if (!title) {
    title = '加载中...';
  }
  wx.showLoading({
    title: title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示轻提示
 */
function showToast(title, icon, duration) {
  if (!icon) {
    icon = 'none';
  }
  if (!duration) {
    duration = 2000;
  }
  wx.showToast({
    title: title,
    icon: icon,
    duration: duration
  });
}

/**
 * 显示成功提示
 */
function showSuccess(title, duration) {
  if (!duration) {
    duration = 2000;
  }
  wx.showToast({
    title: title,
    icon: 'success',
    duration: duration
  });
}

/**
 * 显示失败提示
 */
function showError(title, duration) {
  if (!duration) {
    duration = 2000;
  }
  wx.showToast({
    title: title,
    icon: 'error',
    duration: duration
  });
}

/**
 * 显示模态对话框
 */
function showModal(title, content, showCancel) {
  if (showCancel === undefined) {
    showCancel = true;
  }
  return new Promise(function(resolve) {
    wx.showModal({
      title: title,
      content: content,
      showCancel: showCancel,
      success: function(res) {
        resolve(res.confirm);
      },
      fail: function() {
        resolve(false);
      }
    });
  });
}

/**
 * 显示操作菜单
 */
function showActionSheet(itemList) {
  return new Promise(function(resolve, reject) {
    wx.showActionSheet({
      itemList: itemList,
      success: function(res) {
        resolve(res.tapIndex);
      },
      fail: function(err) {
        reject(err);
      }
    });
  });
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
  if (!wait) {
    wait = 500;
  }
  var timeout;
  return function() {
    var context = this;
    var args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      func.apply(context, args);
    }, wait);
  };
}

/**
 * 节流函数
 */
function throttle(func, wait) {
  if (!wait) {
    wait = 500;
  }
  var timeout;
  return function() {
    var context = this;
    var args = arguments;
    if (!timeout) {
      timeout = setTimeout(function() {
        timeout = null;
        func.apply(context, args);
      }, wait);
    }
  };
}

/**
 * 格式化数字
 */
function formatNumber(num, precision) {
  if (!precision) {
    precision = 2;
  }
  if (typeof num !== 'number') {
    num = parseFloat(num);
  }
  if (isNaN(num)) {
    return '0.00';
  }
  return num.toFixed(precision);
}

/**
 * 格式化日期
 */
function formatDate(date, format) {
  if (!format) {
    format = 'YYYY-MM-DD';
  }
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var hours = String(date.getHours()).padStart(2, '0');
  var minutes = String(date.getMinutes()).padStart(2, '0');
  var seconds = String(date.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

// ⚠️ 重点：这里必须用 module.exports
module.exports = {
  showLoading: showLoading,
  hideLoading: hideLoading,
  showToast: showToast,
  showSuccess: showSuccess,
  showError: showError,
  showModal: showModal,
  showActionSheet: showActionSheet,
  debounce: debounce,
  throttle: throttle,
  formatNumber: formatNumber,
  formatDate: formatDate
};
