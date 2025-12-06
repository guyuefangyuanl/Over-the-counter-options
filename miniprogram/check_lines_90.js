const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

console.log('第90-100行:');
lines.slice(89, 100).forEach((line, i) => console.log(`${90 + i}: ${line}`));