import { type HTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md';
}

const paddings = { none: '', sm: 'p-3', md: 'p-4' };

/**
 * Єдина картка застосунку (маршрути, зупинки, налаштування, обране тощо).
 * Раніше кожен екран мав свою комбінацію rounded / bg / shadow класів — тепер це один компонент.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive, padding = 'md', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={clsx(
        'glass-card rounded-lg shadow-glass',
        paddings[padding],
        interactive &&
          'transition-all duration-150 active:scale-[0.98] cursor-pointer hover:border-gold/40 hover:brightness-[1.04]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';
