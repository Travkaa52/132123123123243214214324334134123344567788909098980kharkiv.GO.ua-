/**
 * Типи транспорту, що підтримуються додатком.
 * ВАЖЛИВО: жодних іконок/SVG для транспорту тут немає навмисно —
 * рендер відповідає <TransportSprite /> (плейсхолдер до підключення PNG Sprite Sheet).
 */
export type TransportKind = 'metro' | 'tram' | 'trolleybus' | 'bus';

export type VehicleState = 'moving' | 'stopped' | 'accelerating' | 'braking' | 'offline';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Vehicle {
  id: string;
  kind: TransportKind;
  routeNumber: string;
  headsign: string; // кінцева зупинка
  position: GeoPoint;
  heading: number; // кут повороту у градусах, 0 = північ
  speedKmh: number;
  state: VehicleState;
  lastUpdatedAt: string; // ISO timestamp
  occupancy?: 'low' | 'medium' | 'high';
}

export interface Stop {
  id: string;
  name: string;
  position: GeoPoint;
  kinds: TransportKind[];
  routeIds: string[];
  isAccessible?: boolean;
}

export interface RouteSchedulePoint {
  stopId: string;
  arrivalOffsetSec: number; // офсет від початку маршруту
}

export interface TransportRoute {
  id: string;
  kind: TransportKind;
  number: string;
  name: string;
  color: string; // hex, для лінії на карті
  headsignForward: string;
  headsignBackward: string;
  stopIds: string[];
  schedule: RouteSchedulePoint[];
  firstDeparture: string; // "05:30"
  lastDeparture: string; // "23:40"
  intervalMinutes: number;
}

export interface FavoriteStop {
  stopId: string;
  addedAt: string;
}

export interface FavoriteRoute {
  routeId: string;
  addedAt: string;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  type: 'stop' | 'route' | 'address';
  resultId?: string;
  searchedAt: string;
}
