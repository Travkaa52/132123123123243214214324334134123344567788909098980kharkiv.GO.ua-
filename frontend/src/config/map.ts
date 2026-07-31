import type { GeoPoint, TransportKind } from '@/types/transport';

/** Центр Харкова (площа Свободи) */
export const KHARKIV_CENTER: GeoPoint = { lat: 50.0028, lng: 36.2312 };

/** Географічні межі Харкова та передмістя для обмеження панорамування карти [SW, NE] */
export const KHARKIV_BOUNDS: [[number, number], [number, number]] = [
  [35.9000, 49.8200], // Південний захід
  [36.5500, 50.1800]  // Північний схід
];

export const DEFAULT_ZOOM = 13;
export const MAX_ZOOM = 19;
export const MIN_ZOOM = 10;

export const DEFAULT_PITCH = 0;
export const DEFAULT_BEARING = 0;

/** Стилі карти. У проді — власний tile-сервер або MapTiler/Stadia ключ через env. */
export const MAP_STYLES = {
  day: import.meta.env.VITE_MAP_STYLE_DAY_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
  night: import.meta.env.VITE_MAP_STYLE_NIGHT_URL ?? 'https://tiles.openfreemap.org/styles/dark'
} as const;

export type MapStyleMode = keyof typeof MAP_STYLES;

/** Акцентні кольори для кожного виду міського транспорту */
export const TRANSPORT_COLORS: Record<TransportKind, string> = {
  metro: '#C9A24B',      // Золотий (акцентний для метрополітену)
  tram: '#E4572E',       // Теракотово-червоний (трамвайні маршрути)
  trolleybus: '#2C7BE5', // Яскраво-синій (тролейбуси)
  bus: '#4FA37A'         // Мʼятно-зелений (автобуси та маршрутки)
};

/**
 * Пріоритет виду транспорту для визначення домінантного кольору зупинки-хаба.
 * Станція метро завжди має найвищий пріоритет, далі — трамвай, тролейбус і автобус.
 */
export const KIND_PRIORITY: readonly TransportKind[] = [
  'metro',
  'tram',
  'trolleybus',
  'bus'
] as const;

/**
 * Повертає колір для зазначеного виду транспорту з фолбеком.
 */
export function getTransportColor(kind?: TransportKind | null): string {
  if (!kind) return '#2B2F31';
  return TRANSPORT_COLORS[kind] ?? '#2B2F31';
}

/**
 * Визначає головний (домінантний) вид транспорту з декількох за визначеним пріоритетом.
 * Наприклад: для зупинки з ['bus', 'metro'] поверне 'metro'.
 */
export function getDominantTransportKind(kinds: TransportKind[]): TransportKind {
  if (!kinds || kinds.length === 0) return 'bus';

  for (const priorityKind of KIND_PRIORITY) {
    if (kinds.includes(priorityKind)) {
      return priorityKind;
    }
  }

  return kinds[0];
}
