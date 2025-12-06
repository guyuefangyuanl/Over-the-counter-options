import { useEffect, useState } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import Icon from '../components/Icon';
import MarketSwiper from '../components/MarketSwiper';
import ParallaxSection from '../components/ParallaxSection';
import type { ApiState, MarketIndex, Announcement, Stock } from '../types';

export default function Home() {
  const [indices, setIndices] = useState<ApiState<MarketIndex[]>>({ data: null, loading: true, error: null });
  const [announcements, setAnnouncements] = useState<ApiState<Announcement[]>>({ data: null, loading: true, error: null });
  const [hotStocks, setHotStocks] = useState<ApiState<Stock[]>>({ data: null, loading: true, error: null });

  useEffect(() => {
    const load = async () => {
      try {
        setIndices((s) => ({ ...s, loading: true }));
        // TODO: 替换为真实 REST API
        const idx: MarketIndex[] = [
          { code: '000001', name: '上证指数', value: 3200.45, change: 0.56 },
          { code: '399001', name: '深证成指', value: 10500.12, change: -0.34 },
          { code: '399006', name: '创业板指', value: 2100.85, change: 1.12 },
        ];
        setIndices({ data: idx, loading: false, error: null });

        setAnnouncements({
          data: [
            { id: 'a1', title: '交易系统维护公告', timestamp: '2025-11-04 10:00' },
            { id: 'a2', title: '新功能上线通知', timestamp: '2025-11-04 09:00' },
          ],
          loading: false,
          error: null,
        });

        setHotStocks({
          data: [
            { code: '600519', name: '贵州茅台', price: 1610.2, change: 0.85 },
            { code: '300750', name: '宁德时代', price: 210.5, change: -0.45 },
            { code: '601318', name: '中国平安', price: 52.3, change: 1.12 },
          ],
          loading: false,
          error: null,
        });
      } catch (e: any) {
        setIndices({ data: null, loading: false, error: e?.message || '加载失败' });
        setAnnouncements({ data: null, loading: false, error: e?.message || '加载失败' });
        setHotStocks({ data: null, loading: false, error: e?.message || '加载失败' });
      }
    };
    load();
  }, []);

  const actions = [
    { id: 'scan', label: '扫一扫', icon: 'scan' as const },
    { id: 'watchlist', label: '自选', icon: 'star' as const },
    { id: 'market', label: '行情', icon: 'chart' as const },
    { id: 'notifications', label: '公告', icon: 'bell' as const },
  ];

  const onAction = (id: string) => {
    // 按钮交互示例
    console.log('Action:', id);
  };

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      {/* 首屏核心功能区 */}
      <ParallaxSection ratio={0.1}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="search" />
            <input
              placeholder="搜索股票/指数/公告"
              style={{
                flex: 1,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-4)',
                padding: '10px 12px',
              }}
            />
            <Button variant="primary">
              <Icon name="search" color="#fff" />
              搜索
            </Button>
          </div>
        </Card>
      </ParallaxSection>

      <div className="spacer-16" />

      {/* 市场动态卡片区域：swiper + 视差 */}
      <ParallaxSection ratio={0.15}>
        <div className="section-title">市场动态</div>
        {indices.loading && <Card>加载中…</Card>}
        {indices.error && <Card>加载失败：{indices.error}</Card>}
        {indices.data && <MarketSwiper indices={indices.data} />}
      </ParallaxSection>

      <div className="spacer-16" />

      {/* 快捷操作 */}
      <ParallaxSection ratio={0.1}>
        <div className="section-title">快捷操作</div>
        <Card className="grid grid-2">
          {actions.map((a) => (
            <Button key={a.id} onClick={() => onAction(a.id)}>
              <Icon name={a.icon} />
              {a.label}
            </Button>
          ))}
        </Card>
      </ParallaxSection>

      <div className="spacer-16" />

      {/* 公告与热门股票：卡片式布局，留白充足 */}
      <div className="grid">
        <ParallaxSection ratio={0.08}>
          <div className="section-title">最新公告</div>
          <Card>
            {announcements.loading && <div className="muted">加载中…</div>}
            {announcements.error && <div>加载失败：{announcements.error}</div>}
            {announcements.data && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {announcements.data.map((a) => (
                  <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{a.timestamp}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </ParallaxSection>

        <ParallaxSection ratio={0.08}>
          <div className="section-title">热门股票</div>
          <Card>
            {hotStocks.loading && <div className="muted">加载中…</div>}
            {hotStocks.error && <div>加载失败：{hotStocks.error}</div>}
            {hotStocks.data && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {hotStocks.data.map((s) => (
                  <div key={s.code}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 12 }} className="muted">{s.code}</div>
                    <div style={{ marginTop: 8, fontWeight: 700 }}>{s.price.toFixed(2)}</div>
                    <div style={{ color: s.change >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                      {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </ParallaxSection>
      </div>

      <div className="spacer-32" />

      {/* 次要功能采用折叠式设计：示例 */}
      <details>
        <summary className="section-title">更多功能</summary>
        <Card>
          <div className="grid">
            <Button><Icon name="wallet" />资金管理</Button>
            <Button><Icon name="home" />资产总览</Button>
            <Button><Icon name="more" />更多</Button>
          </div>
        </Card>
      </details>
    </div>
  );
}