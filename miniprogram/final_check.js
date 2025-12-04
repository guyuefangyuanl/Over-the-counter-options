const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
let stack = [];
const lines = content.split('\n');

lines.forEach((line, i) => {
  const startTags = line.match(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g);
  const endTags = line.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)>/g);
  
  if (startTags) {
    startTags.forEach(tag => {
      if (!tag.endsWith('/>')) {
        const tagName = tag.match(/<([a-zA-Z][a-zA-Z0-9-]*)/)[1];
        if (!['wxs', 'wx:if', 'wx:for', 'wx:key'].includes(tagName)) {
          stack.push({ name: tagName, line: i + 1 });
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
      }
    });
  }
});

if (stack.length > 0) {
  console.log('未闭合的标签:');
  stack.forEach(tag => console.log(`${tag.name} 在行 ${tag.line}`));
} else {
  console.log('所有标签匹配正确');
}