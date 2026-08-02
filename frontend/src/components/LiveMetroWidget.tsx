import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BUILT_LINES,
  formatEtaCountdown,
  getActiveTrains,
  getUpcomingArrivalsForStation
} from '@/liveMetro/liveMetroEngine';
import { METRO_STATION_GEO, haversineMeters } from '@/liveMetro/metroStationsGeo';
import { schematicStationId } from '@/liveMetro/stationIdMap';
import type { GeoPoint } from '@/types/transport';

interface LiveMetroWidgetProps {
  userPosition: GeoPoint | null;
}

/** Форматування відстані в метрах або кілометрах */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

/**
 * Обчислення відсоткової позиції потяга на візуальній колії (0% ... 100%).
 * 50% — потяг прямо на станції.
 * < 50% — під'їжджає (від 0% до 50% за 180 сек).
 * > 50% — від'їжджає від станції.
 */
function calculateTrainPositionOnTrack(etaSec: number): number {
  if (etaSec <= 0 && etaSec >= -20) {
    // На станції (у межах 20 сек)
    return 50;
  }
  if (etaSec > 0) {
    // Під'їжджає: за 3 хв (180с) знаходиться на 5%, при 0s — на 50%
    const progress = Math.max(0, 1 - etaSec / 180);
    return 5 + progress * 45;
  }
  // Від'їжджає
  const departProgress = Math.min(1, Math.abs(etaSec) / 60);
  return 50 + departProgress * 45;
}

export function LiveMetroWidget({ userPosition }: LiveMetroWidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Оновлення щосекунди для плавної анімації руху потяга на колії
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeTrains = useMemo(() => getActiveTrains(now), [now]);

  const lineCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of activeTrains) map.set(t.lineId, (map.get(t.lineId) ?? 0) + 1);
    return BUILT_LINES.map(({ line }) => ({
      id: line.id,
      number: line.number,
      name: line.name,
      color: line.color,
      count: map.get(line.id) ?? 0
    }));
  }, [activeTrains]);

  const isServiceRunning = activeTrains.length > 0;

  // Пошук найближчої станції метро — координати станцій беремо напряму з
  // офіційного KML (src/assets/marshryt transporty kharkiv/…Google.kml),
  // а не з узагальненого списку зупинок (там інша, менш точна, схема id
  // для метро, і збіг з нею раніше не спрацьовував).
  const nearestMetroStation = useMemo(() => {
    if (!userPosition) return null;

    let best: { id: string; schematicId: string; name: string; distM: number; lineId?: string; lineColor?: string } | null = null;

    for (const { line } of BUILT_LINES) {
      for (const s of line.stations) {
        const geo = METRO_STATION_GEO[s.id];
        if (!geo) continue;

        const distM = haversineMeters(userPosition, geo);

        if (!best || distM < best.distM) {
          best = {
            id: s.id,
            schematicId: schematicStationId(s.id),
            name: s.name,
            distM,
            lineId: line.id,
            lineColor: line.color
          };
        }
      }
    }
    return best;
  }, [userPosition]);

  // Найближчі рейси для найближчої станції
  const upcomingArrivals = useMemo(() => {
    if (!nearestMetroStation) return [];
    return getUpcomingArrivalsForStation(nearestMetroStation.id, now, 2);
  }, [nearestMetroStation, now]);

  // Розподіл прибувань за 2 напрямками руху (Колія 1 та Колія 2)
  const trackArrivals = useMemo(() => {
    if (upcomingArrivals.length === 0) return { dir0: null, dir1: null };

    // Групуємо за напрямками руху: 'forward' (Колія 1) та 'backward' (Колія 2).
    // ВАЖЛИВО: liveMetroEngine.getUpcomingArrivalsForStation повертає
    // direction як 'forward' | 'backward', а НЕ '0' | '1' — порівняння з
    // рядками '0'/'1' завжди було хибним, тому Колія 2 ніколи не заповнювалась.
    const dir0 = upcomingArrivals.find((a) => a.direction === 'forward') ?? upcomingArrivals[0] ?? null;
    const dir1 = upcomingArrivals.find((a) => a.direction === 'backward' && a !== dir0) ?? null;

    return { dir0, dir1 };
  }, [upcomingArrivals]);

  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-white/20">
      {/* Декоративна неонова підсвітка */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-neon/10 blur-3xl" />

      {/* Шапка віджета */}
      <div className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            {isServiceRunning && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isServiceRunning ? 'bg-neon' : 'bg-white/30'
              }`}
            />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-white/90">
            Живе метро
          </span>
          {isServiceRunning && (
            <span className="rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-[10px] font-bold text-neon shadow-sm">
              НАЖИВО
            </span>
          )}
        </div>

        <Link
          to={nearestMetroStation ? `/metro/live?station=${nearestMetroStation.schematicId}&tab=timetable` : '/metro/live'}
          className="group flex items-center gap-1 text-[11px] font-semibold text-white/60 transition-colors hover:text-white"
        >
          <span>На схемі</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      {/* Статистика активних потягів на лініях */}
      {isServiceRunning && (
        <div className="mb-3.5 grid grid-cols-3 gap-2">
          {lineCounts.map((l) => (
            <div
              key={l.id}
              className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur-md transition-all hover:bg-white/[0.08]"
            >
              <div
                className="absolute left-0 top-0 h-full w-1 rounded-r"
                style={{ backgroundColor: l.color }}
              />
              <div className="pl-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                    Л{l.number}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between">
                  <span className="text-sm font-black tabular-nums text-white">{l.count}</span>
                  <span className="text-[9px] text-white/40">поїзд.</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Візуальний двоколійний модуль метрополітену */}
      {!isServiceRunning ? (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-center backdrop-blur-md">
          <p className="text-xs font-medium text-white/70">🌙 Нічна перерва у метрополітені</p>
          <p className="mt-0.5 text-[11px] text-white/40">Перші потяги відправляються о 05:30</p>
        </div>
      ) : nearestMetroStation ? (
        <div className="relative rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur-md">
          {/* Індикатор колії 1 (Верхній напрямок) */}
          <TrackLine
            label="Колія 1"
            arrival={trackArrivals.dir0}
            nowSec={nowSec}
            directionName={trackArrivals.dir0?.headsign ?? 'Напрямок А'}
          />

          {/* Центральний платформений модуль станції — веде до повного розкладу цієї станції */}
          <Link
            to={`/metro/live?station=${nearestMetroStation.schematicId}&tab=timetable`}
            className="my-2.5 flex items-center justify-between rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 shadow-inner backdrop-blur-md transition-colors hover:bg-white/15"
          >
            <div className="flex items-center gap-2 truncate">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/20"
                style={{ backgroundColor: nearestMetroStation.lineColor ?? '#C9A24B' }}
              />
              <span className="truncate font-display text-xs font-bold text-white">
                ст. {nearestMetroStation.name}
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                {formatDistance(nearestMetroStation.distM)}
              </span>
              <span className="rounded-md bg-neon/20 px-2 py-0.5 text-[10px] font-bold text-neon">
                Розклад →
              </span>
            </span>
          </Link>

          {/* Індикатор колії 2 (Нижній напрямок) */}
          <TrackLine
            label="Колія 2"
            arrival={trackArrivals.dir1}
            nowSec={nowSec}
            directionName={trackArrivals.dir1?.headsign ?? 'Напрямок Б'}
            reverse
          />
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
          <span className="flex items-center gap-1.5">
            <span>📍</span> Увімкніть геопозицію для відстеження
          </span>
          <Link to="/metro/live?tab=timetable" className="font-semibold text-neon hover:underline">
            Обрати станцію →
          </Link>
        </div>
      )}
    </section>
  );
}

interface TrackLineProps {
  label: string;
  arrival: ReturnType<typeof getUpcomingArrivalsForStation>[number] | null;
  nowSec: number;
  directionName: string;
  reverse?: boolean;
}

/**
 * Окрема полоса руху (колія) з анімованим спрайтом потяга.
 */
function TrackLine({ label, arrival, nowSec, directionName, reverse = false }: TrackLineProps) {
  if (!arrival) {
    return (
      <div className="relative my-1 flex items-center justify-between px-1 text-[10px] text-white/30">
        <span>{label}</span>
        <span className="italic">Рейсів не очікується</span>
      </div>
    );
  }

  const posX = calculateTrainPositionOnTrack(arrival.etaSec);
  const displayPos = reverse ? 100 - posX : posX;
  const isAtStation = arrival.etaSec <= 5 && arrival.etaSec >= -15;

  return (
    <div className="relative py-1">
      {/* Назва напрямку та час */}
      <div className="mb-1 flex items-center justify-between text-[10px] text-white/70">
        <span className="flex items-center gap-1 font-semibold truncate">
          <span className="text-white/40">{label}:</span>
          <span className="truncate">→ {directionName}</span>
        </span>
        <span className="shrink-0 font-bold text-mint tabular-nums">
          {formatEtaCountdown(arrival.etaSec, nowSec)}
        </span>
      </div>

      {/* Рейки колії */}
      <div className="relative flex h-6 w-full items-center rounded-md bg-white/5 px-2 border border-white/5 overflow-hidden">
        {/* Лінія колії */}
        <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-white/10 via-white/30 to-white/10" />

        {/* Штрихи шпал */}
        <div className="absolute inset-x-0 h-full bg-[repeating-linear-gradient(90deg,transparent,transparent_6px,rgba(255,255,255,0.08)_6px,rgba(255,255,255,0.08)_8px)]" />

        {/* Спрайт потяга, що рухається */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-1000 ease-linear"
          style={{ left: `${displayPos}%` }}
        >
          <div
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg transition-transform ${
              isAtStation ? 'scale-110 animate-pulse' : ''
            }`}
            style={{
              backgroundColor: arrival.lineColor,
              boxShadow: `0 0 10px ${arrival.lineColor}aa`
            }}
          >
            {/* Спрайт / Іконка потяга */}
            <span className="text-xs">🚈</span>
            <span className="text-[9px] whitespace-nowrap">
              {isAtStation ? 'На станції' : `${Math.ceil(arrival.etaSec / 60)} хв`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
