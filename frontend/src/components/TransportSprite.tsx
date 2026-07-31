import { memo } from 'react';
import { TRANSPORT_COLORS } from '@/config/map';
import { TRANSPORT_SPRITES } from '@/config/transportSprites';
import { useSpriteImage } from '@/hooks/useSpriteImage';
import { computeSpriteGeometry, pickFrameIndex } from '@/lib/sprite';
import { RouteDisplay } from '@/components/RouteDisplay';
import type { TransportKind, VehicleState } from '@/types/transport';

export interface TransportSpriteProps {
  kind: TransportKind;
  routeNumber: string;
  headsign: string;
  heading: number; // градуси, 0 = північ
  speedKmh: number;
  x: number; // пікселі на екрані (проекція координат вже виконана батьком)
  y: number;
  state: VehicleState;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Універсальний компонент транспортного маркера на карті.
 *
 * - Автоматично підвантажує потрібний PNG Sprite Sheet за видом транспорту
 *   (один лист на модель, з /src/config/transportSprites.ts).
 * - Вибирає кадр за напрямком руху (frames-режим) або плавно обертає
 *   єдиний кадр через CSS transform (continuous-режим) — залежно від
 *   конфігурації конкретного листа.
 * - Масштабується через displaySize у конфігурації.
 * - Поки PNG не додано (або він не завантажився) — показує акуратний
 *   геометричний фолбек, щоб карта лишалась повністю функціональною.
 * - Маршрутне табло малюється окремим компонентом <RouteDisplay />
 *   поверх спрайту, а не є частиною зображення.
 */
function TransportSpriteComponent({
  kind,
  routeNumber,
  headsign,
  heading,
  speedKmh,
  x,
  y,
  state,
  selected = false,
  onClick
}: TransportSpriteProps) {
  const config = TRANSPORT_SPRITES[kind];
  const imageState = useSpriteImage(config.src);
  const spriteReady = imageState === 'loaded';

  const frameIndex = pickFrameIndex(heading, config);
  const geometry = computeSpriteGeometry(config, frameIndex, heading);
  const color = TRANSPORT_COLORS[kind] ?? '#2B2F31';
  const isOffline = state === 'offline';
  const isStopped = state === 'stopped';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${kind} №${routeNumber}, прямує до ${headsign}, ${Math.round(speedKmh)} км/год`}
      className={[
        'absolute left-0 top-0 select-none',
        'will-change-transform',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold'
      ].join(' ')}
      style={{
        // translate3d замість left/top: браузер рухає елемент лише в compositor-шарі
        // (GPU), без layout/paint усього документа на кожен кадр анімації —
        // це і прибирає джанк при великій кількості машин на екрані.
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`,
        zIndex: selected ? 30 : 20
      }}
    >
      <div className="relative flex flex-col items-center gap-1">
        {spriteReady ? (
          <div
            data-sprite={kind}
            className={[
              'transition-transform duration-300 ease-out',
              isOffline ? 'opacity-40 grayscale' : '',
              isStopped ? 'animate-pulse-soft' : ''
            ].join(' ')}
            style={{
              width: geometry.displayWidth,
              height: geometry.displayHeight,
              backgroundImage: `url(${config.src})`,
              backgroundSize: geometry.backgroundSize,
              backgroundPosition: geometry.backgroundPosition,
              backgroundRepeat: 'no-repeat',
              transform: `rotate(${geometry.cssRotationDeg}deg) scale(${selected ? 1.15 : 1})`,
              filter: selected ? 'drop-shadow(0 0 6px rgba(201,162,75,0.8))' : undefined
            }}
          />
        ) : (
          // Фолбек, поки власник проєкту не додав /public/sprites/{kind}.png
          <div
            data-placeholder="transport-sprite"
            data-kind={kind}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-full border-2 border-white',
              'font-display text-[11px] font-bold text-white shadow-glass transition-transform duration-300',
              isOffline ? 'opacity-40 grayscale' : '',
              isStopped ? 'animate-pulse-soft' : ''
            ].join(' ')}
            style={{ backgroundColor: color, transform: `scale(${selected ? 1.15 : 1})` }}
          >
            <span style={{ transform: `rotate(${heading}deg)` }} className="absolute -top-2 h-2 w-2">
              <span
                className="block h-full w-full"
                style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', backgroundColor: color }}
              />
            </span>
            {routeNumber}
          </div>
        )}

        <RouteDisplay kind={kind} routeNumber={routeNumber} headsign={headsign} compact={!selected} />
      </div>
    </button>
  );
}

export const TransportSprite = memo(TransportSpriteComponent);
