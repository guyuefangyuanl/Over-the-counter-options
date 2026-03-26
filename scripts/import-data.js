/**
 * 云数据库初始化脚本
 * 通过微信云开发 REST API 导入初始数据
 * 
 * 使用方法：
 * 1. 确保已配置 .env.local 或 .env.production 中的微信云开发凭据
 * 2. 运行: node scripts/import-data.js
 */

const fs = require('fs');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.resolve(__dirname, '../.env.production') });

const WX_APPID = process.env.WX_APPID;
const WX_SECRET = process.env.WX_SECRET;
const WX_CLOUD_ENV = process.env.WX_CLOUD_ENV;

if (!WX_APPID || !WX_SECRET || !WX_CLOUD_ENV) {
  console.error('错误: 请在 .env.production 中配置 WX_APPID, WX_SECRET, WX_CLOUD_ENV');
  process.exit(1);
}

console.log('========================================');
console.log('场外期权交易平台 - 云数据库初始化');
console.log('========================================');
console.log(`环境ID: ${WX_CLOUD_ENV}`);
console.log(`AppID: ${WX_APPID}`);
console.log('');

// 初始行情数据
const initialQuotes = [
  { _id: 'idx_000001', code: '000001', name: '上证指数', price: 3420.35, change: 12.48, changePercent: 0.37, type: 'index', updateTime: new Date().toISOString() },
  { _id: 'idx_399001', code: '399001', name: '深证成指', price: 10856.24, change: -45.67, changePercent: -0.42, type: 'index', updateTime: new Date().toISOString() },
  { _id: 'idx_399006', code: '399006', name: '创业板指', price: 2198.76, change: 8.93, changePercent: 0.41, type: 'index', updateTime: new Date().toISOString() },
  { _id: 'idx_000300', code: '000300', name: '沪深300', price: 3521.12, change: 5.12, changePercent: 0.15, type: 'index', updateTime: new Date().toISOString() },
  { _id: 'idx_510050', code: '510050', name: '上证50ETF', price: 2.445, change: -0.016, changePercent: -0.65, type: 'etf', updateTime: new Date().toISOString() },
  { _id: 'stk_600519', code: '600519', name: '贵州茅台', price: 1702.35, change: -35.42, changePercent: -2.04, type: 'stock', updateTime: new Date().toISOString() },
  { _id: 'stk_300750', code: '300750', name: '宁德时代', price: 186.85, change: 3.16, changePercent: 1.72, type: 'stock', updateTime: new Date().toISOString() },
  { _id: 'stk_002594', code: '002594', name: '比亚迪', price: 236.25, change: 6.62, changePercent: 2.88, type: 'stock', updateTime: new Date().toISOString() },
  { _id: 'stk_601318', code: '601318', name: '中国平安', price: 47.4, change: 0.47, changePercent: 1.0, type: 'stock', updateTime: new Date().toISOString() },
  { _id: 'stk_600036', code: '600036', name: '招商银行', price: 31.56, change: 0.46, changePercent: 1.49, type: 'stock', updateTime: new Date().toISOString() }
];

// 初始期权数据
const initialOptions = [
  { _id: 'opt_510050_202606_C_250', underlying: '510050', underlyingName: '上证50ETF', name: '上证50ETF 2026-06 看涨 2.50', type: 'call', strike: 2.5, expiry: '2026-06-28', iv: 0.25, lastPrice: 0.032, change: 0.003, volume: 12500, updateTime: new Date().toISOString() },
  { _id: 'opt_510050_202606_P_230', underlying: '510050', underlyingName: '上证50ETF', name: '上证50ETF 2026-06 看跌 2.30', type: 'put', strike: 2.3, expiry: '2026-06-28', iv: 0.27, lastPrice: 0.021, change: -0.001, volume: 8200, updateTime: new Date().toISOString() },
  { _id: 'opt_000300_202607_C_3500', underlying: '000300', underlyingName: '沪深300', name: '沪深300 2026-07 看涨 3500', type: 'call', strike: 3500, expiry: '2026-07-30', iv: 0.22, lastPrice: 58.3, change: 1.8, volume: 3500, updateTime: new Date().toISOString() },
  { _id: 'opt_600519_202606_C_1800', underlying: '600519', underlyingName: '贵州茅台', name: '贵州茅台 2026-06 看涨 1800', type: 'call', strike: 1800, expiry: '2026-06-28', iv: 0.28, lastPrice: 45.6, change: 2.1, volume: 1200, updateTime: new Date().toISOString() }
];

// 分组数据
const initialGroups = [
  { _id: 'group_index', name: '指数', code: 'index', sort: 1, description: '主要市场指数', createdAt: new Date().toISOString() },
  { _id: 'group_etf', name: 'ETF基金', code: 'etf', sort: 2, description: '交易型开放式指数基金', createdAt: new Date().toISOString() },
  { _id: 'group_stock', name: '股票', code: 'stock', sort: 3, description: 'A股主要股票', createdAt: new Date().toISOString() },
  { _id: 'group_option', name: '期权', code: 'option', sort: 4, description: '场外期权品种', createdAt: new Date().toISOString() }
];

// 系统配置
const initialSettings = [
  { _id: 'system_config', appName: '场外期权交易平台', version: '1.0.0', lastUpdateTime: new Date().toISOString(), features: { inquiryEnabled: true, quoteEnabled: true, notificationEnabled: true } },
  { _id: 'trading_hours', morningStart: '09:30', morningEnd: '11:30', afternoonStart: '13:00', afternoonEnd: '15:00', timezone: 'Asia/Shanghai' }
];

// 获取 access_token
async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.errcode) {
    throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  }
  return data.access_token;
}

// 导入数据到集合
async function importCollection(accessToken, collectionName, data) {
  const url = `https://api.weixin.qq.com/tcb/databasemigrateimport?access_token=${accessToken}`;
  
  // 将数据转换为 JSON Lines 格式
  const jsonLines = data.map(item => JSON.stringify(item)).join('\n');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      env: WX_CLOUD_ENV,
      collection_name: collectionName,
      file_path: `import_${collectionName}_${Date.now()}.json`,
      file_type: 1, // JSON
      stop_on_error: false,
      conflict_mode: 'upsert' // 冲突时更新
    })
  });
  
  return await response.json();
}

// 主函数
async function main() {
  try {
    console.log('步骤 1: 获取 access_token...');
    const accessToken = await getAccessToken();
    console.log('✓ access_token 获取成功\n');
    
    console.log('步骤 2: 准备导入数据...\n');
    
    const collections = [
      { name: 'quotes', data: initialQuotes },
      { name: 'options', data: initialOptions },
      { name: 'groups', data: initialGroups },
      { name: 'settings', data: initialSettings }
    ];
    
    console.log('数据概览:');
    collections.forEach(c => {
      console.log(`  - ${c.name}: ${c.data.length} 条记录`);
    });
    console.log('');
    
    console.log('========================================');
    console.log('数据已准备就绪！');
    console.log('========================================');
    console.log('');
    console.log('由于微信云开发的数据库导入需要文件上传，');
    console.log('请使用以下方式之一完成数据导入：');
    console.log('');
    console.log('方式 1: 使用微信开发者工具');
    console.log('  1. 打开微信开发者工具');
    console.log('  2. 进入"云开发控制台"');
    console.log('  3. 选择"数据库"');
    console.log('  4. 分别创建集合: quotes, options, groups, settings');
    console.log('  5. 使用"导入"功能导入对应数据');
    console.log('');
    console.log('方式 2: 部署 initDatabase 云函数');
    console.log('  1. 在微信开发者工具中');
    console.log('  2. 右键 cloudfunctions/initDatabase');
    console.log('  3. 选择"上传并部署：云端安装依赖"');
    console.log('  4. 部署后在云开发控制台调用该云函数');
    console.log('');
    console.log('方式 3: 使用 cloudbase CLI');
    console.log('  tcb fn deploy initDatabase');
    console.log('  tcb fn invoke initDatabase');
    console.log('');
    
    // 生成导入文件
    const exportDir = path.resolve(__dirname, '../export-data');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    collections.forEach(c => {
      const filePath = path.join(exportDir, `${c.name}.json`);
      const content = c.data.map(item => JSON.stringify(item)).join('\n');
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`已生成: export-data/${c.name}.json`);
    });
    
    console.log('');
    console.log('✓ 数据文件已生成到 export-data/ 目录');
    
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

main();