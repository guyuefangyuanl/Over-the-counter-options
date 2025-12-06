const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');

// 简单的标签匹配检查
let stack = [];
let lineNum = 1;
const lines = content.split('\n');

lines.forEach(line => {
  // 查找开始标签
  const startTags = line.match(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g);
  // 查找结束标签
  const endTags = line.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)>/g);
  
  if (startTags) {
    startTags.forEach(tag => {
      // 跳过自闭合标签
      if (!tag.endsWith('/>')) {
        const tagName = tag.match(/<([a-zA-Z][a-zA-Z0-9-]*)/)[1];
        if (!['wxs', 'wx:if', 'wx:for', 'wx:key'].includes(tagName)) {
          stack.push({ name: tagName, line: lineNum });
        }
      }
    });
  }
  
  if (endTags) {
    endTags.forEach(tag => {
      const tagName = tag.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)>/)[1];
      const lastOpen = stack[stack.length - 1];
      if (lastOpen && lastOpen.name === tagName) {
        stack.pop();
      } else {
        console.log(`行 ${lineNum}: 未匹配的结束标签 ${tag}`);
      }
    });
  }
  
  lineNum++;
});

if (stack.length > 0) {
  console.log('未闭合的标签:');
  stack.forEach(tag => console.log(`${tag.name} 在行 ${tag.line}`));
} else {
  console.log('所有标签匹配正确');
}