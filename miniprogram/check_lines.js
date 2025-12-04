const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
const lines = content.split('\n');

console.log('总行数:', lines.length);
console.log('第30-40行:');
lines.slice(29, 40).forEach((line, i) => console.log(`${30 + i}: ${line}`));