# 图片优化快速指南

## 🚀 快速开始

### 1. 立即压缩图片（推荐优先执行）

#### 方式一：使用脚本（推荐）

```bash
# 1. 安装依赖
npm install sharp

# 2. 运行压缩脚本
node scripts/compress_images.js

# 3. 查看压缩报告
```

#### 方式二：使用在线工具

访问以下网站上传图片压缩：
- **TinyPNG**: https://tinypng.com/
- **Squoosh**: https://squoosh.app/

重点压缩这两个大文件：
- `images/我的/u6416.png` (447KB → 目标 <100KB)
- `images/我的/u6418.png` (447KB → 目标 <100KB)

### 2. 转换 WebP 格式

```bash
# 运行 WebP 转换脚本
node scripts/convert_to_webp.js
```

### 3. 更新代码配置

已优化 `miniprogram/utils/image-cache.js`，支持：
- ✅ 云存储图片
- ✅ WebP 自动检测
- ✅ 智能缓存
- ✅ 降级处理

### 4. 使用示例

```javascript
// 在页面中使用优化后的图片缓存
const imageCache = require('../../utils/image-cache.js');

Page({
  data: {
    avatarUrl: ''
  },

  onLoad() {
    // 加载头像，自动使用 WebP 或降级
    this.loadAvatar();
  },

  async loadAvatar() {
    const url = '/images/我的/u6416.png';
    const webpUrl = imageCache.getWebPPath(url);

    this.setData({
      avatarUrl: webpUrl
    });
  },

  onImageError(e) {
    // WebP 加载失败时自动降级到原格式
    const src = e.detail.src;
    if (src.endsWith('.webp')) {
      const originalSrc = src.replace('.webp', '.png');
      this.setData({ avatarUrl: originalSrc });
    }
  }
});
```

## 📊 预期效果

| 优化项 | 优化前 | 优化后 | 节省 |
|--------|--------|--------|------|
| 大文件 | 447KB | ~100KB | 78% |
| 总体积 | ~3MB | ~1.5MB | 50% |
| WebP 格式 | - | 比PNG小26% | 26% |
| 加载时间 | 3-5秒 | 1.5-2秒 | 50% |

## ⚡ 紧急优化建议

如果遇到微信小程序大小超限错误（80051），立即执行：

1. **压缩最大的两个文件：**
   ```bash
   # 使用 TinyPNG 手动压缩
   # 上传 images/我的/u6416.png
   # 上传 images/我的/u6418.png
   # 下载压缩后的文件替换原文件
   ```

2. **删除未使用的图片：**
   ```bash
   # 检查以下目录中是否有未使用的图片
   images/我的/
   images/工作台/
   images/询价/
   ```

3. **上传大图到云存储：**
   ```javascript
   // 将大于 100KB 的图片上传到微信云存储
   // 使用 fileUpload.js 工具
   ```

## 📁 工具文件位置

- **压缩脚本**: `scripts/compress_images.js`
- **WebP转换**: `scripts/convert_to_webp.js`
- **图片分析**: `scripts/analyze_image_usage.py`
- **缓存工具**: `miniprogram/utils/image-cache.js`
- **上传工具**: `miniprogram/utils/fileUpload.js`
- **详细报告**: `docs/图片优化报告.md`

## 🆘 常见问题

### Q1: sharp 安装失败？

**解决方案：**
```bash
# 使用淘宝镜像
npm install sharp --registry=https://registry.npm.taobao.org

# 或使用在线工具替代
# https://tinypng.com/
# https://squoosh.app/
```

### Q2: Python 脚本运行失败？

**解决方案：**
使用 Grep 工具手动检查：
```bash
# 搜索图片引用
grep -r "images/" miniprogram/ --include="*.wxml" --include="*.wxss" --include="*.js"
```

### Q3: WebP 图片不显示？

**解决方案：**
已在 `image-cache.js` 中实现自动降级：
```javascript
// 检测 WebP 支持
const supportWebP = imageCache.checkWebPSupport();

// 自动获取合适的格式
const imagePath = imageCache.getWebPPath('/images/test.png');
```

## 📞 需要帮助？

查看详细文档：`docs/图片优化报告.md`