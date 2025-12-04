import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'default';
};

export default function Button({ children, variant = 'default', className = '', ...rest }: PropsWithChildren<ButtonProps>) {
  const classes = `btn ${variant === 'primary' ? 'btn-primary' : ''} ${className}`;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}