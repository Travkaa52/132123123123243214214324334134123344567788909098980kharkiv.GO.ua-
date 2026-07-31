import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

const sizes = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-14 w-14' };

/** Кругла кнопка з іконкою — GPS, режим карти, закрити тощо. Один стиль на весь застосунок. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', active, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'glass-surface inline-flex items-center justify-center rounded-full shadow-glass transition-all duration-150 active:scale-90',
        active ? 'text-gold' : 'text-ink-text',
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
);
IconButton.displayName = 'IconButton';
