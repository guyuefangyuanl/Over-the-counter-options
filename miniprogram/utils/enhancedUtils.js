// utils/enhancedUtils.js
// UI 工具、数据格式化、性能监控（可直接使用，零依赖）

const _wx = (typeof wx !== 'undefined') ? wx : null;

// ========== UI 工具 ==========
function showToast(title, icon = 'none', duration = 1500) {
  if (_wx && _wx.showToast) {
    _wx.showToast({ title: String(title || ''), icon, duration });
  } else {
    console.log('[Toast]', title);
  }
}

function showLoading(title = '加载中...') {
  if (_wx && _wx.showLoading) _wx.showLoading({ title });
}

function hideLoading() {
  if (_wx && _wx.hideLoading) _wx.hideLoading();
}

function setNavigationBarTitle(title) {
  if (_wx && _wx.setNavigationBarTitle) _wx.setNavigationBarTitle({ title: String(title || '') });
}

function vibrateLight() {}

function hapticFeedback(level = 'light') {}

function setTabBarBadge(index, text) {
  if (_wx && _wx.setTabBarBadge) {
    _wx.setTabBarBadge({ index: Number(index) || 0, text: String(text || '') });
  }
}

function removeTabBarBadge(index) {
  if (_wx && _wx.removeTabBarBadge) _wx.removeTabBarBadge({ index: Number(index) || 0 });
}

// ========== 工具函数 ==========
function clamp(num, min, max) { return Math.min(Math.max(num, min), max); }

function throttle(fn, wait) {
  let last = 0; let timer = null;
  return function throttled() {
    const now = Date.now();
    const remaining = wait - (now - last);
    const ctx = this; const args = arguments;
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now; fn.apply(ctx, args);
    } else if (!timer) {
      timer = setTimeout(function(){ last = Date.now(); timer = null; fn.apply(ctx, args); }, remaining);
    }
  };
}

function debounce(fn, wait, immediate) {
  let timer = null;
  return function debounced() {
    const ctx = this; const args = arguments;
    const callNow = immediate && !timer;
    clearTimeout(timer);
    timer = setTimeout(function(){ timer = null; if (!immediate) fn.apply(ctx, args); }, wait);
    if (callNow) fn.apply(ctx, args);
  };
}

function safeTry(fn, onError) {
  try { return fn(); } catch (e) { if (typeof onError === 'function') onError(e); else console.error(e); return null; }
}

// ========== 数据格式化 ==========
function formatNumber(value, decimals = 2, thousand = true) {
  const n = Number(value);
  if (!isFinite(n)) return '--';
  const fixed = n.toFixed(decimals);
  if (!thousand) return fixed;
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function formatCurrency(value, currency = '', decimals = 2) {
  const s = formatNumber(value, decimals, true);
  return s === '--' ? s : (currency + s);
}

function formatPercent(value, decimals = 2, withSign = true) {
  const n = Number(value);
  if (!isFinite(n)) return '--';
  const sign = withSign && n > 0 ? '+' : '';
  return sign + n.toFixed(decimals) + '%';
}

function formatVolume(value) {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return '--';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return String(n);
}

function pad2(n){ return n < 10 ? ('0' + n) : String(n); }

function formatDate(input, fmt = 'YYYY-MM-DD') {
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '--';
  const Y = d.getFullYear(); const M = pad2(d.getMonth() + 1); const D = pad2(d.getDate());
  return fmt.replace('YYYY', Y).replace('MM', M).replace('DD', D);
}

function formatTime(input, fmt = 'HH:mm:ss') {
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '--';
  const h = pad2(d.getHours()); const m = pad2(d.getMinutes()); const s = pad2(d.getSeconds());
  return fmt.replace('HH', h).replace('mm', m).replace('ss', s);
}

function roundTo(n, decimals) {
  const factor = Math.pow(10, decimals || 0);
  return Math.round(Number(n) * factor) / factor;
}

// ========== 性能监控 ==========
const perf = {
  marks: Object.create(null),
  logs: [],
  errors: 0,
  memoryWarnings: 0,
  fps: { value: 60, samples: [] }
};

function markStart(name) {
  perf.marks[name] = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function markEnd(name) {
  const start = perf.marks[name];
  const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (typeof start !== 'number') return null;
  const ms = end - start;
  perf.logs.push({ name, ms, ts: Date.now() });
  delete perf.marks[name];
  return ms;
}

function timeFunction(name, fn) {
  markStart(name);
  const res = safeTry(fn, function(err){ perf.errors++; console.error('[perf error]', err); });
  const ms = markEnd(name);
  return { result: res, ms: ms };
}

let _fpsTimer = null, _rafId = null;
function startFPSMonitor(sampleMs = 500) {
  if (_fpsTimer) return; // 已启动
  let frames = 0; let last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  function loop(){ frames++; _rafId = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame(loop) : setTimeout(loop, 16); }
  loop();
  _fpsTimer = setInterval(function(){
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = now - last;
    const fps = Math.round((frames / elapsed) * 1000);
    perf.fps.value = clamp(fps, 0, 120);
    perf.fps.samples.push({ ts: Date.now(), fps: perf.fps.value });
    frames = 0; last = now;
  }, sampleMs);
  if (_wx && _wx.onMemoryWarning) {
    _wx.onMemoryWarning(function(){ perf.memoryWarnings++; console.warn('[memory warning] clearing caches'); });
  }
}

function stopFPSMonitor() {
  if (_fpsTimer) { clearInterval(_fpsTimer); _fpsTimer = null; }
  if (_rafId) {
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(_rafId);
    else clearTimeout(_rafId);
    _rafId = null;
  }
}

function getMetrics() {
  return {
    logs: perf.logs.slice(-50),
    fps: perf.fps.value,
    samples: perf.fps.samples.slice(-50),
    errors: perf.errors,
    memoryWarnings: perf.memoryWarnings
  };
}

// 简易可释放资源管理，避免泄漏
function createDisposable() {
  const disposers = [];
  return {
    add(fn) { if (typeof fn === 'function') disposers.push(fn); },
    dispose() { disposers.splice(0).forEach(function(d){ try { d(); } catch(_) {} }); }
  };
}

module.exports = {
  // 兼容现有代码期望的分组导出
  uiEnhancer: {
    showToast,
    showLoading,
    hideLoading,
    setNavigationBarTitle,
    vibrateLight,
    hapticFeedback,
    setTabBarBadge,
    removeTabBarBadge
  },
  dataFormatter: {
    formatNumber,
    formatCurrency,
    formatPercent,
    formatDate,
    formatTime,
    roundTo,
    formatVolume
  },
  performanceMonitor: {
    markStart,
    markEnd,
    timeFunction,
    startFPSMonitor,
    stopFPSMonitor,
    getMetrics
  },
  // 同时导出原始工具，供自由调用
  clamp,
  throttle,
  debounce,
  safeTry,
  createDisposable
};
