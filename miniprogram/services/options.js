// services/options.js
// 市场指数、热门期权与搜索服务（可直接使用，零依赖）

const CACHE_TTL = 60 * 1000; // 1 分钟缓存

const MARKET_INDICES = [
  { code: '000001', name: '上证指数', price: 3420.35, change: +12.48, changePercent: +0.37, updatedAt: Date.now() },
  { code: '399001', name: '深证成指', price: 10856.24, change: -45.67, changePercent: -0.42, updatedAt: Date.now() },
  { code: '399006', name: '创业板指', price: 2198.76, change: +8.93, changePercent: +0.41, updatedAt: Date.now() },
  { code: '000300', name: '沪深300', price: 3521.12, change: +5.12, changePercent: +0.15, updatedAt: Date.now() },
  { code: '510050', name: '上证50ETF', price: 2.445, change: -0.016, changePercent: -0.65, updatedAt: Date.now() }
];

const HOT_OPTIONS = [
  { id: 'OPT-510050-202506-C-2.50', underlying: '510050', name: '上证50ETF 2025-06 看涨 2.50', type: 'call', strike: 2.5, expiry: '2025-06-28', iv: 0.25, lastPrice: 0.32, change: +0.03 },
  { id: 'OPT-510050-202506-P-2.30', underlying: '510050', name: '上证50ETF 2025-06 看跌 2.30', type: 'put',  strike: 2.3, expiry: '2025-06-28', iv: 0.27, lastPrice: 0.21, change: -0.01 },
  { id: 'OPT-000300-202507-C-3500', underlying: '000300', name: '沪深300 2025-07 看涨 3500', type: 'call', strike: 3500, expiry: '2025-07-30', iv: 0.22, lastPrice: 58.3, change: +1.8 },
  { id: 'OPT-000300-202507-P-3500', underlying: '000300', name: '沪深300 2025-07 看跌 3500', type: 'put',  strike: 3500, expiry: '2025-07-30', iv: 0.23, lastPrice: 54.9, change: -2.1 },
  { id: 'OPT-000001-202508-C-3400', underlying: '000001', name: '上证指数 2025-08 看涨 3400', type: 'call', strike: 3400, expiry: '2025-08-31', iv: 0.19, lastPrice: 45.1, change: +0.6 }
];

function generateMockOptions() {
  const bases = [
    { code: '510050', name: '上证50ETF', spot: 2.445 },
    { code: '000300', name: '沪深300',  spot: 3521.12 },
    { code: '000001', name: '上证指数',  spot: 3420.35 }
  ];
  const items = [];
  bases.forEach(b => {
    const strikes = b.code === '510050' ? [2.2, 2.3, 2.4, 2.5, 2.6] : [b.spot * 0.95, b.spot, b.spot * 1.05, b.spot * 1.1].map(v => Math.round(v));
    const expiries = ['2025-06-28', '2025-07-30', '2025-08-31'];
    expiries.forEach(exp => {
      strikes.forEach(s => {
        items.push({
          id: `OPT-${b.code}-${exp}-C-${s}`,
          underlying: b.code,
          underlyingName: b.name,
          name: `${b.name} ${exp} 看涨 ${s}`,
          type: 'call',
          strike: Number(s),
          expiry: exp,
          iv: +(0.18 + Math.random() * 0.12).toFixed(3),
          lastPrice: +(Math.random() * 80).toFixed(2),
          change: +(Math.random() * 4 - 2).toFixed(2)
        });
        items.push({
          id: `OPT-${b.code}-${exp}-P-${s}`,
          underlying: b.code,
          underlyingName: b.name,
          name: `${b.name} ${exp} 看跌 ${s}`,
          type: 'put',
          strike: Number(s),
          expiry: exp,
          iv: +(0.18 + Math.random() * 0.12).toFixed(3),
          lastPrice: +(Math.random() * 80).toFixed(2),
          change: +(Math.random() * 4 - 2).toFixed(2)
        });
      });
    });
  });
  return items;
}

const _cache = {
  indices: { ts: 0, data: MARKET_INDICES.slice() },
  hot:     { ts: 0, data: HOT_OPTIONS.slice() },
  options: { ts: 0, data: generateMockOptions() }
};

function _isFresh(ts) { return (Date.now() - ts) < CACHE_TTL; }

function getMarketIndices(forceRefresh) {
  if (!forceRefresh && _isFresh(_cache.indices.ts)) {
    return Promise.resolve(_cache.indices.data);
  }
  // 模拟刷新：复制并更新时间
  const refreshed = _cache.indices.data.map(i => ({
    code: i.code,
    name: i.name,
    price: i.price + +(Math.random() * 6 - 3).toFixed(2),
    change: +(Math.random() * 12 - 6).toFixed(2),
    changePercent: +(Math.random() * 1.2 - 0.6).toFixed(2),
    updatedAt: Date.now()
  }));
  _cache.indices = { ts: Date.now(), data: refreshed };
  return Promise.resolve(refreshed);
}

function getHotOptions(forceRefresh) {
  if (!forceRefresh && _isFresh(_cache.hot.ts)) {
    return Promise.resolve(_cache.hot.data);
  }
  const refreshed = _cache.hot.data.map(o => ({
    ...o,
    lastPrice: +(o.lastPrice + (Math.random() * 1 - 0.5)).toFixed(2),
    change: +(Math.random() * 0.2 - 0.1).toFixed(2)
  }));
  _cache.hot = { ts: Date.now(), data: refreshed };
  return Promise.resolve(refreshed);
}

function _normalize(s) { return String(s || '').trim().toLowerCase(); }
function _tokenize(s) { return _normalize(s).split(/\s+/).filter(Boolean); }

function _relevanceScore(o, tokens, mode) {
  if (!tokens.length) return 0;
  const name = _normalize(o.name);
  const code = _normalize(o.underlying);
  const uname = _normalize(o.underlyingName);
  let score = 0;
  let matchedAll = true;
  tokens.forEach(t => {
    const isNum = /^\d+(\.\d+)?$/.test(t);
    const inName = name.includes(t);
    const inCode = code.includes(t);
    const inUname = uname.includes(t);
    const inType = (t === 'call' && o.type === 'call') || (t === 'put' && o.type === 'put') || ['看涨','认购','c'].includes(t) && o.type==='call' || ['看跌','认沽','p'].includes(t) && o.type==='put';
    const strikeProx = isNum ? Math.max(0, 1 - Math.min(1, Math.abs(Number(t) - Number(o.strike)) / (Number(o.strike) || 1))) : 0;
    const hit = inName || inCode || inUname || inType || strikeProx > 0;
    if (!hit) matchedAll = false;
    score += (inName ? 3 : 0) + (inUname ? 2 : 0) + (inCode ? 2 : 0) + (inType ? 1.5 : 0) + strikeProx;
  });
  if (mode === 'exact' && !matchedAll) return -1; // 排除未匹配所有词的项
  return score;
}

function searchOptions(params) {
  const {
    keyword = '',
    type,
    underlying,
    expiryFrom,
    expiryTo,
    strikeMin,
    strikeMax,
    mode = 'fuzzy',       // 'fuzzy' | 'exact'
    page = 1,
    pageSize = 20,
    sortBy = 'relevance'  // 'relevance' | 'price' | 'iv'
  } = params || {};

  const tokens = _tokenize(keyword);
  let list = _cache.options.data.slice();

  // 结构过滤
  if (type) list = list.filter(o => o.type === type);
  if (underlying) list = list.filter(o => o.underlying === underlying);
  if (expiryFrom) list = list.filter(o => o.expiry >= expiryFrom);
  if (expiryTo)   list = list.filter(o => o.expiry <= expiryTo);
  if (typeof strikeMin === 'number') list = list.filter(o => o.strike >= strikeMin);
  if (typeof strikeMax === 'number') list = list.filter(o => o.strike <= strikeMax);

  // 关键词评分（支持模糊/精确）
  if (tokens.length) {
    list = list
      .map(o => ({ o, score: _relevanceScore(o, tokens, mode) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.o);
  }

  // 排序
  if (sortBy === 'price') list.sort((a, b) => b.lastPrice - a.lastPrice);
  else if (sortBy === 'iv') list.sort((a, b) => b.iv - a.iv);

  const total = list.length;
  const start = Math.max(0, (Number(page) - 1) * Number(pageSize));
  const items = list.slice(start, start + Number(pageSize));
  return Promise.resolve({ items, total, page: Number(page), pageSize: Number(pageSize) });
}

function getSuggestions({ keyword = '', limit = 8 } = {}) {
  const kw = _normalize(keyword);
  const baseSet = new Map();
  _cache.options.data.forEach(o => { baseSet.set(o.underlying, o.underlyingName); });
  const bases = Array.from(baseSet.entries()).map(([code, name]) => ({ code, name }));
  const baseHits = kw ? bases.filter(b => b.name.toLowerCase().includes(kw) || b.code.toLowerCase().includes(kw)) : bases;
  const expiryHits = _cache.options.data
    .map(o => o.expiry)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter(v => !kw || v.includes(kw))
    .map(v => ({ type: 'expiry', value: v }));
  const strikeHits = _cache.options.data
    .map(o => String(o.strike))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .filter(v => !kw || v.includes(kw))
    .map(v => ({ type: 'strike', value: v }));
  const suggestions = [
    ...baseHits.map(b => ({ type: 'underlying', value: b.code, label: `${b.name} ${b.code}` })),
    ...expiryHits,
    ...strikeHits
  ].slice(0, limit);
  return Promise.resolve(suggestions);
}

function getOptionChains(underlying) {
  const data = _cache.options.data.filter(o => o.underlying === underlying);
  const byExpiry = {};
  data.forEach(o => {
    if (!byExpiry[o.expiry]) byExpiry[o.expiry] = {};
    const key = String(o.strike);
    if (!byExpiry[o.expiry][key]) byExpiry[o.expiry][key] = { strike: o.strike, call: null, put: null };
    byExpiry[o.expiry][key][o.type] = o;
  });
  const result = Object.keys(byExpiry).sort().map(exp => ({
    expiry: exp,
    chains: Object.values(byExpiry[exp]).sort((a, b) => a.strike - b.strike)
  }));
  return Promise.resolve(result);
}

// 简单的订阅更新（可选使用）：返回取消函数，避免内存泄漏
function subscribeIndicesUpdates(callback, intervalMs = 5000) {
  if (typeof callback !== 'function') return () => {};
  let active = true;
  const timer = setInterval(() => {
    if (!active) return;
    getMarketIndices(true).then(data => { try { callback(data); } catch (e) { /* noop */ } });
  }, intervalMs);
  return () => { active = false; clearInterval(timer); };
}

module.exports = {
  getMarketIndices,
  getHotOptions,
  searchOptions,
  getSuggestions,
  getOptionChains,
  subscribeIndicesUpdates
};
