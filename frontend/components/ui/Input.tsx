import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

/** Візуальні варіанти інпуту */
export const inputVariants = cva(
  cn(
    'w-full rounded-[16px] border border-border/40 bg-surface-soft px-4 py-3.5',
    'text-sm font-semibold text-ink-text outline-none',
    'placeholder:text-ink-muted',
    'transition-all duration-200',
    'disabled:cursor-not-allowed disabled:opacity-50'
  ),
  {
    variants: {
      variant: {
        default: 'focus:border-primary/50 focus:ring-primary/10',
        error: 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/10',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
  VariantProps<typeof inputVariants> & { label?: string };

/**
 * Єдиний інпут для форм (пошук, реєстрація, звіти про затримки).
 * Shadcn/ui styled з підтримкою label та станів помилки.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, label, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputVariants({ variant }), className)}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';
Input.displayName = 'Input';

// forwardRef import
import { forwardRef } from 'react';
