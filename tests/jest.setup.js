global.wx = {
  getStorageSync: jest.fn(() => []),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  showToast: jest.fn(),
  showModal: jest.fn((opts)=>{ if (opts && typeof opts.success==='function') opts.success({ confirm: true }); }),
};

let __captured;
global.Page = (obj) => { __captured = obj; };
global.__getCapturedPage__ = () => __captured;

global.getApp = jest.fn(() => ({ data: {} }));