import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, Clock3, Route as RouteIcon, Bus, Zap } from 'lucide-react';
import type { TrolleyRouteInfo, TrolleyRouteTimetable } from '@/data/trolleyTimetables';

interface RouteTimetableProps {
  timetable: TrolleyRouteTimetable;
  info?: TrolleyRouteInfo;
  accentColor: string;
}

type DayType = 'workdays' | 'weekends';

interface TimeEntry {
  time: string;
  sec: number;
}

/** Сьогоднішній тип дня за реальним календарем (Нд=0, Сб=6 → вихідний). */
function todayDayType(): DayType {
  const d = new Date().getDay();
  return d === 0 || d === 6 ? 'weekends' : 'workdays';
}

function secOfDay(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function timeStrToSec(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return -1;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
}

/** "за 42 хв" / "за 2 год 5 хв" / "менш ніж за хвилину". */
function formatCountdown(diffSec: number): string {
  if (diffSec <= 30) return 'просто зараз';
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `за ${mins} хв`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `за ${h} год` : `за ${h} год ${m} хв`;
}

function groupByHour(times: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>();
  for (const t of times) {
    const hour = t.time.split(':')[0];
    if (!map.has(hour)) map.set(hour, []);
    map.get(hour)!.push(t);
  }
  return map;
}

const HOUR_MS = 60 * 60;

export function RouteTimetable({ timetable, info, accentColor }: RouteTimetableProps) {
  const [stationIdx, setStationIdx] = useState(0);
  // За замовчуванням одразу відкриваємо розклад того типу дня, який є
  // сьогодні насправді — не треба щоразу вручну перемикати на "Будні".
  const [dayType, setDayType] = useState<DayType>(() => todayDayType());
  const [nowSec, setNowSec] = useState(() => secOfDay(new Date()));

  const todayType = todayDayType();
  const isTodayView = dayType === todayType;

  // Живий тікер поточного часу доби — раз на секунду, щоб підсвітка
  // "найближчої години" і зворотний відлік оновлювались плавно.
  useEffect(() => {
    const id = setInterval(() => setNowSec(secOfDay(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const station = timetable.stations[stationIdx];

  const times = useMemo<TimeEntry[]>(() => {
    if (!station) return [];
    const raw = dayType === 'workdays' ? station.workdays : station.weekends;
    return raw
      .map((time) => ({ time, sec: timeStrToSec(time) }))
      .filter((t) => t.sec >= 0)
      .sort((a, b) => a.sec - b.sec);
  }, [station, dayType]);

  const nextIdx = useMemo(() => {
    if (!isTodayView) return -1;
    return times.findIndex((t) => t.sec >= nowSec);
  }, [times, nowSec, isTodayView]);

  const nextDeparture = isTodayView && nextIdx !== -1 ? times[nextIdx] : null;

  const hourGroups = useMemo(
    () => Array.from(groupByHour(times).entries()).sort((a, b) => Number(a[0]) - Number(b[0])),
    [times]
  );

  // Автоскрол до найближчого рейсу при відкритті/зміні зупинки чи дня —
  // не треба гортати весь список руками в пошуках "де ми зараз".
  const activeRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (isTodayView && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [stationIdx, dayType, isTodayView]);

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

        {/* Day type toggle — з міткою "Сьогодні" на реальному типі дня */}
        <div className="inline-flex items-center rounded-xl border border-border/40 bg-surface/60 p-1">
          <button
            onClick={() => setDayType('workdays')}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-bold transition-all ${
              dayType === 'workdays' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Будні
            {todayType === 'workdays' && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-surface"
                aria-hidden
              />
            )}
          </button>
          <button
            onClick={() => setDayType('weekends')}
            className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-bold transition-all ${
              dayType === 'weekends' ? 'bg-primary text-primary-foreground shadow-2xs' : 'text-ink-muted'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Вихідні
            {todayType === 'weekends' && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-surface"
                aria-hidden
              />
            )}
          </button>
        </div>

        {/* Найближчий рейс — жива картка з відліком часу */}
        {isTodayView && (
          <div
            className="flex items-center justify-between gap-3 rounded-2xl border p-3 transition-colors"
            style={
              nextDeparture
                ? { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)' }
                : { borderColor: 'rgb(var(--color-border))', backgroundColor: 'rgba(0,0,0,0.02)' }
            }
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  nextDeparture ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface-soft text-ink-muted'
                }`}
              >
                <Zap className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted opacity-70">
                  Найближчий рейс
                </div>
                <div className="text-body-sm font-extrabold text-ink-text">
                  {nextDeparture ? nextDeparture.time : 'Рейсів більше немає сьогодні'}
                </div>
              </div>
            </div>
            {nextDeparture && (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-caption font-bold text-emerald-600">
                {formatCountdown(nextDeparture.sec - nowSec)}
              </span>
            )}
          </div>
        )}

        {/* Timetable grid — минулі відправлення затемнені, ті, що протягом
            найближчої години, підсвічені зеленим. */}
        {hourGroups.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface/60 p-3 text-body-sm text-ink-muted">
            <Clock3 className="h-4 w-4" />
            <span>Немає даних розкладу для цього дня.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {hourGroups.map(([hour, entries]) => (
              <div key={hour} className="flex items-start gap-3 rounded-xl border border-border/30 bg-surface/40 p-2.5">
                <div
                  className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-body-sm font-extrabold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {hour}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {entries.map((t, i) => {
                    const isPast = isTodayView && t.sec < nowSec;
                    const isNext = isTodayView && nextDeparture?.sec === t.sec;
                    const isSoon = isTodayView && !isPast && t.sec - nowSec <= HOUR_MS;
                    const minute = t.time.split(':')[1] ?? t.time;

                    let className =
                      'rounded-md border px-1.5 py-0.5 text-caption font-semibold transition-all';
                    let style: CSSProperties | undefined;

                    if (isPast) {
                      className += ' border-border/30 bg-surface/40 text-ink-muted opacity-40 line-through decoration-1';
                    } else if (isSoon) {
                      className += isNext ? ' border-2 font-extrabold shadow-sm scale-105' : ' border font-bold';
                      style = {
                        borderColor: '#22c55e',
                        backgroundColor: isNext ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.1)',
                        color: '#16a34a'
                      };
                    } else {
                      className += ' border-border/40 bg-surface/80 text-ink-text';
                    }

                    return (
                      <span
                        key={`${t.time}-${i}`}
                        ref={isNext ? activeRef : undefined}
                        className={className}
                        style={style}
                      >
                        {minute}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {isTodayView && (
          <p className="flex items-center gap-1.5 px-1 text-[10.5px] text-ink-muted opacity-60">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            Зеленим — рейси протягом найближчої години. Перекреслені — вже відправились.
          </p>
        )}
      </div>
    </div>
  );
}
