// 询价页面
const api = require('../../utils/request');
const auth = require('../../utils/auth');

Page({
  data: {
    selectedProduct: null,
    contactName: '',
    phone: '',
    remark: '',
    isLoading: false
  },

  onLoad: function (options) {
    if (options.type === 'detail') {
        // Show detail mode (not implemented fully yet)
        return;
    }
    
    // Check login
    auth.checkSession().then(isLoggedIn => {
        if (!isLoggedIn) {
            wx.navigateTo({ url: '/pages/login/login' });
        } else {
            const userInfo = wx.getStorageSync('userInfo');
            this.setData({
                contactName: userInfo.nickname || '',
                // phone: userInfo.phone || '' // If we had phone
            });
        }
    });

    if (options.product) {
        try {
            const product = JSON.parse(decodeURIComponent(options.product));
            this.setData({ selectedProduct: product });
        } catch (e) {
            console.error(e);
        }
    }
  },

  onInputName: function(e) {
      this.setData({ contactName: e.detail.value });
  },

  onInputPhone: function(e) {
      this.setData({ phone: e.detail.value });
  },
  
  onInputRemark: function(e) {
      this.setData({ remark: e.detail.value });
  },

  submitInquiry: function () {
    if (!this.data.selectedProduct) {
      wx.showToast({ title: '请先选择产品', icon: 'none' });
      return;
    }
    if (!this.data.contactName || !this.data.phone) {
      wx.showToast({ title: '请填写联系人和电话', icon: 'none' });
      return;
    }

    this.setData({ isLoading: true });
    
    const payload = {
        selectedProduct: this.data.selectedProduct,
        contactName: this.data.contactName,
        phone: this.data.phone,
        remark: this.data.remark
    };

    api.post('/inquiry', payload)
      .then(res => {
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => {
            wx.navigateBack();
        }, 1500);
      })
      .catch(err => {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      })
      .finally(() => {
          this.setData({ isLoading: false });
      });
  }
});
