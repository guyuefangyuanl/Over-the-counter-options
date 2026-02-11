const config = require('../config.js'); // Assuming we will create a config.js or use hardcoded base URL for now

// Base URL configuration
const BASE_URL = 'http://localhost:5002/api/v1'; // Should be configurable based on environment

const request = (url, method = 'GET', data = {}) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    
    wx.request({
      url: `${BASE_URL}${url}`,
      method: method,
      data: data,
      header: {
        'content-type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Check custom business code if needed, but standard REST relies on status code mostly
            // Our backend returns { success: true, code: 200, data: ... }
            if (res.data && res.data.code === 401) {
                 handleUnauthorized();
                 reject(res.data);
            } else if (res.data && res.data.success === false) {
                 reject(res.data);
            } else {
                 resolve(res.data.data); // Return the data payload directly
            }
        } else if (res.statusCode === 401) {
          handleUnauthorized();
          reject({ message: 'Unauthorized' });
        } else {
          reject(res.data || { message: `Request failed with status ${res.statusCode}` });
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const handleUnauthorized = () => {
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
  // Navigate to login page or show modal
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route !== 'pages/login/login') {
      wx.navigateTo({
        url: '/pages/login/login'
      });
  }
};

const get = (url, data) => request(url, 'GET', data);
const post = (url, data) => request(url, 'POST', data);
const put = (url, data) => request(url, 'PUT', data);
const del = (url, data) => request(url, 'DELETE', data);

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  BASE_URL
};
