import { useEffect } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * Синхронізує вибрану в налаштуваннях тему (light / dark / amoled / auto) з
 * атрибутом data-theme на <html>, на якому побудована вся дизайн-система
 * (див. src/styles/tokens.css).
 *
 * 'auto' резолвиться в реальну системну тему через matchMedia і реагує на
 * її зміну наживо (наприклад, коли ОС сама перемикається на нічний режим).
 *
 * Початкове застосування теми відбувається синхронно ще до рендеру React —
 * див. inline-скрипт у index.html — тому цей ефект лише підтримує тему
 * синхронізованою після монтування і не спричиняє миготіння (FOUC).
 */
function resolveTheme(theme: string): 'light' | 'dark' | 'amoled' {
  if (theme === 'auto') {
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark === false ? 'light' : 'dark';
  }
  return theme as 'light' | 'dark' | 'amoled';
}

function applyTheme(theme: string) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
}

export function useThemeSync() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== 'auto' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
