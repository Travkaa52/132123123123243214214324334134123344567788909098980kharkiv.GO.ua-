import { type ReactNode, useEffect, useState } from 'react';

/**
 * Обгортка для анімації переходу між розділами застосунку.
 *
 * Раніше <Routes> просто миттєво підміняв один компонент іншим — жодної
 * анімації переходу між розділами не було взагалі (на відміну від модалок
 * і шторок, які тягнуться знизу). Ключуємо контейнер по pathname: React
 * розмонтовує попередню сторінку й монтує нову з нуля, і саме в цей момент
 * граємо коротку CSS-анімацію (opacity + translateY, лише GPU-властивості,
 * тому лишається плавною навіть на 120 Гц дисплеях).
 *
 * Людям з prefers-reduced-motion анімацію вимикаємо повністю.
 */
export function PageTransition({ pathKey, children }: { pathKey: string; children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <div key={pathKey} className={reduceMotion ? undefined : 'animate-page-in will-change-transform'}>
      {children}
    </div>
  );
}
