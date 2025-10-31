/**
 * 创建默认图片的脚本
 * 生成小程序需要的基础图片资源
 */

const fs = require('fs');
const path = require('path');

// 创建images目录
const imagesDir = path.join(__dirname, '../../images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// 默认图片的base64数据（1x1像素透明PNG）
const defaultImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA6dp+nwAAAABJRU5ErkJggg==';

// 需要创建的图片列表
const imageList = [
  // 系统图标
  'signal1.png',
  'signal2.png', 
  'battery.png',
  'back.png',
  'dropdown-down.png',
  'info.png',
  'arrow-right.png',
  'home.png',
  'inquiry.png',
  'account-active.png',
  'profile.png',
  'default-avatar.png',
  
  // 错误中提到的缺失图片
  'avatar-default.png',
  'refresh.png',
  'quote.png',
  'calculator.png',
  'position.png',
  'analysis.png',
  'news.png',
  'warning.png'
];

// 创建图片文件
imageList.forEach(filename => {
  const filePath = path.join(imagesDir, filename);
  const imageBuffer = Buffer.from(defaultImageBase64, 'base64');
  
  try {
    fs.writeFileSync(filePath, imageBuffer);
    console.log(`✅ 创建图片: ${filename}`);
  } catch (error) {
    console.error(`❌ 创建图片失败 ${filename}:`, error.message);
  }
});

console.log('\n🎉 默认图片创建完成！');
console.log('📍 图片目录:', imagesDir);
console.log('💡 提示: 你可以将这些默认图片替换为实际的图标文件');