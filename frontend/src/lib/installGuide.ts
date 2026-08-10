/**
 * Посилання на окрему сторінку-гайд встановлення PWA (`/install-app`).
 *
 * Обов'язково враховуємо BASE_URL (Vite `base`): на GitHub Pages застосунок
 * живе не в корені домену, а в `/<repo>/`, тож `origin + '/install-app'`
 * вів би на неіснуючий шлях і сторінка виглядала б "не працює" (404 на
 * хостингу).
 */
export function getInstallGuideUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${window.location.origin}${base}install-app`;
}
