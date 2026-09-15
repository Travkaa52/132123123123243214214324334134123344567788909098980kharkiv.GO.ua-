import clsx from 'clsx';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * Кнопка перемикання 2D/3D режиму карти. Живе перемикає нахил камери
 * та видимість об'ємних будівель у <MapView /> (див. useSettingsStore.is3DMode) —
 * без перезавантаження карти чи стилю.
 */
export function MapModeButton() {
  const is3D = useSettingsStore((s) => s.is3DMode);
  const toggle3D = useSettingsStore((s) => s.toggle3DMode);

  return (
    <button
      type="button"
      onClick={toggle3D}
      aria-label={is3D ? 'Перемкнути на 2D-вигляд' : 'Перемкнути на 3D-вигляд'}
      aria-pressed={is3D}
      className={clsx(
        'glass-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-glass transition',
        'hover:scale-105 active:scale-95 font-display text-[11px] font-extrabold text-primary'
      )}
    >
      {is3D ? '3D' : '2D'}
    </button>
  );
}
