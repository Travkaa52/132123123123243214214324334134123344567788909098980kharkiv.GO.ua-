import { memo, useLayoutEffect, useState } from 'react';
import clsx from 'clsx';
import { TRANSPORT_COLORS } from '@/config/map';
import type { TransportKind } from '@/types/transport';

export interface RouteDisplayProps {
  kind: TransportKind;
  routeNumber: string;
  headsign: string;
  /** Масштаб відносно базового розміру табло (напр. при наближенні карти). */
  scale?: number;
  compact?: boolean;
}

const MARQUEE_THRESHOLD_CH = 12; // Поріг увімкнення біжучого рядка

/**
 * Маршрутне LED-табло транспорту.
 * Малюється програмно поверх маркера: номер маршруту виділяється фірмовим кольором,
 * а кінцева зупинка відображається у стилі бурштинового електронного табло.
 */
function RouteDisplayComponent({
  kind,
  routeNumber,
  headsign,
  scale = 1,
  compact = false
}: RouteDisplayProps) {
  const [needsMarquee, setNeedsMarquee] = useState(false);
  const color = TRANSPORT_COLORS[kind] ?? '#2B2F31';

  useLayoutEffect(() => {
    setNeedsMarquee(headsign.length > MARQUEE_THRESHOLD_CH);
  }, [headsign]);

  const boardWidth = compact ? 68 : 92;

  return (
    <div
      className="pointer-events-none flex select-none flex-col items-center gap-1 rounded-lg border border-white/20 bg-zinc-950/90 px-1.5 py-1 shadow-2xl backdrop-blur-md transition-transform duration-150 will-change-transform"
      style={{
        width: `${boardWidth}px`,
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center'
      }}
      aria-hidden="true"
    >
      {/* Бейдж із номером маршруту у фірмовому кольорі */}
      <div
        className="flex items-center justify-center rounded px-1.5 py-0.5 font-display text-[10px] font-black leading-none text-white shadow-sm"
        style={{ backgroundColor: color }}
      >
        {routeNumber}
      </div>

      {/* Електронне LED-табло напрямку */}
      <div className="w-full overflow-hidden">
        {needsMarquee ? (
          <div className="flex w-max animate-marquee whitespace-nowrap text-[8.5px] font-bold leading-tight text-ink-text">
            <span className="pr-4">{headsign}</span>
            <span className="pr-4" aria-hidden="true">
              {headsign}
            </span>
          </div>
        ) : (
          <span
            className={clsx(
              'block w-full text-center text-[8.5px] font-bold leading-tight text-ink-text',
              'line-clamp-2 break-words'
            )}
          >
            {headsign}
          </span>
        )}
      </div>
    </div>
  );
}

export const RouteDisplay = memo(RouteDisplayComponent);
