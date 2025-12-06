import type { PropsWithChildren, HTMLAttributes } from 'react';

export default function Card({ children, className = '', ...rest }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}