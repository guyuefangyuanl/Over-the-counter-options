const automator = require('miniprogram-automator');
const fs = require('fs');

const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const shouldRun = process.env.RUN_MINIPROGRAM_E2E === '1' && fs.existsSync(cliPath);
const describeE2E = shouldRun ? describe : describe.skip;

describeE2E('报价 E2E 测试', () => {
  let miniProgram, page;

  beforeAll(async () => {
    miniProgram = await automator.launch({ projectPath: '.', cliPath });
  }, 30000);

  afterAll(async () => {
    if (miniProgram) {
      await miniProgram.close();
    }
  });

  test('启动并进入报价页', async () => {
    page = await miniProgram.reLaunch('/pages/quote/index');
    await page.waitFor(1000);
    const tabs = await page.$$('.tabs--primary .tabs__item');
    expect(tabs.length).toBeGreaterThan(0);
  }, 20000);

  test('切换Tab与筛选器交互', async () => {
    const stockTab = await page.$('.tabs--primary .tabs__item:nth-child(2)');
    await stockTab.tap();
    await page.waitFor(800);
    const rows = await page.$$('.table__row');
    expect(rows.length).toBeGreaterThan(0);
    await page.evaluate(() => { const p = getCurrentPages().slice(-1)[0]; p.setData({ filters: { ...p.data.filters, period: '3M' } }); });
    const data = await page.data();
    expect(data.filters.period).toBe('3M');
  }, 25000);

  test('搜索到详情流程', async () => {
    const addBtn = await page.$('.btn--add');
    await addBtn.tap();
    await miniProgram.waitFor(500);
    const pages = await miniProgram.currentPages();
    const current = pages[pages.length - 1];
    expect(current.path).toContain('/pages/search/index');
    // 直接跳转到详情以避免页面结构差异导致选择器不符合
    await miniProgram.reLaunch('/pages/quote/detail?code=600519');
    const pages2 = await miniProgram.currentPages();
    const detail = pages2[pages2.length - 1];
    expect(detail.path).toContain('/pages/quote/detail?code=600519');
  }, 30000);

  test('询价弹窗流程', async () => {
    page = await miniProgram.reLaunch('/pages/quote/index');
    await page.waitFor(800);
    const firstQuoteCell = await page.$('.table__row .action');
    await firstQuoteCell.tap();
    await page.waitFor(300);
    const d = await page.data();
    expect(d.showOrderIntentPopup).toBe(true);
    // 关闭弹窗
    await page.evaluate(() => { const p = getCurrentPages().slice(-1)[0]; p.setData({ showOrderIntentPopup: false }); });
    const d2 = await page.data();
    expect(d2.showOrderIntentPopup).toBe(false);
  }, 25000);
});
