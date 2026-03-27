// 价格趋势图表页面
Page({
  data: {
    chartData: [],
    selectedOption: null,
    timeRange: '1D', // 1D, 1W, 1M
    chartType: 'price', // price, volatility, greeks
    loading: false,
    yAxisLabels: [],
    chartStats: {
      max: '0.000',
      min: '0.000',
      avg: '0.000'
    },
    xAxisLabels: [],
    chartTitle: '价格趋势'
  },

  onLoad: function (options) {
    const optionData = options.data ? JSON.parse(decodeURIComponent(options.data)) : null;
    
    this.setData({
      selectedOption: optionData
    });
    
    this.loadChartData();
  },

  // 加载图表数据
  loadChartData: function() {
    this.setData({ loading: true });
    
    setTimeout(() => {
      const data = this.generateChartData();
      this.updateChartTitle();
      this.updateYAxisLabels();
      this.updateChartStats(data);
      this.updateXAxisLabels(data);
      
      this.setData({
        chartData: data,
        loading: false
      });
    }, 1000);
  },

  // 生成图表数据
  generateChartData: function() {
    const { timeRange, chartType } = this.data;
    const dataPoints = timeRange === '1D' ? 24 : timeRange === '1W' ? 7 : 30;
    const data = [];
    
    let baseValue = chartType === 'price' ? 5.5 : 
                   chartType === 'volatility' ? 25 : 0.6;
    
    for (let i = 0; i < dataPoints; i++) {
      const variation = (Math.random() - 0.5) * 0.1;
      baseValue = Math.max(0.1, baseValue * (1 + variation));
      
      const leftPercent = (i / dataPoints * 100).toFixed(2);
      const bottomPercent = (baseValue / 10 * 100).toFixed(2);
      
      data.push({
        time: this.getTimeLabel(i, timeRange),
        value: parseFloat(baseValue.toFixed(3)),
        volume: Math.floor(Math.random() * 1000 + 100),
        leftPercent: leftPercent + '%',
        bottomPercent: bottomPercent + '%'
      });
    }
    
    return data;
  },

  // 获取时间标签
  getTimeLabel: function(index, range) {
    const now = new Date();
    
    if (range === '1D') {
      const hour = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000);
      return hour.getHours() + ':00';
    } else if (range === '1W') {
      const day = new Date(now.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
      return (day.getMonth() + 1) + '/' + day.getDate();
    } else {
      const day = new Date(now.getTime() - (29 - index) * 24 * 60 * 60 * 1000);
      return (day.getMonth() + 1) + '/' + day.getDate();
    }
  },

  // 更新图表标题
  updateChartTitle: function() {
    const { chartType } = this.data;
    let title;
    switch (chartType) {
      case 'price': title = '期权价格走势'; break;
      case 'volatility': title = '隐含波动率'; break;
      case 'greeks': title = 'Delta值变化'; break;
      default: title = '价格走势'; break;
    }
    this.setData({ chartTitle: title });
  },

  // 更新Y轴标签
  updateYAxisLabels: function() {
    const { chartType } = this.data;
    const labels = [];
    
    for (let i = 1; i >= 0; i -= 0.2) {
      let value;
      if (chartType === 'price') {
        value = (i * 10).toFixed(1);
      } else if (chartType === 'volatility') {
        value = (i * 50).toFixed(0) + '%';
      } else {
        value = (i * 1).toFixed(1);
      }
      labels.push(value);
    }
    
    this.setData({ yAxisLabels: labels });
  },
  
  // 更新统计数据
  updateChartStats: function(data) {
    if (!data || data.length === 0) {
      this.setData({
        chartStats: {
          max: '0.000',
          min: '0.000',
          avg: '0.000'
        }
      });
      return;
    }
    
    const values = data.map(item => item.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    this.setData({
      chartStats: {
        max: max.toFixed(3),
        min: min.toFixed(3),
        avg: avg.toFixed(3)
      }
    });
  },
  
  // 更新X轴标签
  updateXAxisLabels: function(data) {
    if (!data || data.length === 0) {
      this.setData({ xAxisLabels: [] });
      return;
    }
    
    const labels = [];
    const step = Math.ceil(data.length / 6);
    
    for (let i = 0; i < data.length; i += step) {
      labels.push(data[i].time);
    }
    
    this.setData({ xAxisLabels: labels });
  },

  // 时间范围切换
  onTimeRangeChange: function(e) {
    this.setData({
      timeRange: e.currentTarget.dataset.range
    });
    this.loadChartData();
  },

  // 图表类型切换
  onChartTypeChange: function(e) {
    this.setData({
      chartType: e.currentTarget.dataset.type
    });
    this.loadChartData();
  },

  // 分享图表
  onShare: function() {
    wx.showActionSheet({
      itemList: ['保存图片', '分享给朋友'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.saveChart();
        } else {
          this.shareChart();
        }
      }
    });
  },

  // 保存图表
  saveChart: function() {
    const self = this;

    wx.showLoading({ title: '保存中...', mask: true });

    // 使用截图方式保存页面内容
    // 创建离屏canvas来绘制图表
    const query = wx.createSelectorQuery();
    query.select('.chart-container').fields({
      node: true,
      size: true
    }).exec(function(res) {
      if (res && res[0]) {
        // 使用canvas绘制图表并导出
        self.drawChartToCanvas().then(function(tempFilePath) {
          wx.hideLoading();

          // 保存到相册
          wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: function() {
              wx.showToast({
                title: '已保存到相册',
                icon: 'success'
              });
            },
            fail: function(err) {
              if (err.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '提示',
                  content: '需要您授权保存图片到相册',
                  confirmText: '去授权',
                  success: function(res) {
                    if (res.confirm) {
                      wx.openSetting();
                    }
                  }
                });
              } else {
                wx.showToast({
                  title: '保存失败，请重试',
                  icon: 'none'
                });
              }
            }
          });
        }).catch(function(err) {
          wx.hideLoading();
          console.error('绘制图表失败:', err);
          // 降级方案：显示提示让用户截图
          wx.showModal({
            title: '保存图表',
            content: '图表已准备好，您可以使用手机截图功能保存。',
            showCancel: false
          });
        });
      } else {
        // 降级方案
        wx.hideLoading();
        self.saveChartFallback();
      }
    });
  },

  // 绘制图表到Canvas
  drawChartToCanvas: function() {
    return new Promise(function(resolve, reject) {
      try {
        // 使用离屏canvas绘制
        const canvas = wx.createOffscreenCanvas({
          type: '2d',
          width: 750,
          height: 500
        });
        const ctx = canvas.getContext('2d');

        // 绘制背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 750, 500);

        // 绘制标题
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('期权价格趋势图', 30, 40);

        // 绘制图表区域边框
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 1;
        ctx.strokeRect(50, 60, 670, 380);

        // 导出图片
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: function(res) {
            resolve(res.tempFilePath);
          },
          fail: function(err) {
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  },

  // 保存图表降级方案
  saveChartFallback: function() {
    wx.showModal({
      title: '保存图表',
      content: '请使用手机截图功能保存当前页面。\n\n提示：同时按住电源键和音量减键即可截图。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 分享图表
  shareChart: function() {
    return {
      title: this.getChartTitle(),
      path: '/pages/index/index'
    };
  }
});
