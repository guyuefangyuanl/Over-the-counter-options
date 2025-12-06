describe('quote index filters', () => {
  let page;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    global.__captured = undefined;
    require('../../miniprogram/pages/quote/index.js');
    page = global.__getCapturedPage__();
    page.setData = jest.fn((obj) => Object.assign(page.data || {}, obj));
  });

  test('period filter reflected in fetched list', async () => {
    page.data = page.data || {};
    page.data.filters = { period: '1M', dealer: 'best' };
    const p = page.fetchQuoteData();
    if (jest.advanceTimersByTimeAsync) { await jest.advanceTimersByTimeAsync(310); } else { jest.advanceTimersByTime(310); await Promise.resolve(); }
    await p;
    expect(Array.isArray(page.data.quoteList)).toBe(true);
    expect(page.data.quoteList.length).toBeGreaterThan(0);
    expect(page.data.quoteList.every(i => i.period === '1M')).toBe(true);

    // 更改为 3M
    page.periodOptions = ['1M','2M','3M'];
    page.onPeriodChange({ detail: { value: '2' } });
    expect(page.data.filters.period).toBe('3M');
  });

  test('dealer change updates filters and refetches', async () => {
    page.dealerOptions = [{ key:'best',name:'最优' },{ key:'ZXZZ',name:'ZXZZ' },{ key:'HTCC',name:'HTCC' }];
    page.onDealerChange({ detail: { value: '1' } });
    expect(page.data.filters.dealer).toBe('ZXZZ');
    expect(Array.isArray(page.data.quoteList)).toBe(true);
  });
});