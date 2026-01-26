// 测试询价提交到云数据库
const fs = require('fs');

console.log('🔍 检查询价提交功能...');

// 1. 检查小程序文件是否存在
const inquiryFilePath = 'miniprogram/pages/inquiry/inquiry.js';
if (fs.existsSync(inquiryFilePath)) {
  const content = fs.readFileSync(inquiryFilePath, 'utf8');
  
  // 检查关键部分
  const hasCloudDatabaseImport = content.includes('wx.cloud.database()');
  const hasInquiriesCollection = content.includes("db.collection('inquiries')");
  const hasAddMethod = content.includes('.add({');
  const hasUserDataHandling = content.includes('userInfo') || content.includes('openid');
  
  console.log('✅ 小程序询价页面存在');
  console.log(`✅ 云数据库初始化: ${hasCloudDatabaseImport ? '✓' : '✗'}`);
  console.log(`✅ inquiries集合操作: ${hasInquiriesCollection ? '✓' : '✗'}`);
  console.log(`✅ 数据添加方法: ${hasAddMethod ? '✓' : '✗'}`);
  console.log(`✅ 用户信息处理: ${hasUserDataHandling ? '✓' : '✗'}`);
  
  // 检查提交数据结构
  const hasContactInfo = content.includes('contactName') && content.includes('contactPhone');
  const hasProductInfo = content.includes('productName') && content.includes('productCode');
  const hasInquiryParams = content.includes('optionType') || content.includes('structure');
  const hasSourceField = content.includes("'miniprogram'") || content.includes('source');
  
  console.log('\n📋 数据字段检查:');
  console.log(`✅ 联系信息: ${hasContactInfo ? '✓' : '✗'}`);
  console.log(`✅ 产品信息: ${hasProductInfo ? '✓' : '✗'}`);
  console.log(`✅ 询价参数: ${hasInquiryParams ? '✓' : '✗'}`);
  console.log(`✅ 数据源标识: ${hasSourceField ? '✓' : '✗'}`);
  
  // 检查错误处理
  const hasErrorHandling = content.includes('.catch(') && content.includes('console.error');
  const hasSuccessToast = content.includes('wx.showToast') && content.includes('提交成功');
  console.log(`✅ 错误处理: ${hasErrorHandling ? '✓' : '✗'}`);
  console.log(`✅ 成功提示: ${hasSuccessToast ? '✓' : '✗'}`);
  
} else {
  console.log('❌ 小程序询价页面不存在');
}

// 2. 检查云函数
const loginFunctionPath = 'cloudfunctions/login/index.js';
if (fs.existsSync(loginFunctionPath)) {
  const content = fs.readFileSync(loginFunctionPath, 'utf8');
  const hasUserCreation = content.includes('usersCollection.add') || content.includes('db.collection(\'users\')');
  console.log('\n🔐 云函数登录检查:');
  console.log(`✅ 用户创建: ${hasUserCreation ? '✓' : '✗'}`);
} else {
  console.log('\n❌ 云函数登录文件不存在');
}

// 3. 检查API路由
const inquiryRoutePath = 'routes/inquiry.py';
if (fs.existsSync(inquiryRoutePath)) {
  const content = fs.readFileSync(inquiryRoutePath, 'utf8');
  const hasAdminRoute = content.includes('/admin/inquiries');
  const hasCloudDbSupport = content.includes('cloud_db') && content.includes('inquiries');
  console.log('\n📊 后台API检查:');
  console.log(`✅ 管理后台路由: ${hasAdminRoute ? '✓' : '✗'}`);
  console.log(`✅ 云数据库支持: ${hasCloudDbSupport ? '✓' : '✗'}`);
} else {
  console.log('\n❌ 后台API文件不存在');
}

console.log('\n💡 建议的测试步骤:');
console.log('1. 在微信开发者工具中打开小程序');
console.log('2. 确保云环境已正确配置 (develop-8gx7kh9g045e6c9a)');
console.log('3. 尝试提交一个测试询价');
console.log('4. 检查控制台是否有错误信息');
console.log('5. 在云控制台查看 inquiries 集合');
console.log('6. 检查后台管理系统是否能显示数据');

console.log('\n🔧 常见问题排查:');
console.log('- 确保微信开发者工具已登录');
console.log('- 确保已开通云开发功能');
console.log('- 确保环境ID正确配置');
console.log('- 检查云函数是否已部署');
console.log('- 确保小程序域名校验通过');

console.log('\n📝 修改总结:');
console.log('- 已修复 openNewGroupDialog() 语法错误');
console.log('- 已增强用户信息获取逻辑，支持未登录用户');
console.log('- 已添加完整的用户信息字段');
console.log('- 已确保数据结构与后台API兼容');
console.log('- 已添加联系信息备份字段');