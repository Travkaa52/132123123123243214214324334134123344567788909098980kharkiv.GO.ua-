import { useEffect, useState } from 'react';

/**
 * ВАЖЛИВО, чесно і без ілюзій:
 * Це НЕ захист від крадіжки коду. Будь-який JS, що виконується в браузері,
 * фізично завантажений на пристрій користувача — його завжди можна
 * переглянути через вкладку Network, консоль іншого браузера, curl тощо.
 * Це лише СТРИМУВАЧ від випадкового/цікавого клацання правою кнопкою чи
 * F12 звичайним користувачем. Технічно підкований відвідувач обходить це
 * за секунди (інший браузер, вимкнений JS перед завантаженням сторінки,
 * розширення, режим читання тощо).
 *
 * Що робить:
 * - блокує контекстне меню (правий клік);
 * - блокує типові гарячі клавіші відкриття DevTools/перегляду коду
 *   (F12, Ctrl/Cmd+Shift+I/J/C, Ctrl/Cmd+U);
 * - евристично визначає, що DevTools, ймовірно, відкриті (за різницею
 *   розмірів вікна для докованого режиму), і показує оверлей-попередження.
 */

const BLOCKED_KEY_COMBOS: Array<(e: KeyboardEvent) => boolean> = [
  (e) => e.key === 'F12',
  (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i'].includes(e.key),
  (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ['J', 'j'].includes(e.key),
  (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && ['C', 'c'].includes(e.key),
  (e) => (e.ctrlKey || e.metaKey) && ['U', 'u'].includes(e.key),
  (e) => (e.ctrlKey || e.metaKey) && ['S', 's'].includes(e.key)
];

const SIZE_THRESHOLD_PX = 160;

export function useDevToolsGuard(enabled = true) {
  const [suspectedOpen, setSuspectedOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (BLOCKED_KEY_COMBOS.some((test) => test(e))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown, true);

    // Евристика докованих DevTools: коли панель відкрита в тому ж вікні,
    // видима область (inner) помітно менша за розмір вікна (outer).
    // НЕ спрацьовує на: DevTools в окремому вікні, повноекранний режим на
    // мобільних, деякі варіанти "responsive design mode" — тому це саме
    // "ймовірно", а не гарантія.
    let raf: number;
    const check = () => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      setSuspectedOpen(widthDiff > SIZE_THRESHOLD_PX || heightDiff > SIZE_THRESHOLD_PX);
      raf = window.setTimeout(check, 1000) as unknown as number;
    };
    check();

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown, true);
      clearTimeout(raf);
    };
  }, [enabled]);

  return suspectedOpen;
}
