const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

// 查找block标签的开始和结束
let blockStartLine = 0;
let blockEndLine = 0;

lines.forEach((line, i) => {
  if (line.includes('<block wx:for="{{customGroups}}"')) {
    blockStartLine = i + 1;
  }
  if (line.includes('</block>')) {
    blockEndLine = i + 1;
  }
});

console.log(`block开始行: ${blockStartLine}`);
console.log(`block结束行: ${blockEndLine}`);

// 显示block标签周围的代码
if (blockStartLine > 0) {
  console.log('\nblock标签周围代码:');
  for (let i = Math.max(0, blockStartLine - 3); i < Math.min(lines.length, blockEndLine + 3); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}