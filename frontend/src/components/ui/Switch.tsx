import clsx from 'clsx';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/** Єдиний перемикач (сповіщення, 3D-режим, шари карти тощо) — замінює всі кастомні чекбокси. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-200 active:scale-95 disabled:opacity-40',
        '[box-shadow:inset_0_1px_3px_rgb(0_0_0_/_0.25)]',
        checked
          ? 'border-white/25 bg-gradient-to-b from-forest-light to-forest shadow-[0_0_14px_-2px_rgb(var(--color-forest-light)/0.55)]'
          : 'border-white/10 bg-ink-text/15 backdrop-blur-sm'
      )}
    >
      <span
        className={clsx(
          'inline-block h-5 w-5 transform rounded-full bg-gradient-to-b from-white to-white/90 [box-shadow:inset_0_1px_0.5px_rgb(255_255_255_/_0.9),0_1px_3px_rgb(0_0_0_/_0.35)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
