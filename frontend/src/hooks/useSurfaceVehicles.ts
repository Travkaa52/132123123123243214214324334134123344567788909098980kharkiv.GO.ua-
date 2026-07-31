import { useEffect, useRef, useState } from 'react';
import routeGeometriesJson from '@/data/routeGeometries.json';
import { localRoutes } from '@/data/localData';
import type { TransportKind, Vehicle, VehicleState } from '@/types/transport';

/**
 * Симуляція руху наземного транспорту (автобуси, трамваї, тролейбуси) по
 * реальній геометрії маршрутів (тих самих KML-лініях, що малюються на карті).
 *
 * Це не мок з фіксованими координатами: кожен борт реально рухається вздовж
 * ламаної лінії маршруту вперед-назад, з урахуванням довжини маршруту,
 * інтервалу руху (intervalMinutes) та випадкового зсуву фази, тож борти
 * розподілені по лінії природно, а не купкою в одній точці.
 *
 * До підключення бекенду (WebSocket з реальних GPS-трекерів) це замінює
 * попередню заглушку `vehicles={[]}`, через яку на карті взагалі не було
 * жодного транспорту, окрім метро.
 */

const ROUTE_GEOMETRIES = routeGeometriesJson as unknown as Record<string, [number, number][][]>;

const TICK_MS = 2500;
const AVG_SPEED_KMH: Record<TransportKind, number> = {
  metro: 40,
  tram: 22,
  trolleybus: 20,
  bus: 24
};
// Скільки бортів припадає на маршрут залежно від інтервалу руху.
// Що частіше інтервал — то більше бортів одночасно на лінії.
function vehicleCountForInterval(intervalMinutes: number): number {
  if (intervalMinutes <= 5) return 4;
  if (intervalMinutes <= 8) return 3;
  if (intervalMinutes <= 12) return 2;
  return 1;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

/** Приблизна відстань у метрах між двома точками (рівноважна проєкція, достатня для міських масштабів). */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x = dLng * Math.cos((lat1 + lat2) / 2);
  const y = dLat;
  return Math.sqrt(x * x + y * y) * R;
}

function bearingDeg(a: [number, number], b: [number, number]): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface Track {
  points: [number, number][]; // lng, lat
  cumulative: number[]; // метри від початку
  totalLength: number;
}

function buildTrack(lines: [number, number][][]): Track | null {
  const points = lines.flat();
  if (points.length < 2) return null;
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1], points[i]);
    cumulative.push(total);
  }
  if (total === 0) return null;
  return { points, cumulative, totalLength: total };
}

/** Позиція та курс у заданій точці шляху (0..totalLength метрів). */
function pointAt(track: Track, distance: number): { lng: number; lat: number; heading: number } {
  const d = Math.max(0, Math.min(track.totalLength, distance));
  let i = 1;
  while (i < track.cumulative.length && track.cumulative[i] < d) i++;
  i = Math.min(i, track.points.length - 1);
  const prev = track.points[i - 1];
  const next = track.points[i];
  const segLen = track.cumulative[i] - track.cumulative[i - 1] || 1;
  const t = (d - track.cumulative[i - 1]) / segLen;
  const lng = prev[0] + (next[0] - prev[0]) * t;
  const lat = prev[1] + (next[1] - prev[1]) * t;
  return { lng, lat, heading: bearingDeg(prev, next) };
}

interface SimVehicle {
  id: string;
  kind: TransportKind;
  routeId: string;
  routeNumber: string;
  headsignForward: string;
  headsignBackward: string;
  track: Track;
  speedMs: number; // м/с
  phaseOffsetM: number; // початковий зсув по довжині
  stopChancePhase: number; // для періодичних "зупинок на світлофорі"
}

function buildSimVehicles(kinds: TransportKind[]): SimVehicle[] {
  const vehicles: SimVehicle[] = [];
  const routes = localRoutes.all().filter((r) => kinds.includes(r.kind) && r.kind !== 'metro');

  for (const route of routes) {
    const key = `${route.kind}-${route.number}`;
    const lines = ROUTE_GEOMETRIES[key];
    if (!lines || lines.length === 0) continue;
    const track = buildTrack(lines);
    if (!track) continue;

    const count = vehicleCountForInterval(route.intervalMinutes || 10);
    const speedMs = (AVG_SPEED_KMH[route.kind] * 1000) / 3600;

    for (let i = 0; i < count; i++) {
      vehicles.push({
        id: `${route.id}-v${i}`,
        kind: route.kind,
        routeId: route.id,
        routeNumber: route.number,
        headsignForward: route.headsignForward,
        headsignBackward: route.headsignBackward,
        track,
        speedMs,
        phaseOffsetM: (track.totalLength / count) * i,
        stopChancePhase: Math.random() * 1000
      });
    }
  }

  return vehicles;
}

/**
 * Повертає масив «живих» транспортних засобів (Vehicle[]) для видимих видів
 * транспорту, що рухаються вздовж реальних маршрутів. Оновлюється кожні
 * TICK_MS мс — цього достатньо, бо плавна інтерполяція між кадрами вже
 * робиться в useVehicleAnimation на рівні MapView.
 */
export function useSurfaceVehicles(visibleKinds: TransportKind[]): Vehicle[] {
  const kindsKey = [...visibleKinds].sort().join(',');
  const simRef = useRef<SimVehicle[]>([]);
  const startRef = useRef<number>(Date.now());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    simRef.current = buildSimVehicles(visibleKinds);
    startRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindsKey]);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const elapsedSec = (now - startRef.current) / 1000;

      const next: Vehicle[] = simRef.current.map((v) => {
        const totalDistance = v.phaseOffsetM + v.speedMs * elapsedSec;
        const period = v.track.totalLength * 2; // туди — назад
        const posInPeriod = ((totalDistance % period) + period) % period;
        const forward = posInPeriod <= v.track.totalLength;
        const distAlong = forward ? posInPeriod : period - posInPeriod;

        const { lng, lat, heading } = pointAt(v.track, distAlong);
        const adjustedHeading = forward ? heading : (heading + 180) % 360;

        // Періодична коротка зупинка (світлофор/зупинка) для реалістичності стану боту.
        const cyclePhase = (elapsedSec + v.stopChancePhase) % 45;
        const state: VehicleState = cyclePhase < 3 ? 'stopped' : cyclePhase < 5 ? 'accelerating' : 'moving';

        return {
          id: v.id,
          kind: v.kind,
          routeNumber: v.routeNumber,
          headsign: forward ? v.headsignForward : v.headsignBackward,
          position: { lat, lng },
          heading: adjustedHeading,
          speedKmh: state === 'stopped' ? 0 : Math.round((v.speedMs * 3600) / 1000),
          state,
          lastUpdatedAt: new Date(now).toISOString(),
          occupancy: 'medium'
        } satisfies Vehicle;
      });

      setVehicles(next);
    }

    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [kindsKey]);

  return vehicles;
}
