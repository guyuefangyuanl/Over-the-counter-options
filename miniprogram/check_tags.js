const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');
let openTags = [];
const lines = content.split('\n');

lines.forEach((line, lineNum) => {
  const tagMatches = line.match(/<\/?[\w-]+/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      if (tag.startsWith('</')) {
        const tagName = tag.substring(2);
        const lastOpen = openTags[openTags.length - 1];
        if (lastOpen && lastOpen.name === tagName) {
          openTags.pop();
        } else {
          console.log(`行 ${lineNum + 1}: 未匹配的结束标签 ${tag}`);
        }
      } else {
        const tagName = tag.substring(1);
        if (!['wxs', 'wx:if', 'wx:for', 'wx:key'].includes(tagName)) {
          openTags.push({ name: tagName, line: lineNum + 1 });
        }
      }
    });
  }
});

if (openTags.length > 0) {
  console.log('未闭合的标签:');
  openTags.forEach(tag => console.log(`${tag.name} 在行 ${tag.line}`));
} else {
  console.log('所有标签匹配正确');
}