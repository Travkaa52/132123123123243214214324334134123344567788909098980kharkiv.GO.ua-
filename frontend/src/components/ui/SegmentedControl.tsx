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
      className={clsx('relative flex rounded-md bg-surface-soft/70 p-1 [box-shadow:inset_0_1px_3px_rgb(0_0_0_/_0.12)]', className)}
      role="tablist"
    >
      {/* Пігулка-індикатор: одна спільна поверхня, що ковзає — а не перефарбовування кожної кнопки окремо */}
      <div
        aria-hidden
        className="glass-card shadow-glass pointer-events-none absolute inset-y-1 rounded-[10px] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
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
            'relative z-10 flex-1 rounded-[10px] px-2 py-2 text-body-sm font-display font-semibold transition-all duration-200',
            value === opt.value ? 'scale-100 text-forest' : 'scale-95 text-ink-muted hover:text-ink-text hover:scale-100'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
