describe('quote index redirect', () => {
  let page;

  beforeEach(() => {
    jest.resetModules();
    global.__captured = undefined;
    require('../../miniprogram/pages/quote/index.js');
    page = global.__getCapturedPage__();
  });

  test('redirects to quotes page on load', () => {
    global.wx = global.wx || {};
    global.wx.redirectTo = jest.fn();
    page.onLoad({});
    expect(global.wx.redirectTo).toHaveBeenCalledWith({ url: '/pages/quotes/quotes' });
  });
});
