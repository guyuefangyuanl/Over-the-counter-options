/**
 * 检查微信云数据库中的inquiries集合
 * 在微信开发者工具的云开发控制台中运行此脚本
 */

// 在微信开发者工具的云开发控制台执行
const cloud = require('wx-server-sdk');
cloud.init({
  env: 'develop-8gx7kh9g045e6c9a'
});

const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 查询所有询价记录
    const result = await db.collection('inquiries')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    console.log('===== 云数据库inquiries集合查询结果 =====');
    console.log('总记录数:', result.data.length);
    
    if (result.data.length > 0) {
      console.log('\n最新5条记录:');
      result.data.slice(0, 5).forEach((item, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log('  ID:', item._id);
        console.log('  产品:', item.productName || '未知');
        console.log('  联系人:', item.contactName || '未知');
        console.log('  状态:', item.status || 'pending');
        console.log('  来源:', item.source || 'miniprogram');
        console.log('  创建时间:', item.createdAt);
      });
    } else {
      console.log('\n⚠️ 云数据库中暂无询价记录');
      console.log('请在小程序中提交询价后再检查');
    }
    
    // 统计各来源的数量
    const sources = {};
    result.data.forEach(item => {
      const source = item.source || 'miniprogram';
      sources[source] = (sources[source] || 0) + 1;
    });
    
    console.log('\n按来源统计:');
    Object.entries(sources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} 条`);
    });
    
    return {
      success: true,
      total: result.data.length,
      sources,
      recentRecords: result.data.slice(0, 5)
    };
    
  } catch (error) {
    console.error('查询失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
