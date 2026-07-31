/**
 * Будує URL до файлу з /public з урахуванням Vite `base` (import.meta.env.BASE_URL).
 *
 * На GitHub Pages проєкт живе не в корені домену, а за шляхом /<repo-name>/
 * (див. vite.config.ts: BASE_PATH). Якщо десь у коді захардкодити шлях на
 * кшталт "/sprites/metro.jpg", у проді він резолвиться у КОРІНЬ ДОМЕНУ
 * замість /<repo-name>/sprites/metro.jpg — файл віддасть 404, і картинка/спрайт
 * просто не покажеться (хоча локально на "npm run dev" все working, бо там
 * base === "/"). Тому будь-яке публічне зображення варто пропускати через
 * цю функцію, а не писати абсолютний шлях напряму.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${cleanBase}${cleanPath}`;
}
