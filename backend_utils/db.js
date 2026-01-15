const fs = require('fs');
const path = require('path');
const CloudDbClient = require('../services/cloud_db');

let cloudDb = null;
try {
  cloudDb = CloudDbClient.fromEnv();
  console.log('✅ [DB] 微信云数据库客户端初始化成功');
} catch (e) {
  console.warn('⚠️ [DB] 微信云数据库配置未就绪，将回退到本地 Mock 存储:', e.message);
}

function getMockDbPath() {
  return path.resolve(__dirname, '../', process.env.FILE_DB_PATH || 'mock_db.json');
}

function loadMockDb() {
  const filePath = getMockDbPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {
    console.error('❌ 读取 mock_db.json 失败:', e instanceof Error ? e.message : String(e));
  }
  return { stocks: [], groups: [] };
}

function writeMockDb(nextDb) {
  const filePath = getMockDbPath();
  fs.writeFileSync(filePath, JSON.stringify(nextDb, null, 2), 'utf8');
}

function isIntegerString(value) {
  return typeof value === 'string' && /^-?\d+$/.test(value);
}

function parsePagination(query) {
  const rawPage = query && query.page != null ? String(query.page) : '1';
  const rawPageSize = query && query.pageSize != null ? String(query.pageSize) : '10';

  if (!isIntegerString(rawPage) || !isIntegerString(rawPageSize)) {
    return { ok: false, error: { status: 400, message: '分页参数必须是整数' } };
  }

  const page = Number.parseInt(rawPage, 10);
  const pageSize = Number.parseInt(rawPageSize, 10);

  if (page < 1) return { ok: false, error: { status: 400, message: '页码必须大于等于1' } };
  if (pageSize < 1 || pageSize > 100) {
    return { ok: false, error: { status: 400, message: '每页数量必须在1-100之间' } };
  }

  return { ok: true, value: { page, pageSize } };
}

module.exports = {
  cloudDb,
  getMockDbPath,
  loadMockDb,
  writeMockDb,
  parsePagination
};
