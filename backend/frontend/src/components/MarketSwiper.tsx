import { useEffect, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import type { MarketIndex } from '../types';

type Props = {
  indices: MarketIndex[];
};

export default function MarketSwiper({ indices }: Props) {
  const swiperRef = useRef<any>(null);

  useEffect(() => {
    // 确保 5s 自动切换，同时支持手动滑动
    if (swiperRef.current) {
      // 预留未来控制接口
    }
  }, []);

  return (
    <Swiper
      modules={[Autoplay, Pagination]}
      autoplay={{ delay: 5000, disableOnInteraction: false }}
      pagination={{ clickable: true }}
      onSwiper={(s) => { swiperRef.current = s; }}
      style={{ borderRadius: 'var(--radius-4)' }}
    >
      {indices.map((m) => (
        <SwiperSlide key={m.code}>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="section-title">{m.name}</div>
              <div className="muted">代码：{m.code}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{m.value.toFixed(2)}</div>
              <div style={{ color: m.change >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                {m.change >= 0 ? '+' : ''}{m.change.toFixed(2)}%
              </div>
            </div>
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}