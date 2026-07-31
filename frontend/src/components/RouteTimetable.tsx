import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Route as RouteIcon, Bus } from 'lucide-react';
import type { TrolleyRouteInfo, TrolleyRouteTimetable } from '@/data/trolleyTimetables';

interface RouteTimetableProps {
  timetable: TrolleyRouteTimetable;
  info?: TrolleyRouteInfo;
  accentColor: string;
}

function groupByHour(times: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of times) {
    const [h, m] = t.split(':');
    if (!map.has(h)) map.set(h, []);
    map.get(h)!.push(m);
  }
  return map;
}

export function RouteTimetable({ timetable, info, accentColor }: RouteTimetableProps) {
  const [stationIdx, setStationIdx] = useState(0);
  const [dayType, setDayType] = useState<'workdays' | 'weekends'>('workdays');

  const station = timetable.stations[stationIdx];

  const hourGroups = useMemo(() => {
    if (!station) return [];
    const times = dayType === 'workdays' ? station.workdays : station.weekends;
    return Array.from(groupByHour(times).entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [station, dayType]);

  if (timetable.stations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-body font-bold text-ink-text">Розклад руху</h2>
        {info?.rollingStock && (
          <span className="inline-flex items-center gap-1 text-caption font-semibold text-ink-muted">
            <Bus className="h-3.5 w-3.5" />
            <span className="truncate max-w-[9rem]">{info.rollingStock}</span>
          </span>
        )}
      </div>

      <div className="rounded-3xl border border-border/60 bg-surface/50 p-4 backdrop-blur-xl shadow-sm space-y-4">
        {info?.path && (
          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-surface/80 p-3 text-body-sm text-ink-text">
            <RouteIcon className="h-4 w-4 mt-0.5 shrink-0 text-ink-muted" />
            <span>{info.path}</span>
          </div>
        )}

        {/* Station selector */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {timetable.stations.map((s, idx) => (
            <button
              key={`${s.station}-${idx}`}
              onClick={() => setStationIdx(idx)}
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-caption font-semibold transition-all active:scale-95 ${
                idx === stationIdx
                  ? 'text-white shadow-sm'
                  : 'border-border/40 bg-surface/60 text-ink-muted hover:text-ink-text'
              }`}
              style={idx === stationIdx ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            >
              {s.station}
            </button>
          ))}
        </div>

        {/* Day type toggle */}
        <div className="inline-flex items-center rounded-xl border border-border/40 bg-surface/60 p-1">
          <button
            onClick={() => setDayType('workdays')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-bold transition-all ${
              dayType === 'workdays' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Будні
          </button>
          <button
            onClick={() => setDayType('weekends')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-bold transition-all ${
              dayType === 'weekends' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Вихідні
          </button>
        </div>

        {/* Timetable grid */}
        {hourGroups.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface/60 p-3 text-body-sm text-ink-muted">
            <Clock3 className="h-4 w-4" />
            <span>Немає даних розкладу для цього дня.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {hourGroups.map(([hour, minutes]) => (
              <div key={hour} className="flex items-start gap-3 rounded-xl border border-border/30 bg-surface/40 p-2.5">
                <div
                  className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-body-sm font-extrabold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {hour}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {minutes.map((m, i) => (
                    <span
                      key={`${hour}:${m}-${i}`}
                      className="rounded-md bg-surface/80 border border-border/40 px-1.5 py-0.5 text-caption font-semibold text-ink-text"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
