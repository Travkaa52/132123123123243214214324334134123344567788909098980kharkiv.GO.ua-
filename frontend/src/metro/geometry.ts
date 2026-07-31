import type { GeoPoint } from '@/types/transport';

/**
 * Чисті математичні утиліти для симуляції руху метро.
 *
 * Жодна функція тут не звертається до Date.now(), GPS чи Math.random() —
 * увесь модуль складається з детермінованих, чистих функцій (вхід -> вихід),
 * що робить симуляцію повністю відтворюваною й легко тестованою.
 */

const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Відстань між двома геокоординатами за формулою гаверсинуса, у метрах. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Азимут (0° = північ, за годинниковою стрілкою) від точки a до точки b. */
export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Лінійна інтерполяція точки між a і b, t ∈ [0,1]. */
export function lerpPoint(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const c = clamp01(t);
  return {
    lat: a.lat + (b.lat - a.lat) * c,
    lng: a.lng + (b.lng - a.lng) * c
  };
}

/**
 * Квадратична крива Без'є через контрольну точку. Використовується, коли
 * для лінії метро задано контрольні точки полілінії (плавний вигин перегону,
 * а не пряма лінія "станція-станція"). Якщо контрольної точки немає,
 * викликач повинен використати lerpPoint — сам geometry.ts нічого не вигадує.
 */
export function bezierQuadraticPoint(p0: GeoPoint, control: GeoPoint, p2: GeoPoint, t: number): GeoPoint {
  const c = clamp01(t);
  const oneMinusT = 1 - c;
  const lat = oneMinusT * oneMinusT * p0.lat + 2 * oneMinusT * c * control.lat + c * c * p2.lat;
  const lng = oneMinusT * oneMinusT * p0.lng + 2 * oneMinusT * c * control.lng + c * c * p2.lng;
  return { lat, lng };
}

/** Похідна (дотична) квадратичної кривої Без'є в точці t — використовується для обчислення курсу руху вздовж вигину. */
export function bezierQuadraticTangent(p0: GeoPoint, control: GeoPoint, p2: GeoPoint, t: number): GeoPoint {
  const c = clamp01(t);
  const lat = 2 * (1 - c) * (control.lat - p0.lat) + 2 * c * (p2.lat - control.lat);
  const lng = 2 * (1 - c) * (control.lng - p0.lng) + 2 * c * (p2.lng - control.lng);
  return { lat, lng };
}

/** Найкоротша інтерполяція кута (у градусах, 0-360) з урахуванням переходу через 0/360. */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * clamp01(t) + 360) % 360;
}

/**
 * Easing-функції для плавного розгону/гальмування потяга.
 * easeInOutCubic — S-подібна крива: повільний старт, швидка середина, повільне завершення.
 * Використовується замість лінійної інтерполяції на кожному перегоні між зупинками,
 * щоб потяг реалістично розганявся й гальмував, а не рухався зі сталою швидкістю.
 */
export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

export function easeInCubic(t: number): number {
  const c = clamp01(t);
  return c * c * c;
}

/**
 * Похідна easeInOutCubic за t (нормований діапазон t=[0,1] відповідає всій
 * тривалості перегону). Використовується для оцінки миттєвої швидкості
 * (щоб швидкість плавно наростала й спадала синхронно з позицією, а не
 * була сталою по всьому перегону).
 */
export function easeInOutCubicDerivative(t: number): number {
  const c = clamp01(t);
  if (c < 0.5) return 12 * c * c;
  const u = -2 * c + 2;
  return 3 * u * u;
}

/** Парсить "HH:MM" у секунди від півночі. Кидає помилку на некоректному форматі — жодних мовчазних дефолтів. */
export function timeStringToSeconds(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) {
    throw new Error(`geometry.timeStringToSeconds: некоректний формат часу "${time}", очікується "HH:MM"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 3600 + minutes * 60;
}

/** Поточний час доби у секундах (локальний час пристрою користувача) — єдине джерело "поточного часу" для всього движка. */
export function secondsSinceMidnight(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
}
