import { useEffect, useMemo, useState } from 'react';
import { Clock3, CalendarDays } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import {
  BUILT_LINES,
  LINE_COLORS,
  TRAIN_SPRITES,
  getStationDayTimetable,
  dayTypeOf,
  secOfDay,
  formatEtaClock,
  formatEtaCountdown,
  type LiveMetroDayType,
  type StationDayTimetableEntry,
} from '@/pages/LiveMetroPage';

function timeStrToSec(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return -1;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** Секундний "тікер" поточного часу доби — щоб таймери прибуття оновлювались живо. */
function useNowSec(): number {
  const [nowSec, setNowSec] = useState(() => secOfDay(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNowSec(secOfDay(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return nowSec;
}

/**
 * Таймер відправлення наступного потяга в обидва боки для конкретної станції.
 * `getStationDayTimetable` повертає щонайбільше 2 записи для станції однієї лінії:
 * спершу пряме відправлення (index 0 → вперед), потім зворотне (index 1 → назад).
 * Між двома напрямками — тонка вертикальна риска, що імітує другу колію.
 */
function StationNextTrainTimer({ stationId, nowSec }: { stationId: string; nowSec: number }) {
  const dayType = dayTypeOf(new Date());
  const entries = useMemo(() => getStationDayTimetable(stationId, dayType), [stationId, dayType]);

  if (entries.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center">
      {entries.map((entry, idx) => {
        const nextIdx = entry.times.findIndex((t) => timeStrToSec(t) >= nowSec);
        const hasNext = nextIdx !== -1;
        const etaSec = hasNext ? timeStrToSec(entry.times[nextIdx]) : 0;
        const arrow = idx === 0 ? '→' : '←';

        return (
          <div key={`${entry.lineId}-${entry.direction}-${idx}`} className="flex items-center">
            {/* Розділювач між напрямками — друга колія поруч з першою */}
            {idx > 0 && <span className="mx-2 h-7 w-[3px] shrink-0 rounded-full bg-border/70" aria-hidden />}
            <div className="flex min-w-[2.6rem] flex-col items-center leading-tight">
              <span className="text-[9px] font-bold text-ink-muted/70">{arrow}</span>
              {hasNext ? (
                <span className="text-[11px] font-extrabold tabular-nums text-ink-text">
                  {formatEtaCountdown(etaSec, nowSec)}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-ink-muted/60">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Плоский список усіх станцій з усіх ліній — для пошуку станції пересадки за id. */
const ALL_STATIONS = BUILT_LINES.flatMap(({ line }) =>
  line.stations.map((s) => ({ ...s, lineId: line.id }))
);

function findStationById(id: string) {
  return ALL_STATIONS.find((s) => s.id === id);
}

/** З якого боку показувати кружечок лінії пересадки біля назви станції. */
const INTERCHANGE_SIDE: Record<string, 'left' | 'right'> = {
  'stop-metro-sportyvna': 'right',
  'stop-metro-metrobudivnykiv': 'left',
  'stop-metro-maidan-konstytutsii': 'right',
  'stop-metro-istorychnyi-muzei': 'left',
  'stop-metro-derzhprom': 'right',
  'stop-metro-universytet': 'left',
};

/** 2-3 сірі пунктирні крапки між кружечками ліній пересадки. */
function DashDots() {
  return (
    <span className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-0.5 w-1.5 rounded-full bg-ink-muted/40" />
      ))}
    </span>
  );
}

function InterchangeBadge({ stationId }: { stationId: string }) {
  const targetIds = findStationById(stationId)?.interchangeWith;
  if (!targetIds || targetIds.length === 0) return null;
  const targetId = targetIds[0];
  const target = findStationById(targetId);
  if (!target) return null;

  const targetColor = LINE_COLORS[target.lineId];
  const side = INTERCHANGE_SIDE[stationId] ?? 'right';

  const dot = <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface" style={{ backgroundColor: targetColor }} />;
  const label = (
    <span className="truncate text-caption font-semibold text-ink-muted">
      Перехід на станцію {target.name}
    </span>
  );

  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {side === 'left' && dot}
      {side === 'left' && <DashDots />}
      {label}
      {side === 'right' && <DashDots />}
      {side === 'right' && dot}
    </div>
  );
}

/** Групує "HH:MM" у список годин з масивом хвилин (класичний формат табло станції). */
function groupTimesByHour(times: string[]): { hour: string; minutes: { value: string; idx: number }[] }[] {
  const byHour = new Map<string, { value: string; idx: number }[]>();
  times.forEach((t, idx) => {
    const [h, m] = t.split(':');
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h)!.push({ value: m, idx });
  });
  return Array.from(byHour.entries()).map(([hour, minutes]) => ({ hour, minutes }));
}

/** Одна колонка розкладу (один напрямок) — таблиця "година → хвилини", як на табло станції. */
function DirectionTimetable({
  entry,
  nowSec,
}: {
  entry: StationDayTimetableEntry;
  nowSec: number;
}) {
  // Індекс найближчого рейсу, що ще не відправився.
  const nextIdx = entry.times.findIndex((t) => timeStrToSec(t) >= nowSec);
  const hourRows = useMemo(() => groupTimesByHour(entry.times), [entry.times]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface/50">
      <div className="flex items-center gap-2 border-b border-border/40 bg-surface/70 p-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white"
          style={{ backgroundColor: entry.lineColor }}
        >
          {entry.lineNumber}
        </span>
        <div className="min-w-0">
          <p className="truncate text-body-sm font-bold text-ink-text">→ {entry.headsign}</p>
        </div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {hourRows.map(({ hour, minutes }) => (
            <tr key={hour} className="border-b border-border/25 last:border-b-0">
              <td className="w-12 shrink-0 border-r border-border/30 bg-surface/60 px-2 py-2 text-center align-top">
                <span className="text-body-sm font-extrabold tabular-nums text-ink-text">{hour}</span>
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {minutes.map(({ value, idx }) => {
                    const isPast = idx < nextIdx || nextIdx === -1;
                    const isNext = idx === nextIdx;
                    return (
                      <span
                        key={`${hour}-${value}-${idx}`}
                        className={
                          isNext
                            ? 'rounded-md border-2 px-1.5 py-0.5 text-caption font-extrabold tabular-nums shadow-sm'
                            : isPast
                            ? 'rounded-md border border-border/30 bg-surface/40 px-1.5 py-0.5 text-caption font-semibold tabular-nums text-ink-muted opacity-40'
                            : 'rounded-md border border-border/40 bg-surface/80 px-1.5 py-0.5 text-caption font-semibold tabular-nums text-ink-text'
                        }
                        style={
                          isNext
                            ? { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a' }
                            : undefined
                        }
                      >
                        {value}
                      </span>
                    );
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StationTimetableSheet({
  stationId,
  stationName,
  onClose,
}: {
  stationId: string;
  stationName: string;
  onClose: () => void;
}) {
  const [dayType, setDayType] = useState<LiveMetroDayType>(() => dayTypeOf(new Date()));
  const nowSec = secOfDay(new Date());

  const entries = useMemo(() => getStationDayTimetable(stationId, dayType), [stationId, dayType]);

  return (
    <Sheet open onClose={onClose} title={stationName}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-muted">
            <Clock3 className="h-3.5 w-3.5" />
            Зараз {formatEtaClock(nowSec)}
          </span>

          <div className="inline-flex items-center rounded-xl border border-border/40 bg-surface/60 p-1">
            <button
              onClick={() => setDayType('weekday')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-caption font-bold transition-all ${
                dayType === 'weekday' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Будні
            </button>
            <button
              onClick={() => setDayType('weekend')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-caption font-bold transition-all ${
                dayType === 'weekend' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Вихідні
            </button>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="rounded-xl border border-border/40 bg-surface/50 p-3 text-body-sm text-ink-muted">
            Немає даних розкладу для цієї станції.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {entries.map((entry, idx) => (
              <DirectionTimetable key={`${entry.lineId}-${idx}`} entry={entry} nowSec={nowSec} />
            ))}
          </div>
        )}

        <p className="px-1 text-caption text-ink-muted">
          Затемнені рейси вже відправились. Рейс у зеленій рамці — наступний.
        </p>
      </div>
    </Sheet>
  );
}

export function MetroLinesExplorer() {
  const [activeLineId, setActiveLineId] = useState(BUILT_LINES[0].line.id);
  const [selectedStation, setSelectedStation] = useState<{ id: string; name: string } | null>(null);
  const nowSec = useNowSec();

  const activeLine = BUILT_LINES.find((l) => l.line.id === activeLineId)?.line ?? BUILT_LINES[0].line;
  const color = LINE_COLORS[activeLine.id];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-body font-bold text-ink-text flex items-center gap-2">
          <img
            src={TRAIN_SPRITES[activeLine.id]}
            alt={activeLine.name}
            className="h-6 w-9 shrink-0 rounded-md object-cover"
          />
          Лінії метро
        </h2>
        <span className="text-caption font-semibold text-ink-muted">Оберіть гілку</span>
      </div>

      {/* Line tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {BUILT_LINES.map(({ line }) => {
          const isActive = line.id === activeLineId;
          const lineColor = LINE_COLORS[line.id];
          return (
            <button
              key={line.id}
              onClick={() => setActiveLineId(line.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-caption font-bold transition-all active:scale-95 ${
                isActive ? 'text-white shadow-sm' : 'border-border/40 bg-surface/50 text-ink-muted'
              }`}
              style={isActive ? { backgroundColor: lineColor, borderColor: lineColor } : undefined}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-extrabold"
                style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : lineColor, color: isActive ? '#fff' : '#fff' }}
              >
                {line.number}
              </span>
              <span className="truncate max-w-[8.5rem]">{line.name}</span>
            </button>
          );
        })}
      </div>

      {/* Station list for the active line */}
      <div className="rounded-3xl border border-border/60 bg-surface/50 p-3 backdrop-blur-xl shadow-sm">
        <ol className="relative flex flex-col">
          {/* Основна колія */}
          <div
            className="absolute left-[1.15rem] top-4 bottom-4 w-0.5 rounded-full opacity-60"
            style={{ backgroundColor: color }}
          />
          {/* Друга колія — тонка паралельна лінія поруч, підкреслює, що потяги йдуть в обидва боки */}
          <div
            className="absolute left-[1.45rem] top-4 bottom-4 w-0.5 rounded-full opacity-25"
            style={{ backgroundColor: color }}
          />
          {activeLine.stations.map((station, idx) => (
            <li key={station.id}>
              <button
                onClick={() => setSelectedStation({ id: station.id, name: station.name })}
                className="relative flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-surface/80 active:scale-[0.99]"
              >
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center">
                  <div
                    className={`h-3.5 w-3.5 rounded-full border-2 border-surface shadow-2xs ${
                      idx === 0 || idx === activeLine.stations.length - 1 ? 'scale-125' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-body-sm font-semibold text-ink-text">{station.name}</span>
                  <InterchangeBadge stationId={station.id} />
                </div>
                {/* Таймер відправлення наступного потяга в обидва боки замість статичної іконки */}
                <StationNextTrainTimer stationId={station.id} nowSec={nowSec} />
              </button>
            </li>
          ))}
        </ol>
      </div>

      {selectedStation && (
        <StationTimetableSheet
          stationId={selectedStation.id}
          stationName={selectedStation.name}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
