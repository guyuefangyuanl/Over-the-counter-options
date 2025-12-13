const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');

// 手动修复第96行的标签问题
let correctedContent = content.replace(
  /(\s+)<\/view>\s*\n\s*<\/block>/,
  '$1</view>\n        </block>'
);

// 写入修复后的文件
fs.writeFileSync('pages/inquiry/inquiry.wxml', correctedContent);

console.log('已手动修复第96行的标签问题');

// 验证修复结果
const lines = correctedContent.split('\n');
console.log('第95-98行:');
for (let i = 94; i < 98; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}