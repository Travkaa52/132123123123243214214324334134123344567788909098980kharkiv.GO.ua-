import type { GeoPoint } from '@/types/transport';
import type { MetroStationData } from '@/metro/types';

/**
 * Станція метро. Обгортка над даними станції (з stops.json) —
 * незмінна (immutable) структура даних, без жодної логіки руху
 * (рух — відповідальність MetroRoute/MetroTrain).
 */
export class MetroStation {
  readonly id: string;
  readonly name: string;
  readonly position: GeoPoint;
  readonly isAccessible: boolean;

  constructor(data: MetroStationData) {
    this.id = data.id;
    this.name = data.name;
    this.position = data.position;
    this.isAccessible = data.isAccessible ?? false;
  }

  /** Явна серіалізація для дебагу/логів — не використовується движком напряму. */
  toJSON(): MetroStationData {
    return { id: this.id, name: this.name, position: this.position, isAccessible: this.isAccessible };
  }
}
