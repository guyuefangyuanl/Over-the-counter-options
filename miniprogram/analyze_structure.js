const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');

// 更仔细地分析第86-97行的结构
const lines = content.split('\n');

console.log('第86-97行的详细分析:');
for (let i = 85; i < 97; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

// 检查block标签的匹配
let blockLevel = 0;
let viewLevel = 0;

lines.forEach((line, i) => {
  if (line.includes('<block') && !line.includes('</block>')) {
    blockLevel++;
  }
  if (line.includes('</block>')) {
    blockLevel--;
  }
  if (line.includes('<view') && !line.includes('</view>')) {
    viewLevel++;
  }
  if (line.includes('</view>')) {
    viewLevel--;
  }
  
  if (i >= 85 && i <= 100) {
    console.log(`行 ${i + 1}: block=${blockLevel}, view=${viewLevel}`);
  }
});