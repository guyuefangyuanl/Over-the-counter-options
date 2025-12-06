import { useEffect, useRef } from 'react';
import gsap from 'gsap';

type Props = {
  children: React.ReactNode;
  ratio?: number; // 视差强度
};

export default function ParallaxSection({ children, ratio = 0.15 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const progress = Math.min(1, Math.max(0, rect.top / viewportH));
      // 使用 GPU 加速的 transform 实现 60fps 视差
      gsap.to(el, { y: (progress - 0.5) * 100 * ratio, duration: 0.2, ease: 'power2.out' });
    };

    // IntersectionObserver 控制激活与节流
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          window.addEventListener('scroll', onScroll, { passive: true });
          onScroll();
        } else {
          window.removeEventListener('scroll', onScroll);
        }
      });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [ratio]);

  return (
    <div ref={ref} className="parallax-layer">
      {children}
    </div>
  );
}