#!/usr/bin/env node
/**
 * 图片批量压缩工具
 * 使用 sharp 库进行图片压缩
 *
 * 安装依赖：npm install sharp chalk ora
 * 运行脚本：node scripts/compress_images.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 配置
const CONFIG = {
  // 需要压缩的图片目录
  imageDirs: [
    'images/icons',
    'images/个股期权报价',
    'images/工作台',
    'images/我的',
    'images/持仓列表',
    'images/结构_期限',
    'images/计算器',
    'images/询价',
    'images/账户',
    'images/首页'
  ],

  // 单独处理的图片文件
  singleFiles: [
    'images/avatar-default.png',
    'images/default-avatar.png',
    'images/logo.png',
    'images/profile.png',
    'images/wechat-icon.png',
    'images/qq-icon.png',
    'images/phone-icon.png',
    'images/guest-icon.png',
    'images/help.png',
    'images/info.png',
    'images/warning.png',
    'images/refresh.png',
    'images/arrow-right.png',
    'images/back.png',
    'images/quote.png',
    'images/calculator.png',
    'images/inquiry.png',
    'images/analysis.png',
    'images/news.png',
    'images/position.png'
  ],

  // 压缩选项
  compressionOptions: {
    png: {
      quality: 80,
      compressionLevel: 9,
      adaptiveFiltering: true
    },
    jpg: {
      quality: 80,
      progressive: true
    },
    webp: {
      quality: 80
    }
  },

  // 大小阈值（KB）- 只压缩大于此值的图片
  sizeThreshold: 10,

  // 是否生成WebP格式
  generateWebP: true,

  // 输出目录（不设置则覆盖原文件）
  outputDir: null // 例如: 'images_compressed'
};

class ImageCompressor {
  constructor(config) {
    this.config = config;
    this.stats = {
      total: 0,
      compressed: 0,
      skipped: 0,
      failed: 0,
      totalSaved: 0
    };
  }

  /**
   * 获取文件大小（KB）
   */
  getFileSizeKB(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size / 1024;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取文件大小（人类可读格式）
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * 压缩单个图片
   */
  async compressImage(inputPath, outputPath) {
    try {
      const inputSize = fs.statSync(inputPath).size;
      const ext = path.extname(inputPath).toLowerCase();

      // 检查文件大小
      if (inputSize < this.config.sizeThreshold * 1024) {
        console.log(`⏭️  跳过小文件: ${inputPath} (${this.formatFileSize(inputSize)})`);
        this.stats.skipped++;
        return { success: true, skipped: true };
      }

      let image = sharp(inputPath);
      const metadata = await image.metadata();

      // 根据格式应用不同的压缩选项
      if (ext === '.png') {
        image = image.png(this.config.compressionOptions.png);
      } else if (ext === '.jpg' || ext === '.jpeg') {
        image = image.jpeg(this.config.compressionOptions.jpg);
      } else if (ext === '.webp') {
        image = image.webp(this.config.compressionOptions.webp);
      } else if (ext === '.svg') {
        // SVG 文件不压缩
        console.log(`⏭️  跳过 SVG: ${inputPath}`);
        this.stats.skipped++;
        return { success: true, skipped: true };
      } else {
        console.log(`⏭️  跳过不支持的格式: ${inputPath}`);
        this.stats.skipped++;
        return { success: true, skipped: true };
      }

      // 确保输出目录存在
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 保存压缩后的图片
      await image.toFile(outputPath);

      const outputSize = fs.statSync(outputPath).size;
      const saved = inputSize - outputSize;
      const savedPercent = ((saved / inputSize) * 100).toFixed(1);

      this.stats.compressed++;
      this.stats.totalSaved += saved;

      console.log(`✅ ${inputPath}`);
      console.log(`   ${this.formatFileSize(inputSize)} → ${this.formatFileSize(outputSize)} (节省 ${savedPercent}%)`);

      // 生成 WebP 格式
      if (this.config.generateWebP && (ext === '.png' || ext === '.jpg' || ext === '.jpeg')) {
        const webpPath = outputPath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        await sharp(inputPath)
          .webp({ quality: this.config.compressionOptions.webp.quality })
          .toFile(webpPath);

        const webpSize = fs.statSync(webpPath).size;
        const webpSaved = inputSize - webpSize;
        const webpSavedPercent = ((webpSaved / inputSize) * 100).toFixed(1);

        console.log(`   📦 WebP: ${this.formatFileSize(webpSize)} (节省 ${webpSavedPercent}%)`);
      }

      return { success: true, saved, savedPercent };
    } catch (error) {
      this.stats.failed++;
      console.error(`❌ 压缩失败: ${inputPath}`);
      console.error(`   错误: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 压缩目录中的所有图片
   */
  async compressDirectory(dirPath) {
    const fullPath = path.resolve(dirPath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  目录不存在: ${dirPath}`);
      return;
    }

    console.log(`\n📁 处理目录: ${dirPath}`);

    const files = this.getAllImageFiles(fullPath);

    for (const file of files) {
      const inputPath = path.join(fullPath, file);
      const outputPath = this.config.outputDir
        ? path.join(this.config.outputDir, dirPath, file)
        : inputPath;

      this.stats.total++;
      await this.compressImage(inputPath, outputPath);
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
        if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push(relativePath);
        }
      }
    }

    return files;
  }

  /**
   * 开始压缩
   */
  async start() {
    console.log('🚀 开始图片压缩任务...\n');
    console.log(`📊 压缩配置:`);
    console.log(`   - PNG 质量: ${this.config.compressionOptions.png.quality}`);
    console.log(`   - JPG 质量: ${this.config.compressionOptions.jpg.quality}`);
    console.log(`   - 大小阈值: ${this.config.sizeThreshold}KB`);
    console.log(`   - 生成WebP: ${this.config.generateWebP ? '是' : '否'}`);
    console.log('');

    const startTime = Date.now();

    // 处理目录
    for (const dir of this.config.imageDirs) {
      await this.compressDirectory(dir);
    }

    // 处理单独文件
    if (this.config.singleFiles.length > 0) {
      console.log('\n📄 处理单独文件...');
      for (const file of this.config.singleFiles) {
        const inputPath = path.resolve(file);
        if (fs.existsSync(inputPath)) {
          const outputPath = this.config.outputDir
            ? path.join(this.config.outputDir, file)
            : inputPath;

          this.stats.total++;
          await this.compressImage(inputPath, outputPath);
        }
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // 打印统计信息
    console.log('\n' + '='.repeat(60));
    console.log('📊 压缩完成统计');
    console.log('='.repeat(60));
    console.log(`总文件数: ${this.stats.total}`);
    console.log(`已压缩: ${this.stats.compressed}`);
    console.log(`已跳过: ${this.stats.skipped}`);
    console.log(`失败: ${this.stats.failed}`);
    console.log(`节省空间: ${this.formatFileSize(this.stats.totalSaved)}`);
    console.log(`耗时: ${duration}秒`);
    console.log('='.repeat(60));

    return this.stats;
  }
}

// 运行压缩器
async function main() {
  try {
    // 检查 sharp 是否安装
    try {
      require.resolve('sharp');
    } catch (e) {
      console.error('❌ 缺少依赖库 sharp');
      console.log('请运行: npm install sharp');
      console.log('\n或者使用在线压缩工具:');
      console.log('- https://tinypng.com/');
      console.log('- https://squoosh.app/');
      console.log('- https://imageoptim.com/online');
      process.exit(1);
    }

    const compressor = new ImageCompressor(CONFIG);
    await compressor.start();

  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = ImageCompressor;