import emblemUrl from '@/assets/emblem/kharkiv-coa.webp';
import clsx from 'clsx';

interface EmblemProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * Герб Харкова — фірмовий елемент застосунку. Використовується на сплеші,
 * в профілі, налаштуваннях та порожніх станах, щоб застосунок одразу
 * читався як офіційний харківський транспортний продукт.
 */
export function Emblem({ size = 96, className, glow }: EmblemProps) {
  return (
    <img
      src={emblemUrl}
      width={size}
      height={size * 1.25}
      alt="Герб Харкова"
      className={clsx(glow && 'drop-shadow-[0_0_24px_rgba(198,165,82,0.35)]', className)}
    />
  );
}
