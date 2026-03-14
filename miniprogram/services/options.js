// services/options.js
// 市场指数、热门期权与搜索服务
// 优先从云数据库获取，失败时降级到本地 Mock 数据

const CACHE_TTL = 60 * 1000; // 1 分钟缓存

// ========== Mock 数据（降级备用） ==========

const MOCK_MARKET_INDICES = [
  { code: '000001', name: '上证指数', price: 3420.35, change: +12.48, changePercent: +0.37, changeRate: '+0.37%', updatedAt: Date.now() },
  { code: '399001', name: '深证成指', price: 10856.24, change: -45.67, changePercent: -0.42, changeRate: '-0.42%', updatedAt: Date.now() },
  { code: '399006', name: '创业板指', price: 2198.76, change: +8.93, changePercent: +0.41, changeRate: '+0.41%', updatedAt: Date.now() },
  { code: '000300', name: '沪深300', price: 3521.12, change: +5.12, changePercent: +0.15, changeRate: '+0.15%', updatedAt: Date.now() },
  { code: '510050', name: '上证50ETF', price: 2.445, change: -0.016, changePercent: -0.65, changeRate: '-0.65%', updatedAt: Date.now() }
];

const MOCK_HOT_OPTIONS = [
  { id: 'OPT-510050-C-2.50', underlying: '510050', name: '上证50ETF', code: '510050', type: 'call', structure: '100C6m', market: 'SH', strike: 2.5, expiry: '2025-06-28', iv: 0.25, lastPrice: 0.32, price: 0.32, change: +0.03 },
  { id: 'OPT-510050-P-2.30', underlying: '510050', name: '上证50ETF', code: '510050', type: 'put', structure: '50P3m', market: 'SH', strike: 2.3, expiry: '2025-06-28', iv: 0.27, lastPrice: 0.21, price: 0.21, change: -0.01 },
  { id: 'OPT-000300-C-3500', underlying: '000300', name: '沪深300', code: '000300', type: 'call', structure: '100C6m', market: 'SH', strike: 3500, expiry: '2025-07-30', iv: 0.22, lastPrice: 58.3, price: 58.3, change: +1.8 },
  { id: 'OPT-000300-P-3500', underlying: '000300', name: '沪深300', code: '000300', type: 'put', structure: '100P3m', market: 'SH', strike: 3500, expiry: '2025-07-30', iv: 0.23, lastPrice: 54.9, price: 54.9, change: -2.1 },
  { id: 'OPT-000001-C-3400', underlying: '000001', name: '上证指数', code: '000001', type: 'call', structure: '100C6m', market: 'SH', strike: 3400, expiry: '2025-08-31', iv: 0.19, lastPrice: 45.1, price: 45.1, change: +0.6 }
];

function generateMockOptions() {
  var bases = [
    { code: '510050', name: '上证50ETF', spot: 2.445 },
    { code: '000300', name: '沪深300',  spot: 3521.12 },
    { code: '000001', name: '上证指数',  spot: 3420.35 }
  ];
  var items = [];
  bases.forEach(function(b) {
    var strikes = b.code === '510050' ? [2.2, 2.3, 2.4, 2.5, 2.6] : [b.spot * 0.95, b.spot, b.spot * 1.05, b.spot * 1.1].map(function(v) { return Math.round(v); });
    var expiries = ['2025-06-28', '2025-07-30', '2025-08-31'];
    expiries.forEach(function(exp) {
      strikes.forEach(function(s) {
        items.push({
          id: 'OPT-' + b.code + '-' + exp + '-C-' + s,
          underlying: b.code,
          underlyingName: b.name,
          name: b.name + ' ' + exp + ' 看涨 ' + s,
          type: 'call',
          strike: Number(s),
          expiry: exp,
          iv: +(0.18 + Math.random() * 0.12).toFixed(3),
          lastPrice: +(Math.random() * 80).toFixed(2),
          change: +(Math.random() * 4 - 2).toFixed(2)
        });
        items.push({
          id: 'OPT-' + b.code + '-' + exp + '-P-' + s,
          underlying: b.code,
          underlyingName: b.name,
          name: b.name + ' ' + exp + ' 看跌 ' + s,
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

// ========== 缓存管理 ==========

var _cache = {
  indices: { ts: 0, data: MOCK_MARKET_INDICES.slice() },
  hot:     { ts: 0, data: MOCK_HOT_OPTIONS.slice() },
  options: { ts: 0, data: generateMockOptions() }
};

function _isFresh(ts) { return (Date.now() - ts) < CACHE_TTL; }

// ========== 云数据库访问 ==========

/**
 * 获取云数据库实例（安全获取，失败返回 null）
 */
function _getDB() {
  try {
    if (wx.cloud && typeof wx.cloud.database === 'function') {
      return wx.cloud.database();
    }
  } catch (e) {
    // 云环境未初始化
  }
  return null;
}

/**
 * 标准化云数据库 quotes 记录为首页可用格式
 */
function _normalizeQuoteItem(item) {
  return {
    id: item._id || item.id || '',
    underlying: item.stock_code || item.code || '',
    underlyingName: item.stock_name || item.name || '',
    name: item.stock_name || item.name || '',
    code: item.stock_code || item.code || '',
    type: item.type || 'stock',
    structure: item.structure || 'vanilla',
    market: item.market || 'SH',
    strike: item.strike || 0,
    expiry: item.expiry || '',
    iv: item.iv || 0,
    lastPrice: item.price || item.lastPrice || 0,
    price: item.price || item.lastPrice || 0,
    change: item.change || 0,
    changePercent: item.changePercent || 0,
    updatedAt: item.updateTime || item.updatedAt || Date.now()
  };
}

// ========== 公开 API ==========

/**
 * 获取市场指数数据
 * 尝试从云数据库 quotes 集合中筛选 type='index' 的记录，
 * 失败时降级到本地 Mock 数据
 */
function getMarketIndices(forceRefresh) {
  if (!forceRefresh && _isFresh(_cache.indices.ts)) {
    return Promise.resolve(_cache.indices.data);
  }

  var db = _getDB();
  if (!db) {
    return _getIndicesMock();
  }

  return new Promise(function(resolve) {
    db.collection('quotes').where({ type: 'index' }).limit(10).get().then(function(res) {
      if (res.data && res.data.length > 0) {
        var indices = res.data.map(function(item) {
          return {
            code: item.stock_code || item.code || '',
            name: item.stock_name || item.name || '',
            price: item.price || 0,
            change: item.change || 0,
            changePercent: item.changePercent || 0,
            changeRate: (item.changePercent >= 0 ? '+' : '') + (item.changePercent || 0).toFixed(2) + '%',
            updatedAt: item.updateTime || Date.now()
          };
        });
        _cache.indices = { ts: Date.now(), data: indices };
        resolve(indices);
      } else {
        // 云数据库无 type=index 数据，降级
        _getIndicesMock().then(resolve);
      }
    }).catch(function() {
      _getIndicesMock().then(resolve);
    });
  });
}

function _getIndicesMock() {
  var refreshed = _cache.indices.data.map(function(i) {
    return {
      code: i.code,
      name: i.name,
      price: +(i.price + (Math.random() * 6 - 3)).toFixed(2),
      change: +(Math.random() * 12 - 6).toFixed(2),
      changePercent: +(Math.random() * 1.2 - 0.6).toFixed(2),
      changeRate: '',
      updatedAt: Date.now()
    };
  });
  // 补充 changeRate 字段
  refreshed.forEach(function(i) {
    i.changeRate = (i.changePercent >= 0 ? '+' : '') + i.changePercent.toFixed(2) + '%';
  });
  _cache.indices = { ts: Date.now(), data: refreshed };
  return Promise.resolve(refreshed);
}

/**
 * 获取热门期权产品
 * 尝试从云数据库 quotes 集合获取，失败时降级
 */
function getHotOptions(forceRefresh) {
  if (!forceRefresh && _isFresh(_cache.hot.ts)) {
    return Promise.resolve(_cache.hot.data);
  }

  var db = _getDB();
  if (!db) {
    return _getHotMock();
  }

  return new Promise(function(resolve) {
    db.collection('quotes').orderBy('updateTime', 'desc').limit(10).get().then(function(res) {
      if (res.data && res.data.length > 0) {
        var options = res.data.map(_normalizeQuoteItem);
        _cache.hot = { ts: Date.now(), data: options };
        resolve(options);
      } else {
        _getHotMock().then(resolve);
      }
    }).catch(function() {
      _getHotMock().then(resolve);
    });
  });
}

function _getHotMock() {
  var refreshed = _cache.hot.data.map(function(o) {
    return Object.assign({}, o, {
      lastPrice: +(o.lastPrice + (Math.random() * 1 - 0.5)).toFixed(2),
      price: +(o.price + (Math.random() * 1 - 0.5)).toFixed(2),
      change: +(Math.random() * 0.2 - 0.1).toFixed(2)
    });
  });
  _cache.hot = { ts: Date.now(), data: refreshed };
  return Promise.resolve(refreshed);
}

// ========== 搜索功能 ==========

function _normalize(s) { return String(s || '').trim().toLowerCase(); }
function _tokenize(s) { return _normalize(s).split(/\s+/).filter(Boolean); }

function _relevanceScore(o, tokens, mode) {
  if (!tokens.length) return 0;
  var name = _normalize(o.name);
  var code = _normalize(o.underlying);
  var uname = _normalize(o.underlyingName);
  var score = 0;
  var matchedAll = true;
  tokens.forEach(function(t) {
    var isNum = /^\d+(\.\d+)?$/.test(t);
    var inName = name.indexOf(t) !== -1;
    var inCode = code.indexOf(t) !== -1;
    var inUname = uname.indexOf(t) !== -1;
    var inType = (t === 'call' && o.type === 'call') || (t === 'put' && o.type === 'put') || (['看涨','认购','c'].indexOf(t) !== -1 && o.type === 'call') || (['看跌','认沽','p'].indexOf(t) !== -1 && o.type === 'put');
    var strikeProx = isNum ? Math.max(0, 1 - Math.min(1, Math.abs(Number(t) - Number(o.strike)) / (Number(o.strike) || 1))) : 0;
    var hit = inName || inCode || inUname || inType || strikeProx > 0;
    if (!hit) matchedAll = false;
    score += (inName ? 3 : 0) + (inUname ? 2 : 0) + (inCode ? 2 : 0) + (inType ? 1.5 : 0) + strikeProx;
  });
  if (mode === 'exact' && !matchedAll) return -1;
  return score;
}

/**
 * 搜索期权
 * 优先尝试云数据库模糊搜索，失败降级到本地缓存
 */
function searchOptions(params) {
  var keyword = (params && params.keyword) || '';
  var type = params && params.type;
  var underlying = params && params.underlying;
  var expiryFrom = params && params.expiryFrom;
  var expiryTo = params && params.expiryTo;
  var strikeMin = params && params.strikeMin;
  var strikeMax = params && params.strikeMax;
  var mode = (params && params.mode) || 'fuzzy';
  var page = (params && params.page) || 1;
  var pageSize = (params && params.pageSize) || 20;
  var sortBy = (params && params.sortBy) || 'relevance';

  // 尝试从云数据库搜索
  var db = _getDB();
  if (db && keyword.trim()) {
    return _searchFromCloud(db, keyword, page, pageSize).catch(function() {
      return _searchFromLocal(keyword, type, underlying, expiryFrom, expiryTo, strikeMin, strikeMax, mode, page, pageSize, sortBy);
    });
  }

  return _searchFromLocal(keyword, type, underlying, expiryFrom, expiryTo, strikeMin, strikeMax, mode, page, pageSize, sortBy);
}

function _searchFromCloud(db, keyword, page, pageSize) {
  return new Promise(function(resolve, reject) {
    // 云数据库 RegExp 搜索
    var rgx = db.RegExp({ regexp: keyword, options: 'i' });
    db.collection('quotes').where(db.command.or([
      { stock_name: rgx },
      { stock_code: rgx },
      { name: rgx },
      { code: rgx }
    ])).limit(pageSize).skip((page - 1) * pageSize).get().then(function(res) {
      if (res.data && res.data.length > 0) {
        var items = res.data.map(function(item) {
          var normalized = _normalizeQuoteItem(item);
          normalized.displayText = (normalized.name || '') + ' ' + (normalized.code || '');
          return normalized;
        });
        resolve({ items: items, total: items.length, page: page, pageSize: pageSize });
      } else {
        reject(new Error('no cloud results'));
      }
    }).catch(reject);
  });
}

function _searchFromLocal(keyword, type, underlying, expiryFrom, expiryTo, strikeMin, strikeMax, mode, page, pageSize, sortBy) {
  var tokens = _tokenize(keyword);
  var list = _cache.options.data.slice();

  if (type) list = list.filter(function(o) { return o.type === type; });
  if (underlying) list = list.filter(function(o) { return o.underlying === underlying; });
  if (expiryFrom) list = list.filter(function(o) { return o.expiry >= expiryFrom; });
  if (expiryTo) list = list.filter(function(o) { return o.expiry <= expiryTo; });
  if (typeof strikeMin === 'number') list = list.filter(function(o) { return o.strike >= strikeMin; });
  if (typeof strikeMax === 'number') list = list.filter(function(o) { return o.strike <= strikeMax; });

  if (tokens.length) {
    list = list
      .map(function(o) { return { o: o, score: _relevanceScore(o, tokens, mode) }; })
      .filter(function(x) { return x.score >= 0; })
      .sort(function(a, b) { return b.score - a.score; })
      .map(function(x) { return x.o; });
  }

  if (sortBy === 'price') list.sort(function(a, b) { return b.lastPrice - a.lastPrice; });
  else if (sortBy === 'iv') list.sort(function(a, b) { return b.iv - a.iv; });

  var total = list.length;
  var start = Math.max(0, (Number(page) - 1) * Number(pageSize));
  var items = list.slice(start, start + Number(pageSize));
  return Promise.resolve({ items: items, total: total, page: Number(page), pageSize: Number(pageSize) });
}

function getSuggestions(opts) {
  var keyword = (opts && opts.keyword) || '';
  var limit = (opts && opts.limit) || 8;
  var kw = _normalize(keyword);
  var baseSet = {};
  _cache.options.data.forEach(function(o) { baseSet[o.underlying] = o.underlyingName; });
  var bases = Object.keys(baseSet).map(function(code) { return { code: code, name: baseSet[code] }; });
  var baseHits = kw ? bases.filter(function(b) { return b.name.toLowerCase().indexOf(kw) !== -1 || b.code.toLowerCase().indexOf(kw) !== -1; }) : bases;
  var seen = {};
  var expiryHits = _cache.options.data.map(function(o) { return o.expiry; }).filter(function(v) { if (seen[v]) return false; seen[v] = true; return !kw || v.indexOf(kw) !== -1; }).map(function(v) { return { type: 'expiry', value: v }; });
  seen = {};
  var strikeHits = _cache.options.data.map(function(o) { return String(o.strike); }).filter(function(v) { if (seen[v]) return false; seen[v] = true; return !kw || v.indexOf(kw) !== -1; }).map(function(v) { return { type: 'strike', value: v }; });
  var suggestions = baseHits.map(function(b) { return { type: 'underlying', value: b.code, label: b.name + ' ' + b.code }; }).concat(expiryHits).concat(strikeHits).slice(0, limit);
  return Promise.resolve(suggestions);
}

function getOptionChains(underlying) {
  var data = _cache.options.data.filter(function(o) { return o.underlying === underlying; });
  var byExpiry = {};
  data.forEach(function(o) {
    if (!byExpiry[o.expiry]) byExpiry[o.expiry] = {};
    var key = String(o.strike);
    if (!byExpiry[o.expiry][key]) byExpiry[o.expiry][key] = { strike: o.strike, call: null, put: null };
    byExpiry[o.expiry][key][o.type] = o;
  });
  var result = Object.keys(byExpiry).sort().map(function(exp) {
    return {
      expiry: exp,
      chains: Object.values(byExpiry[exp]).sort(function(a, b) { return a.strike - b.strike; })
    };
  });
  return Promise.resolve(result);
}

/**
 * 订阅指数实时更新（定时刷新）
 * @returns {Function} 取消订阅函数
 */
function subscribeIndicesUpdates(callback, intervalMs) {
  if (typeof callback !== 'function') return function() {};
  intervalMs = intervalMs || 5000;
  var active = true;
  var timer = setInterval(function() {
    if (!active) return;
    getMarketIndices(true).then(function(data) { try { callback(data); } catch (e) { /* noop */ } });
  }, intervalMs);
  return function() { active = false; clearInterval(timer); };
}

module.exports = {
  getMarketIndices: getMarketIndices,
  getHotOptions: getHotOptions,
  searchOptions: searchOptions,
  getSuggestions: getSuggestions,
  getOptionChains: getOptionChains,
  subscribeIndicesUpdates: subscribeIndicesUpdates
};
