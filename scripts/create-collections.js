/**
 * 创建云数据库集合脚本
 * 运行方式: node scripts/create-collections.js
 */

// 需要创建的集合列表
const REQUIRED_COLLECTIONS = [
  'users',
  'admin_users',
  'inquiries',
  'quotes',
  'options',
  'positions',  // 持仓集合 - 必需
  'orders',
  'groups',
  'settings',
  'messages',
  '_schema_versions'
]

console.log('============================================')
console.log('云数据库集合创建指南')
console.log('============================================')
console.log('')
console.log('请按以下步骤在微信开发者工具中创建集合:')
console.log('')
console.log('1. 打开微信开发者工具')
console.log('2. 点击工具栏中的 "云开发" 按钮')
console.log('3. 在左侧菜单选择 "数据库"')
console.log('4. 点击 "添加集合" 按钮')
console.log('5. 依次创建以下集合:')
console.log('')
REQUIRED_COLLECTIONS.forEach((name, index) => {
  const required = name === 'positions' ? ' [必需]' : ''
  console.log(`   ${index + 1}. ${name}${required}`)
})
console.log('')
console.log('============================================')
console.log('positions 集合字段说明:')
console.log('============================================')
console.log('')
console.log('字段名          | 类型     | 说明')
console.log('---------------|---------|------------------')
console.log('_id            | string  | 持仓ID')
console.log('customerId     | string  | 客户ID')
console.log('productCode    | string  | 产品代码')
console.log('productName    | string  | 产品名称')
console.log('quantity       | number  | 持仓数量')
console.log('price          | number  | 开仓价格')
console.log('status         | string  | 状态: active/closed')
console.log('direction      | string  | 方向: long/short')
console.log('openDate       | string  | 开仓日期')
console.log('expiryDate     | string  | 到期日期')
console.log('marketValue    | number  | 市值')
console.log('profitLoss     | number  | 盈亏')
console.log('createdAt      | string  | 创建时间')
console.log('updatedAt      | string  | 更新时间')
console.log('')
console.log('============================================')