import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export const textareaVariants = cva(
  cn(
    'w-full resize-none rounded-[16px] border border-border/40 bg-surface-soft px-4 py-3.5',
    'text-sm font-semibold text-ink-text outline-none',
    'placeholder:text-ink-muted',
    'transition-all duration-200',
    'focus:border-primary/50 focus:ring-4 focus:ring-primary/10',
    'disabled:cursor-not-allowed disabled:opacity-50'
  ),
  {
    variants: {
      variant: {
        default: 'border-border/40',
        error: 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/10',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants> & { label?: string };

/**
 * Єдиний textarea для форм (коментарі, повідомлення).
 * Shadcn/ui styled з підтримкою label та станів помилки.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, label, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(textareaVariants({ variant }), className)}
          {...props}
        />
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
