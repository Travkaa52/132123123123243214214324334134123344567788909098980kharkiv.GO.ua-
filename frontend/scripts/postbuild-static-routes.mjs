import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Чому це потрібно.
 * -----------------------------------------------------------------------
 * Це односторінковий (SPA) застосунок на React Router — маршрут
 * "/install-app" реально існує лише в JS (client-side routing) і
 * рендериться ПІСЛЯ того, як в браузер завантажиться index.html.
 *
 * Але сторінку встановлення навмисно відкривають ЖОРСТКИМ переходом у
 * НОВІЙ вкладці зовнішнього браузера (openInExternalBrowser, кнопка в
 * профілі) — а не переходом усередині вже запущеного React-застосунку.
 * Це означає СПРАВЖНІЙ HTTP-запит до хостингу на шлях .../install-app,
 * а не client-side навігацію.
 *
 * На статичному хостингу (GitHub Pages) фізичного файлу за цим шляхом
 * нема — сервер повертає 404. У проекті вже є трюк spa-github-pages
 * (public/404.html + скрипт у index.html), який мав би це виправляти,
 * але він крихкий: залежить від того, як саме хостинг віддає 404.html,
 * від Service Worker (NetworkFirst-перехоплення навігацій у sw.ts) і
 * від query-string-редиректу, що на деяких хостингах/проксі губиться.
 *
 * Надійніше рішення — після білда просто СКОПІЮВАТИ index.html у
 * dist/install-app/index.html. Шляхи до ассетів у index.html завжди
 * АБСОЛЮТНІ (містять base, напр. /kharkiv.GO.ua/assets/...), тож копія
 * коректно працює на будь-якій глибині шляху. В результаті:
 *  - GET /install-app/      -> 200, реальний index.html (не 404-трюк)
 *  - GET /install-app       -> також 200 на GitHub Pages/Netlify (вони
 *    самі домовляють "папка без слеша" -> "папка/index.html")
 * а вже сам React Router у завантаженому index.html бачить справжній
 * шлях /install-app і рендерить потрібну сторінку — без стрибків через
 * query-string і без залежності від 404.html.
 *
 * Додавати сюди новий шлях — якщо в майбутньому з'явиться ще одна
 * сторінка, яку теж відкриватимуть прямим переходом ззовні застосунку.
 */
const ROUTES_NEEDING_DIRECT_LOAD = ['install-app'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const indexHtml = join(distDir, 'index.html');

if (!existsSync(indexHtml)) {
  console.error('[postbuild-static-routes] dist/index.html не знайдено — пропущено (запускати після vite build).');
  process.exit(0);
}

for (const route of ROUTES_NEEDING_DIRECT_LOAD) {
  const targetDir = join(distDir, route);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(indexHtml, join(targetDir, 'index.html'));
  console.log(`[postbuild-static-routes] dist/${route}/index.html створено з index.html`);
}
