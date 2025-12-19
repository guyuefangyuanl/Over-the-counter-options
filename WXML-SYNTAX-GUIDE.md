# 微信小程序WXML模板语法注意事项

## ❌ 不支持的JavaScript表达式

### 1. 数学方法
```xml
<!-- 错误写法 -->
{{(item * 10).toFixed(1)}}
{{Math.max(...array)}}
{{Math.ceil(value)}}

<!-- 正确写法：在JS中预处理 -->
{{item.formattedValue}}
{{maxValue}}
{{ceilValue}}
```

### 2. 数组方法
```xml
<!-- 错误写法 -->
{{array.map(item => item.value)}}
{{array.reduce((sum, item) => sum + item, 0)}}
{{array.filter(item => item.active)}}

<!-- 正确写法：在JS中预处理 -->
{{processedArray}}
{{sumValue}}
{{filteredArray}}
```

### 3. 复杂条件运算
```xml
<!-- 错误写法 -->
{{index % Math.ceil(length / 6) === 0}}
{{item.value / maxValue * 100}}

<!-- 正确写法：在JS中预处理 -->
{{item.shouldShow}}
{{item.percentage}}
```

## ✅ 支持的表达式

### 1. 简单的三元运算符
```xml
{{condition ? 'true' : 'false'}}
{{value > 0 ? 'positive' : 'negative'}}
```

### 2. 基本的算术运算
```xml
{{value + 1}}
{{price * quantity}}
```

### 3. 字符串拼接
```xml
{{prefix + value + suffix}}
```

### 4. 属性访问
```xml
{{object.property}}
{{array[index]}}
```

## 🛠️ 最佳实践

### 1. 数据预处理
在Page的JS文件中预处理复杂的计算：

```javascript
// 在JS中处理
data: {
  chartData: [],
  yAxisLabels: [],
  chartStats: {
    max: '0.000',
    min: '0.000', 
    avg: '0.000'
  }
},

updateChartStats: function(data) {
  const values = data.map(item => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
  
  this.setData({
    chartStats: {
      max: max.toFixed(3),
      min: min.toFixed(3),
      avg: avg.toFixed(3)
    }
  });
}
```

### 2. 位置计算预处理
```javascript
// 错误：在WXML中计算
style="left: {{index / length * 100}}%; bottom: {{value / max * 100}}%"

// 正确：在JS中预计算
generateChartData: function() {
  return data.map((item, index) => ({
    ...item,
    leftPercent: (index / data.length * 100).toFixed(2) + '%',
    bottomPercent: (item.value / maxValue * 100).toFixed(2) + '%'
  }));
}
```

### 3. 条件显示预处理
```javascript
// 错误：复杂条件判断
wx:if="{{index % Math.ceil(array.length / 6) === 0}}"

// 正确：预处理显示状态
processXAxisLabels: function(data) {
  return data.map((item, index) => ({
    ...item,
    shouldShow: index % Math.ceil(data.length / 6) === 0
  }));
}
```

## 🔧 调试技巧

1. **分步验证**：逐步简化复杂表达式，找出不支持的部分
2. **控制台输出**：在JS中console.log预处理的数据
3. **数据绑定检查**：确保setData中的数据结构正确
4. **模板语法检查器**：注意小程序开发工具的错误提示

## 📝 常见错误类型

1. `unexpected token '.'` - 通常是使用了`.toFixed()`等方法
2. `unexpected token '('` - 通常是调用了函数
3. `unexpected identifier` - 通常是使用了不支持的语法

记住：**WXML模板应该只负责展示，所有的数据处理都应该在JS中完成！**