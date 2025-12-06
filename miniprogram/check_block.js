const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

// 查找第96行附近的block标签
console.log('第93-100行:');
lines.slice(92, 100).forEach((line, i) => console.log(`${93 + i}: ${line}`));

// 检查block标签匹配
let blockCount = 0;
lines.forEach((line, i) => {
  const startBlocks = line.match(/<block/g);
  const endBlocks = line.match(/<\/block/g);
  
  if (startBlocks) blockCount += startBlocks.length;
  if (endBlocks) blockCount -= endBlocks.length;
  
  if (i >= 90 && i <= 100) {
    console.log(`行 ${i + 1}: block平衡 = ${blockCount}`);
  }
});