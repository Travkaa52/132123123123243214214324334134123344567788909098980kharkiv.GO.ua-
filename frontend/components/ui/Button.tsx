import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Іконка зліва від тексту */
  icon?: ReactNode;
  /** Іконка справа від тексту */
  iconRight?: ReactNode;
  /** Стан завантаження (блокує кнопку та показує анімований спінер) */
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'relative bg-gradient-to-b from-forest-light to-forest text-white shadow-glass border border-white/25 [box-shadow:inset_0_1px_0.5px_rgb(255_255_255_/_0.45),inset_0_-10px_16px_-12px_rgb(0_0_0_/_0.25),var(--shadow-glass)] hover:brightness-[1.06] active:brightness-95 focus-visible:ring-forest',
  secondary:
    'glass-surface text-ink-text hover:border-gold/50 hover:brightness-[1.05] active:brightness-95 focus-visible:ring-gold',
  ghost:
    'bg-transparent text-ink-text hover:bg-surface-soft/60 active:bg-surface-raised/60 focus-visible:ring-primary',
  danger:
    'bg-red-500/10 text-red-500 border border-red-500/20 backdrop-blur-md hover:bg-red-500/20 active:bg-red-500/30 focus-visible:ring-red-500'
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 text-body-sm gap-1.5 rounded-md text-xs',
  md: 'h-11 px-4 text-body gap-2 rounded-lg text-sm',
  lg: 'h-14 px-6 text-title gap-2.5 rounded-2xl text-base'
};

const iconSizes: Record<Size, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5'
};

/**
 * Універсальна кнопка застосунку із підтримкою варіантів дизайну,
 * іконок, станів завантаження та високою доступністю (a11y).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      icon,
      iconRight,
      isLoading = false,
      fullWidth = false,
      className,
      children,
      disabled,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center font-display font-semibold transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          !isDisabled && 'active:scale-[0.96] active:duration-75',
          'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        {...rest}
      >
        {/* Спінер завантаження або ліва іконка */}
        {isLoading ? (
          <Loader2 className={clsx('animate-spin shrink-0', iconSizes[size])} />
        ) : icon ? (
          <span className="shrink-0 flex items-center justify-center">{icon}</span>
        ) : null}

        {/* Текст кнопки */}
        {children && <span>{children}</span>}

        {/* Права іконка (приховується під час завантаження) */}
        {!isLoading && iconRight && (
          <span className="shrink-0 flex items-center justify-center">{iconRight}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
