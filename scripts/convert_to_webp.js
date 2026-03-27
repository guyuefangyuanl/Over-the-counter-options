#!/usr/bin/env node
/**
 * WebP 格式转换工具
 * 将 PNG/JPG 图片转换为 WebP 格式，减小文件体积
 *
 * 安装依赖：npm install sharp chalk
 * 运行脚本：node scripts/convert_to_webp.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 配置
const CONFIG = {
  // 需要转换的图片目录
  imageDirs: [
    'images/我的',
    'images/账户',
    'images/首页',
    'images/询价',
    'images/工作台',
    'images/计算器',
    'images/持仓列表',
    'images/结构_期限',
    'images/个股期权报价'
  ],

  // 转换选项
  webpOptions: {
    quality: 80, // WebP 质量 (0-100)
    lossless: false, // 是否使用无损压缩
    nearLossless: false, // 近无损压缩
    smartSubsample: true, // 智能子采样
    effort: 4 // 压缩努力程度 (0-6, 越大越慢但压缩率越高)
  },

  // 文件大小阈值（KB）- 只转换大于此值的图片
  sizeThreshold: 20,

  // 是否保留原文件
  keepOriginal: true,

  // 输出目录（不设置则在原目录生成.webp文件）
  outputDir: null
};

class WebPConverter {
  constructor(config) {
    this.config = config;
    this.stats = {
      total: 0,
      converted: 0,
      skipped: 0,
      failed: 0,
      totalSaved: 0
    };
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * 转换单个图片为 WebP
   */
  async convertToWebP(inputPath) {
    try {
      const inputSize = fs.statSync(inputPath).size;
      const ext = path.extname(inputPath).toLowerCase();

      // 只处理 PNG 和 JPG
      if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
        this.stats.skipped++;
        return { success: true, skipped: true, reason: '不支持的格式' };
      }

      // 检查文件大小
      if (inputSize < this.config.sizeThreshold * 1024) {
        console.log(`⏭️  跳过小文件: ${inputPath} (${this.formatFileSize(inputSize)})`);
        this.stats.skipped++;
        return { success: true, skipped: true, reason: '文件太小' };
      }

      // 生成 WebP 输出路径
      const outputDir = this.config.outputDir || path.dirname(inputPath);
      const outputFileName = path.basename(inputPath, ext) + '.webp';
      const outputPath = path.join(outputDir, outputFileName);

      // 确保输出目录存在
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 检查是否已存在 WebP 文件
      if (fs.existsSync(outputPath)) {
        const existingSize = fs.statSync(outputPath).size;
        if (existingSize < inputSize * 0.9) {
          console.log(`⏭️  WebP已存在: ${outputPath}`);
          this.stats.skipped++;
          return { success: true, skipped: true, reason: 'WebP已存在' };
        }
      }

      // 转换为 WebP
      await sharp(inputPath)
        .webp(this.config.webpOptions)
        .toFile(outputPath);

      const outputSize = fs.statSync(outputPath).size;
      const saved = inputSize - outputSize;
      const savedPercent = ((saved / inputSize) * 100).toFixed(1);

      if (saved > 0) {
        this.stats.converted++;
        this.stats.totalSaved += saved;

        console.log(`✅ ${inputPath}`);
        console.log(`   ${this.formatFileSize(inputSize)} → ${this.formatFileSize(outputSize)} (节省 ${savedPercent}%)`);

        return { success: true, saved, savedPercent, outputPath };
      } else {
        // WebP 反而更大，删除它
        fs.unlinkSync(outputPath);
        console.log(`⚠️  WebP更大，已删除: ${outputPath}`);
        this.stats.skipped++;
        return { success: true, skipped: true, reason: 'WebP更大' };
      }
    } catch (error) {
      this.stats.failed++;
      console.error(`❌ 转换失败: ${inputPath}`);
      console.error(`   错误: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 转换目录中的所有图片
   */
  async convertDirectory(dirPath) {
    const fullPath = path.resolve(dirPath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  目录不存在: ${dirPath}`);
      return;
    }

    console.log(`\n📁 处理目录: ${dirPath}`);

    const files = this.getAllImageFiles(fullPath);

    for (const file of files) {
      const inputPath = path.join(fullPath, file);
      this.stats.total++;
      await this.convertToWebP(inputPath);
    }
  }

  /**
   * 递归获取目录中所有图片文件
   */
  getAllImageFiles(dir, baseDir = dir) {
    const files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllImageFiles(fullPath, baseDir));
      } else {
        const ext = path.extname(item).toLowerCase();
        if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push(relativePath);
        }
      }
    }

    return files;
  }

  /**
   * 开始转换
   */
  async start() {
    console.log('🚀 开始 WebP 转换任务...\n');
    console.log(`📊 转换配置:`);
    console.log(`   - WebP 质量: ${this.config.webpOptions.quality}`);
    console.log(`   - 大小阈值: ${this.config.sizeThreshold}KB`);
    console.log(`   - 保留原文件: ${this.config.keepOriginal ? '是' : '否'}`);
    console.log('');

    const startTime = Date.now();

    // 处理目录
    for (const dir of this.config.imageDirs) {
      await this.convertDirectory(dir);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 打印统计信息
    console.log('\n' + '='.repeat(60));
    console.log('📊 转换完成统计');
    console.log('='.repeat(60));
    console.log(`总文件数: ${this.stats.total}`);
    console.log(`已转换: ${this.stats.converted}`);
    console.log(`已跳过: ${this.stats.skipped}`);
    console.log(`失败: ${this.stats.failed}`);
    console.log(`节省空间: ${this.formatFileSize(this.stats.totalSaved)}`);
    console.log(`耗时: ${duration}秒`);
    console.log('='.repeat(60));

    return this.stats;
  }
}

/**
 * 生成 WebP 使用示例代码
 */
function generateUsageExample() {
  const code = `
// WebP 图片使用示例
// 在小程序中使用 WebP 格式图片

// 方法 1: 使用 image-cache.js 自动选择格式
const imageCache = require('../../utils/image-cache.js');

Page({
  data: {
    imagePath: ''
  },

  onLoad() {
    // 自动选择 WebP 或原格式
    const webpPath = imageCache.getWebPPath('/images/我的/u6416.png');
    this.setData({ imagePath: webpPath });
  }
});

// 方法 2: 在 WXML 中使用条件渲染
/*
<image
  src="{{supportWebP ? '/images/我的/u6416.webp' : '/images/我的/u6416.png'}}"
  mode="aspectFit"
  binderror="onImageError"
/>
*/

// 方法 3: 图片加载失败时自动降级
/*
Page({
  onImageError(e) {
    const src = e.detail.src;
    if (src.endsWith('.webp')) {
      // WebP 加载失败，回退到原格式
      const originalSrc = src.replace('.webp', '.png');
      this.setData({ imagePath: originalSrc });
    }
  }
});
*/
`;

  return code;
}

// 运行转换器
async function main() {
  try {
    // 检查 sharp 是否安装
    try {
      require.resolve('sharp');
    } catch (e) {
      console.error('❌ 缺少依赖库 sharp');
      console.log('请运行: npm install sharp');
      console.log('\n或者使用在线转换工具:');
      console.log('- https://squoosh.app/');
      console.log('- https://cloudconvert.com/png-to-webp');
      console.log('- https://convertio.co/zh/png-webp/');
      process.exit(1);
    }

    const converter = new WebPConverter(CONFIG);
    await converter.start();

    // 输出使用示例
    console.log('\n📖 WebP 使用示例:');
    console.log(generateUsageExample());

  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = WebPConverter;