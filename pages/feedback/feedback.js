// 意见反馈页面
Page({
  data: {
    feedbackText: '',
    contactInfo: '',
    feedbackType: 'suggestion',
    typeOptions: [
      { value: 'suggestion', label: '功能建议' },
      { value: 'bug', label: 'Bug反馈' },
      { value: 'improvement', label: '改进意见' },
      { value: 'other', label: '其他' }
    ],
    submitting: false,
    wordCount: 0,
    maxWords: 500
  },

  onLoad: function (options) {
    console.log('意见反馈页面加载');
  },

  // 反馈类型选择
  onTypeChange: function(e) {
    const index = e.detail.value;
    this.setData({
      feedbackType: this.data.typeOptions[index].value
    });
  },

  // 反馈内容输入
  onFeedbackInput: function(e) {
    const value = e.detail.value;
    const wordCount = value.length;
    
    this.setData({
      feedbackText: value,
      wordCount: wordCount
    });
  },

  // 联系方式输入
  onContactInput: function(e) {
    this.setData({
      contactInfo: e.detail.value
    });
  },

  // 提交反馈
  submitFeedback: function() {
    const { feedbackText, contactInfo, feedbackType } = this.data;
    
    // 输入验证
    if (!feedbackText.trim()) {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none'
      });
      return;
    }

    if (feedbackText.length < 10) {
      wx.showToast({
        title: '反馈内容至少10个字符',
        icon: 'none'
      });
      return;
    }

    if (feedbackText.length > this.data.maxWords) {
      wx.showToast({
        title: `反馈内容不能超过${this.data.maxWords}个字符`,
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    // 模拟提交过程
    setTimeout(() => {
      wx.showModal({
        title: '提交成功',
        content: '感谢您的宝贵意见，我们会认真考虑并持续改进产品！',
        showCancel: false,
        success: () => {
          // 清空表单
          this.setData({
            feedbackText: '',
            contactInfo: '',
            feedbackType: 'suggestion',
            wordCount: 0,
            submitting: false
          });
          
          // 返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 500);
        }
      });
    }, 2000);
  },

  // 取消操作
  cancel: function() {
    if (this.data.feedbackText.trim() || this.data.contactInfo.trim()) {
      wx.showModal({
        title: '确认取消',
        content: '当前输入的内容将丢失，确定要取消吗？',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        }
      });
    } else {
      wx.navigateBack();
    }
  },

  // 获取类型文本
  getTypeLabel: function(value) {
    const option = this.data.typeOptions.find(item => item.value === value);
    return option ? option.label : '功能建议';
  }
});