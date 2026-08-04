import { useEffect, useRef, useState } from 'react';
import type { GeoPoint, Vehicle } from '@/types/transport';

interface AnimatedVehicle extends Vehicle {
  animatedPosition: GeoPoint;
  animatedHeading: number;
}

interface TrackedVehicle {
  from: GeoPoint;
  to: GeoPoint;
  fromHeading: number;
  toHeading: number;
  fromSpeed: number;
  toSpeed: number;
  updateReceivedAt: number;
  serverIntervalMs: number; // очікуваний інтервал між апдейтами з бекенду
}

const DEFAULT_SERVER_INTERVAL_MS = 3000;
const MAX_EXTRAPOLATION_MS = 6000; // не екстраполювати довше, щоб уникнути "втечі" маркера

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

function lerpPoint(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Плавна анімація маркерів транспорту між апдейтами з WebSocket:
 * - інтерполяція між останньою відомою та новою позицією
 * - екстраполяція короткий час після останнього апдейта (за поточним курсом/швидкістю)
 * - плавне гальмування при state === 'stopped' / 'braking'
 */
export function useVehicleAnimation(rawVehicles: Vehicle[]): AnimatedVehicle[] {
  const tracked = useRef<Map<string, TrackedVehicle>>(new Map());
  const [animatedVehicles, setAnimatedVehicles] = useState<AnimatedVehicle[]>([]);
  const rafRef = useRef<number | null>(null);
  const latestRawRef = useRef<Vehicle[]>(rawVehicles);

  useEffect(() => {
    const now = performance.now();
    for (const vehicle of rawVehicles) {
      const prevTracked = tracked.current.get(vehicle.id);
      const prevAnimated = animatedVehicles.find((v) => v.id === vehicle.id);

      tracked.current.set(vehicle.id, {
        from: prevAnimated?.animatedPosition ?? vehicle.position,
        to: vehicle.position,
        fromHeading: prevAnimated?.animatedHeading ?? vehicle.heading,
        toHeading: vehicle.heading,
        fromSpeed: prevTracked?.toSpeed ?? vehicle.speedKmh,
        toSpeed: vehicle.speedKmh,
        updateReceivedAt: now,
        serverIntervalMs: prevTracked ? now - prevTracked.updateReceivedAt || DEFAULT_SERVER_INTERVAL_MS : DEFAULT_SERVER_INTERVAL_MS
      });
    }
    latestRawRef.current = rawVehicles;
    // видаляємо трекінг для зниклих транспортних засобів
    const activeIds = new Set(rawVehicles.map((v) => v.id));
    for (const id of tracked.current.keys()) {
      if (!activeIds.has(id)) tracked.current.delete(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVehicles]);

  useEffect(() => {
    function tick() {
      const now = performance.now();
      const next: AnimatedVehicle[] = [];

      for (const vehicle of latestRawRef.current) {
        const t = tracked.current.get(vehicle.id);
        if (!t) continue;

        const elapsed = now - t.updateReceivedAt;
        const duration = Math.min(t.serverIntervalMs, MAX_EXTRAPOLATION_MS);
        const rawT = duration > 0 ? Math.min(elapsed / duration, 1.4) : 1; // >1 = легка екстраполяція
        const clampedT = Math.min(rawT, 1);
        const eased = easeOutCubic(clampedT);

        const isStopping = vehicle.state === 'stopped' || vehicle.state === 'braking';
        const position = isStopping ? lerpPoint(t.from, t.to, Math.max(eased, 0.98)) : lerpPoint(t.from, t.to, eased);
        const heading = lerpAngle(t.fromHeading, t.toHeading, eased);

        next.push({ ...vehicle, animatedPosition: position, animatedHeading: heading });
      }

      setAnimatedVehicles(next);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return animatedVehicles;
}
