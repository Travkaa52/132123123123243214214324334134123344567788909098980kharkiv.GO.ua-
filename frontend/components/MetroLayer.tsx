import { memo, useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Train } from 'lucide-react';
import { useMetroSimulation } from '@/hooks/useMetroSimulation';
import type { MetroRenderFrame } from '@/metro/MetroRenderer';
import { TransportSprite } from '@/components/TransportSprite';
import { METRO_LINE_SPRITES, TRANSPORT_SPRITES } from '@/config/transportSprites';

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
    <div
      className="pointer-events-none absolute h-0 w-0 transition-[left,top] duration-100 ease-linear will-change-transform"
      style={{ left: x, top: y, opacity: frame.opacity, zIndex: selected ? 30 : 20 }}
    >
      {/* Реальний спрайт потяга (сам себе центрує через translate(-50%,-50%) відносно left:0/top:0) */}
      <TransportSprite
        kind="metro"
        routeNumber={snapshot.lineNumber.replace(/^M/, '')}
        headsign={snapshot.headsign}
        heading={snapshot.headingDeg}
        speedKmh={snapshot.speedKmh}
        x={0}
        y={0}
        state={isDwell ? 'stopped' : 'moving'}
        selected={selected}
        onClick={onClick}
        spriteConfig={METRO_LINE_SPRITES[snapshot.lineId] ?? TRANSPORT_SPRITES.metro}
      />

      {/* Кольоровий бейдж лінії над спрайтом */}
      <div
        className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 rounded-full border-2 border-white/90 px-1.5 py-0.5 font-display text-[9px] font-bold leading-none text-white shadow"
        style={{ backgroundColor: snapshot.lineColor, transform: `translate(-50%, -${(selected ? 32 : 26) + 14}px)` }}
      >
        {snapshot.lineNumber.replace(/^M/, '')}
      </div>

      {/* Скляна картка детальної інформації при виборі */}
      {selected && (
        <div
          className="pointer-events-none absolute left-0 top-0 flex -translate-x-1/2 translate-y-4 flex-col items-center whitespace-nowrap rounded-xl border border-border/60 bg-surface/95 px-3 py-1.5 text-center shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
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
  );
});
