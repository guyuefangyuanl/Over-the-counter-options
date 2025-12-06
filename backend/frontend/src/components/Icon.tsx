import type { CSSProperties } from 'react';

type IconProps = {
  name: 'search' | 'chart' | 'bell' | 'star' | 'scan' | 'wallet' | 'home' | 'more';
  size?: 24 | 32;
  color?: string;
  style?: CSSProperties;
};

export default function Icon({ name, size = 24, color = '#1677FF', style }: IconProps) {
  const common = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 2, style };
  switch (name) {
    case 'search':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <polyline points="7,15 10,12 13,14 16,10" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2z" />
          <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <polygon points="12 2 15 9 22 9 17 14 19 22 12 18 5 22 7 14 2 9 9 9" />
        </svg>
      );
    case 'scan':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <polyline points="3,7 3,3 7,3" />
          <polyline points="17,3 21,3 21,7" />
          <polyline points="21,17 21,21 17,21" />
          <polyline points="7,21 3,21 3,17" />
          <rect x="7" y="7" width="10" height="10" rx="2" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <rect x="2" y="6" width="20" height="14" rx="4" />
          <line x1="16" y1="12" x2="20" y2="12" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common} viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    default:
      return null;
  }
}