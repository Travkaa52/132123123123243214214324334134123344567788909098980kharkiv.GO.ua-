import { useEffect, useState } from 'react';

const MIN_SPLASH_MS = 2200; // довший, "фірмовий" сплеш — встигає повністю програти вхід гербу, кілець і тексту
const MAX_SPLASH_MS = 6000; // запобіжник: якщо fonts.ready зависне (рідкісний edge case браузера) — не тримаємо користувача вічно

/**
 * true, поки застосунок ще не готовий до показу: чекаємо завантаження
 * шрифтів (щоб не було стрибка тексту/FOUT) і витримуємо мінімальну
 * тривалість сплеша, щоб анімація не обрізалась на швидких пристроях.
 */
export function useAppReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = performance.now();

    const finish = () => {
      if (cancelled) return;
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => !cancelled && setReady(true), wait);
    };

    const fontsReady = typeof document !== 'undefined' && 'fonts' in document ? document.fonts.ready : Promise.resolve();
    const safety = new Promise<void>((resolve) => window.setTimeout(resolve, MAX_SPLASH_MS));

    Promise.race([fontsReady, safety]).then(finish);

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
