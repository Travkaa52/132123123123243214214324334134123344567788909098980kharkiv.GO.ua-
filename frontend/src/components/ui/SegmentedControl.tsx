import clsx from 'clsx';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Сегментований перемикач (тема, мова, одиниці виміру) — один компонент для всіх виборів у Settings.
 *
 * Замінює миттєвий стрибок підсвітки на живий "плаваючий" індикатор:
 * одна абсолютно позиційована "пігулка" ковзає між сегментами через
 * transform (не left/top — GPU-композиція, без reflow), з пружинистою
 * кривою прискорення замість лінійної. Активний label теж злегка
 * підважується (scale), щоб перемикання відчувалось тактильним.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, className }: SegmentedControlProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const segmentPercent = 100 / options.length;

  return (
    <div
      className={clsx('relative flex rounded-xl border border-border/60 bg-surface-soft p-1', className)}
      role="tablist"
    >
      {/* Пігулка-індикатор: суцільна заливка кольором primary, що ковзає між сегментами */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 rounded-lg bg-primary shadow-[0_1px_4px_rgb(0_0_0_/_0.18)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          width: `calc(${segmentPercent}% - 4px)`,
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))`,
          left: '2px'
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            'relative z-10 flex-1 rounded-lg px-2 py-2 text-body-sm font-display font-semibold transition-colors duration-200',
            value === opt.value ? 'text-primary-foreground' : 'text-ink-muted hover:text-ink-text'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
