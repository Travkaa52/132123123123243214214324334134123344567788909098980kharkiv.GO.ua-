import { memo, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Train } from 'lucide-react';
import { useMetroSimulation } from '@/hooks/useMetroSimulation';
import type { MetroRenderFrame } from '@/metro/MetroRenderer';

interface ScreenFrame {
  frame: MetroRenderFrame;
  x: number;
  y: number;
}

interface MetroLayerProps {
  /** Інстанс MapLibre-карти. */
  map: MapLibreMap | null;
  /** Показувати шар метро — керується панеллю фільтрів. */
  visible: boolean;
  selectedTrainId?: string | null;
  onTrainSelect?: (trainId: string) => void;
}

/**
 * Шар потягів метро на карті з проекцією геокоординат у пікселі екрана.
 */
export function MetroLayer({ map, visible, selectedTrainId, onTrainSelect }: MetroLayerProps) {
  const frames = useMetroSimulation();
  const [screenFrames, setScreenFrames] = useState<ScreenFrame[]>([]);
  const framesRef = useRef(frames);
  framesRef.current = frames;

  // Синхронізація проєкції координат з кадрами анімації та рухом карти (Viewport Culling + rAF)
  useEffect(() => {
    if (!map) {
      setScreenFrames([]);
      return;
    }

    let rafId: number | null = null;
    const CULL_PADDING_PX = 100;

    function project() {
      rafId = null;
      if (!map) return;

      const canvas = map.getCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const next: ScreenFrame[] = [];

      for (const frame of framesRef.current) {
        const point = map.project([frame.snapshot.position.lng, frame.snapshot.position.lat]);

        // Пропускаємо потяги поза видимою зоною екрана
        if (
          point.x < -CULL_PADDING_PX ||
          point.y < -CULL_PADDING_PX ||
          point.x > w + CULL_PADDING_PX ||
          point.y > h + CULL_PADDING_PX
        ) {
          continue;
        }

        next.push({ frame, x: point.x, y: point.y });
      }

      setScreenFrames(next);
    }

    function scheduleProject() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(project);
    }

    scheduleProject();
    map.on('move', scheduleProject);

    return () => {
      map.off('move', scheduleProject);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [map, frames]);

  if (!visible || !map) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden={screenFrames.length === 0}>
      {screenFrames.map(({ frame, x, y }) => (
        <MetroTrainMarker
          key={frame.snapshot.id}
          frame={frame}
          x={x}
          y={y}
          selected={selectedTrainId === frame.snapshot.id}
          onClick={onTrainSelect ? () => onTrainSelect(frame.snapshot.id) : undefined}
        />
      ))}
    </div>
  );
}

interface MetroTrainMarkerProps {
  frame: MetroRenderFrame;
  x: number;
  y: number;
  selected: boolean;
  onClick?: () => void;
}

/**
 * Маркер потяга метро з лінійним неоновим світінням та скляним тултипом для обраного потяга.
 */
const MetroTrainMarker = memo(function MetroTrainMarker({ frame, x, y, selected, onClick }: MetroTrainMarkerProps) {
  const { snapshot } = frame;
  const isDwell = snapshot.phase === 'dwell';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Метро, лінія ${snapshot.lineNumber}, прямує до ${snapshot.headsign}, ${Math.round(snapshot.speedKmh)} км/год`}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 select-none transition-[left,top] duration-100 ease-linear will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ left: x, top: y, opacity: frame.opacity, zIndex: selected ? 30 : 20 }}
    >
      <div className="relative flex flex-col items-center gap-1.5">
        <div
          data-placeholder="metro-train"
          className={[
            'relative flex items-center justify-center rounded-full border-2 border-white/90 font-display text-[11px] font-bold text-white transition-all duration-200 active:scale-95',
            isDwell ? 'animate-pulse' : ''
          ].join(' ')}
          style={{
            width: selected ? 32 : 26,
            height: selected ? 32 : 26,
            backgroundColor: snapshot.lineColor,
            boxShadow: `0 0 12px ${snapshot.lineColor}80`,
            transform: `scale(${selected ? 1.15 : 1})`
          }}
        >
          {/* Стрілка напрямку руху */}
          {!isDwell && (
            <span
              className="absolute -top-2.5 h-2.5 w-2.5 transition-transform duration-200"
              style={{ transform: `rotate(${snapshot.headingDeg}deg)`, transformOrigin: '50% 15px' }}
            >
              <span
                className="block h-full w-full"
                style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', backgroundColor: snapshot.lineColor }}
              />
            </span>
          )}

          <span className="drop-shadow-sm">{snapshot.lineNumber.replace(/^M/, '')}</span>
        </div>

        {/* Скляна картка детальної інформації при виборі */}
        {selected && (
          <div className="flex flex-col items-center rounded-xl border border-border/60 bg-surface/95 px-3 py-1.5 text-center shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
            <span className="font-display text-[11px] font-bold text-ink-text flex items-center gap-1 whitespace-nowrap">
              <Train className="h-3 w-3 text-primary" />
              {snapshot.lineNumber} → {snapshot.headsign}
            </span>
            <span className="text-[10px] text-ink-muted whitespace-nowrap">
              {isDwell ? 'На станції' : `${Math.round(snapshot.speedKmh)} км/год`} · далі: {snapshot.nextStation.name}
            </span>
          </div>
        )}
      </div>
    </button>
  );
});
