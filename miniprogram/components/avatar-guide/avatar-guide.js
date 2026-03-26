/**
 * 微信头像设置引导组件
 * 处理微信废弃getUserInfo后的头像设置引导
 */

Component({
  properties: {
    // 是否显示引导
    show: {
      type: Boolean,
      value: false
    },
    // 当前头像URL
    currentAvatar: {
      type: String,
      value: ''
    },
    // 当前昵称
    currentNickname: {
      type: String,
      value: ''
    },
    // 是否为必须完善资料
    required: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 临时头像
    tempAvatarUrl: '',
    // 临时昵称
    tempNickname: '',
    // 是否选择头像
    isChoosingAvatar: false,
    // 是否编辑昵称
    isEditingNickname: false,
    // 默认头像列表
    defaultAvatars: [
      '/images/default-avatars/avatar-1.png',
      '/images/default-avatars/avatar-2.png',
      '/images/default-avatars/avatar-3.png',
      '/images/default-avatars/avatar-4.png',
      '/images/default-avatars/avatar-5.png',
      '/images/default-avatars/avatar-6.png'
    ],
    // 步骤
    currentStep: 0,  // 0: 选择头像方式, 1: 设置昵称
    // 头像来源
    avatarSource: '',  // 'choose' | 'default' | 'camera'
    // 是否正在上传
    uploading: false
  },

  lifetimes: {
    attached() {
      this.setData({
        tempAvatarUrl: this.properties.currentAvatar,
        tempNickname: this.properties.currentNickname
      });
    }
  },

  observers: {
    'currentAvatar, currentNickname': function(avatar, nickname) {
      this.setData({
        tempAvatarUrl: avatar,
        tempNickname: nickname
      });
    }
  },

  methods: {
    /**
     * 选择头像方式
     */
    onChooseAvatarType(e) {
      const { type } = e.currentTarget.dataset;

      if (type === 'choose') {
        // 从相册选择
        this._chooseImageFromAlbum();
      } else if (type === 'camera') {
        // 拍照
        this._chooseImageFromCamera();
      } else if (type === 'default') {
        // 使用默认头像
        this.setData({
          isChoosingAvatar: true,
          avatarSource: 'default'
        });
      }
    },

    /**
     * 从相册选择图片
     */
    _chooseImageFromAlbum() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        success: (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath;
          this._processSelectedImage(tempFilePath, 'choose');
        },
        fail: (err) => {
          if (!err.errMsg.includes('cancel')) {
            console.error('选择图片失败:', err);
            wx.showToast({ title: '选择图片失败', icon: 'none' });
          }
        }
      });
    },

    /**
     * 拍照获取图片
     */
    _chooseImageFromCamera() {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        success: (res) => {
          const tempFilePath = res.tempFiles[0].tempFilePath;
          this._processSelectedImage(tempFilePath, 'camera');
        },
        fail: (err) => {
          if (!err.errMsg.includes('cancel')) {
            console.error('拍照失败:', err);
            wx.showToast({ title: '拍照失败', icon: 'none' });
          }
        }
      });
    },

    /**
     * 处理选中的图片
     */
    _processSelectedImage(filePath, source) {
      // 裁剪图片为正方形
      wx.cropImage({
        src: filePath,
        cropScale: '1:1',
        success: (res) => {
          this.setData({
            tempAvatarUrl: res.tempFilePath,
            avatarSource: source,
            currentStep: 1
          });
        },
        fail: () => {
          // 不支持裁剪时直接使用原图
          this.setData({
            tempAvatarUrl: filePath,
            avatarSource: source,
            currentStep: 1
          });
        }
      });
    },

    /**
     * 选择默认头像
     */
    onDefaultAvatarTap(e) {
      const { url } = e.currentTarget.dataset;
      this.setData({
        tempAvatarUrl: url,
        avatarSource: 'default',
        currentStep: 1
      });
    },

    /**
     * 输入昵称
     */
    onNicknameInput(e) {
      this.setData({
        tempNickname: e.detail.value
      });
    },

    /**
     * 返回上一步
     */
    onPrevStep() {
      this.setData({
        currentStep: Math.max(0, this.data.currentStep - 1)
      });
    },

    /**
     * 跳过头像设置
     */
    onSkipAvatar() {
      if (this.properties.required) {
        wx.showToast({ title: '请设置头像和昵称', icon: 'none' });
        return;
      }
      this.triggerEvent('skip');
    },

    /**
     * 确认保存
     */
    async onConfirm() {
      const { tempAvatarUrl, tempNickname } = this.data;

      // 验证
      if (!tempAvatarUrl) {
        wx.showToast({ title: '请选择头像', icon: 'none' });
        return;
      }

      if (!tempNickname || tempNickname.trim().length === 0) {
        wx.showToast({ title: '请输入昵称', icon: 'none' });
        return;
      }

      if (tempNickname.length > 20) {
        wx.showToast({ title: '昵称最多20个字符', icon: 'none' });
        return;
      }

      this.setData({ uploading: true });

      try {
        // 上传头像（如果是本地文件）
        let avatarUrl = tempAvatarUrl;
        if (tempAvatarUrl.startsWith('wxfile://') ||
            tempAvatarUrl.startsWith('http://tmp/') ||
            tempAvatarUrl.startsWith('https://tmp/')) {
          avatarUrl = await this._uploadAvatar(tempAvatarUrl);
        }

        // 触发保存事件
        this.triggerEvent('save', {
          avatarUrl,
          nickname: tempNickname.trim()
        });

      } catch (err) {
        console.error('保存失败:', err);
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      } finally {
        this.setData({ uploading: false });
      }
    },

    /**
     * 上传头像到服务器
     */
    _uploadAvatar(filePath) {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: getApp().globalData.apiBase + '/api/user/avatar',
          filePath: filePath,
          name: 'avatar',
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              if (data.success && data.data && data.data.url) {
                resolve(data.data.url);
              } else {
                reject(new Error(data.message || '上传失败'));
              }
            } catch (e) {
              reject(e);
            }
          },
          fail: reject
        });
      });
    },

    /**
     * 关闭弹窗
     */
    onClose() {
      if (this.properties.required) {
        wx.showToast({ title: '请先完善资料', icon: 'none' });
        return;
      }
      this.triggerEvent('close');
    },

    /**
     * 阻止冒泡
     */
    stopPropagation() {}
  }
});