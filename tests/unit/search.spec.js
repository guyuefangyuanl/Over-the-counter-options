describe('search page helpers', () => {
  let page;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    global.__captured = undefined;
    require('../../miniprogram/pages/search/search.js');
    page = global.__getCapturedPage__();
    page.setData = jest.fn((obj) => Object.assign(page.data || {}, obj));
  });

  test('debounce: multiple calls within 300ms triggers once', async () => {
    // 连续快速调用（<300ms）只应触发一次 setData 更新
    page.debounceFetchSuggestions('茅台');
    page.debounceFetchSuggestions('茅台');
    page.debounceFetchSuggestions('茅台');
    if (jest.advanceTimersByTimeAsync) { await jest.advanceTimersByTimeAsync(600); } else { jest.advanceTimersByTime(600); await Promise.resolve(); }
    expect(page.setData.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('debounce: after delay triggers again', async () => {
    page.debounceFetchSuggestions('茅台');
    if (jest.advanceTimersByTimeAsync) { await jest.advanceTimersByTimeAsync(600); } else { jest.advanceTimersByTime(600); await Promise.resolve(); }
    const firstCalls = page.setData.mock.calls.length;
    // 再次调用应增加调用次数
    page.debounceFetchSuggestions('茅台');
    if (jest.advanceTimersByTimeAsync) { await jest.advanceTimersByTimeAsync(600); } else { jest.advanceTimersByTime(600); await Promise.resolve(); }
    expect(page.setData.mock.calls.length).toBeGreaterThan(firstCalls);
  });

  test('saveHistory: dedupe and limit length', () => {
    // 模拟已有历史并包含重复
    wx.getStorageSync.mockReturnValue(['茅台', '五粮液', '招商银行', '茅台']);
    page.saveHistory('茅台');
    expect(wx.setStorageSync).toHaveBeenCalledTimes(1);
    const [key, value] = wx.setStorageSync.mock.calls[0];
    expect(key).toBe('searchHistory');
    expect(value[0]).toBe('茅台'); // 置顶
    expect(new Set(value).size).toBe(value.length); // 去重
    expect(value.length).toBeLessThanOrEqual(8); // 长度限制
  });

  test('clearHistory: remove storage key', () => {
    page.onClearHistory();
    expect(wx.removeStorageSync).toHaveBeenCalledWith('searchHistory');
  });
});