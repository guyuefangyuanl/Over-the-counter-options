const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

// 显示第86-100行的详细内容
console.log('第86-100行:');
lines.slice(85, 100).forEach((line, i) => {
  console.log(`${86 + i}: ${line}`);
});