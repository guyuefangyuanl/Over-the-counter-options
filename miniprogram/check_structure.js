const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

// 检查整个文件的结构
console.log('检查文件结构...');

// 检查主要容器标签
const containerStart = content.indexOf('<view class="container">');
const containerEnd = content.lastIndexOf('</view>');

console.log(`container开始位置: ${containerStart}`);
console.log(`container结束位置: ${containerEnd}`);
console.log(`文件总长度: ${content.length}`);

// 检查是否有未闭合的标签
let viewCount = 0;
let vanPopupCount = 0;

lines.forEach((line, i) => {
  const startViews = line.match(/<view[^>]*>/g);
  const endViews = line.match(/<\/view>/g);
  const startPopups = line.match(/<van-popup[^>]*>/g);
  const endPopups = line.match(/<\/van-popup>/g);
  
  if (startViews) viewCount += startViews.length;
  if (endViews) viewCount -= endViews.length;
  
  if (startPopups) vanPopupCount += startPopups.length;
  if (endPopups) vanPopupCount -= endPopups.length;
  
  if (i >= 220 && i <= 230) {
    console.log(`行 ${i + 1}: view平衡=${viewCount}, van-popup平衡=${vanPopupCount}`);
    console.log(`内容: ${line}`);
  }
});