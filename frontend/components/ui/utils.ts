import { type VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Варіанти кнопки у стилі shadcn/ui.
 * Адаптовано під бренд Kharkiv GO: primary = forest, accent = gold.
 */
export const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 font-display font-semibold',
    'rounded-lg transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
    'outline-none select-none',
    'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    'disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none',
    'active:scale-[0.96] active:duration-75'
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'relative bg-gradient-to-b from-forest-light to-forest text-white',
          'shadow-glass border border-white/25',
          '[box-shadow:inset_0_1px_0.5px_rgb(255_255_255_/_0.45),inset_0_-10px_16px_-12px_rgb(0_0_0_/_0.25),var(--shadow-glass)]',
          'hover:brightness-[1.06] active:brightness-95',
          'focus-visible:ring-forest'
        ),
        secondary: cn(
          'glass-surface text-ink-text',
          'hover:border-gold/50 hover:brightness-[1.05] active:brightness-95',
          'focus-visible:ring-gold'
        ),
        ghost: cn(
          'bg-transparent text-ink-text',
          'hover:bg-surface-soft/60 active:bg-surface-raised/60',
          'focus-visible:ring-primary'
        ),
        danger: cn(
          'bg-red-500/10 text-red-500 border border-red-500/20',
          'hover:bg-red-500/20 active:bg-red-500/30',
          'focus-visible:ring-red-500'
        ),
      },
      size: {
        sm: 'h-9 px-3 text-xs rounded-md gap-1.5',
        md: 'h-11 px-4 text-sm rounded-lg gap-2',
        lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
