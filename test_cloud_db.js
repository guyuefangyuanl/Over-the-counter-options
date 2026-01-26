// 云数据库连接测试脚本
const cloud = require('wx-server-sdk');

try {
  // 初始化云开发环境
  cloud.init({
    env: 'develop-8gx7kh9g045e6c9a'
  });
  
  const db = cloud.database();
  
  console.log('✅ 云数据库连接初始化成功');
  console.log('云环境ID: develop-8gx7kh9g045e6c9a');
  
  // 测试数据写入
  const testData = {
    productName: '测试产品',
    productCode: 'TEST001',
    contactName: '测试用户',
    phone: '13800138000',
    contactEmail: 'test@example.com',
    status: 'pending',
    source: 'test-script',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  };
  
  console.log('\n🧪 开始测试数据写入...');
  
  // 尝试写入测试数据
  db.collection('inquiries').add({
    data: testData
  }).then(res => {
    console.log('✅ 测试数据写入成功!');
    console.log('文档ID:', res._id);
    
    // 验证数据是否可读
    db.collection('inquiries').where({
      _id: res._id
    }).get().then(readRes => {
      if (readRes.data && readRes.data.length > 0) {
        console.log('✅ 数据读取验证成功!');
        console.log('读取到的文档:', readRes.data[0]);
        
        // 清理测试数据
        db.collection('inquiries').doc(res._id).remove().then(delRes => {
          console.log('🧹 测试数据清理完成');
          console.log('🎉 云数据库功能测试通过!');
        }).catch(delErr => {
          console.log('⚠️ 测试数据清理失败，但不影响正常使用:', delErr.message);
          console.log('🎉 云数据库功能测试通过!');
        });
      } else {
        console.log('❌ 数据读取验证失败');
      }
    }).catch(readErr => {
      console.log('❌ 数据读取验证失败:', readErr.message);
    });
    
  }).catch(err => {
    console.log('❌ 测试数据写入失败:', err.message);
    console.log('错误详情:', err);
  });
  
} catch (error) {
  console.log('❌ 云数据库初始化失败:', error.message);
  console.log('错误详情:', error);
}