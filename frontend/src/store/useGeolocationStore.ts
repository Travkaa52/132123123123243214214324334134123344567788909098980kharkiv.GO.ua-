import { create } from 'zustand';
import type { GeoPoint } from '@/types/transport';

interface GeolocationState {
  position: GeoPoint | null;
  accuracy: number | null;
  /** Курс руху в градусах (0 = північ), null якщо пристрій не рухається/не дає heading. */
  heading: number | null;
  /** Швидкість в м/с за даними GPS (null, якщо пристрій стоїть на місці або дані недоступні). */
  speedMps: number | null;
  /** true, якщо користувач зараз реально рухається (іде/їде) — за швидкістю з GPS
   *  або, якщо браузер її не віддає, за відстанню між останніми фіксаціями. */
  isMoving: boolean;
  error: string | null;
  isLocating: boolean;
  /** Геолокація підтримується і дозволена — за весь час роботи хука хоч раз отримали фікс. */
  hasFix: boolean;
}

// Нижче цієї швидкості вважаємо, що людина стоїть (GPS-шум на місці зазвичай < 0.5 м/с).
const MOVING_SPEED_THRESHOLD_MPS = 0.55;
// Якщо speed від пристрою недоступний — оцінюємо рух за зсувом координат між фіксаціями.
const MOVING_DISTANCE_FALLBACK_M = 3;

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * -----------------------------------------------------------------------
 * ГЛОБАЛЬНИЙ, ЄДИНИЙ НА ВЕСЬ ЗАСТОСУНОК запит геолокації.
 * -----------------------------------------------------------------------
 * Раніше кожна сторінка (HomePage, MapPage, HomePageANG...) викликала
 * власний React-хук `useGeolocation()`, який сам стартував
 * `navigator.geolocation.watchPosition(...)` при монтуванні компонента.
 * Через це системний запит дозволу на геолокацію показувався (або
 * намагався показатись) щоразу при переході на сторінку з картою/головну —
 * тобто по суті на кожен ремаунт компонента, а не один раз за весь час
 * користування застосунком.
 *
 * Тепер `watchPosition` стартує ОДИН РАЗ на рівні модуля (singleton) і живе
 * стільки, скільки живе вкладка браузера — незалежно від того, скільки
 * компонентів підписані на позицію і скільки разів вони перемонтовуються.
 * Дозвіл в браузері один раз запитується (або підхоплюється, якщо вже був
 * наданий раніше) і назавжди лишається активним до закриття/перезавантаження
 * сторінки.
 */

let watchId: number | null = null;
let lastFix: { point: GeoPoint; atMs: number } | null = null;
let movingClearTimer: number | null = null;

interface GeolocationStore extends GeolocationState {
  /** Стартує глобальне стеження, якщо воно ще не запущене. Безпечно викликати повторно. */
  ensureWatching: () => void;
  /** Явний повторний запит позиції (напр. по кліку на кнопку GPS) — корисно як
   *  тригер системного дозволу, якщо автостарт мовчки впав у стан "ще не питали". */
  locate: () => void;
}

export const useGeolocationStore = create<GeolocationStore>()((set, get) => ({
  position: null,
  accuracy: null,
  heading: null,
  speedMps: null,
  isMoving: false,
  error: null,
  isLocating: false,
  hasFix: false,

  ensureWatching: () => {
    if (watchId !== null) return; // вже стежимо — запит дозволу вже було зроблено
    if (!navigator.geolocation) {
      set({ error: 'Геолокація не підтримується цим браузером' });
      return;
    }

    set({ isLocating: true, error: null });

    const handlePosition = (pos: GeolocationPosition) => {
      const point: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const nowMs = pos.timestamp || Date.now();

      let moving = false;
      if (typeof pos.coords.speed === 'number' && !Number.isNaN(pos.coords.speed)) {
        moving = pos.coords.speed > MOVING_SPEED_THRESHOLD_MPS;
      } else if (lastFix) {
        const dtSec = (nowMs - lastFix.atMs) / 1000;
        const distM = haversineMeters(lastFix.point, point);
        if (dtSec > 0.2) moving = distM > MOVING_DISTANCE_FALLBACK_M && distM / dtSec > MOVING_SPEED_THRESHOLD_MPS;
      }

      lastFix = { point, atMs: nowMs };

      // Невеликий "hold" перед тим, як погасити відео ходьби — інакше воно блимає
      // на кожному GPS-семплі, де швидкість на мить впала до нуля (нормальний шум GPS).
      if (movingClearTimer !== null) {
        window.clearTimeout(movingClearTimer);
        movingClearTimer = null;
      }
      if (!moving) {
        movingClearTimer = window.setTimeout(() => {
          set((s) => ({ ...s, isMoving: false }));
        }, 1500);
      }

      set((s) => ({
        position: point,
        accuracy: pos.coords.accuracy,
        heading: typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : s.heading,
        speedMps: typeof pos.coords.speed === 'number' ? pos.coords.speed : null,
        isMoving: moving || s.isMoving,
        error: null,
        isLocating: false,
        hasFix: true
      }));
    };

    const handleError = (err: GeolocationPositionError) => {
      set({ isLocating: false, error: err.message });
    };

    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000
    });
  },

  locate: () => {
    if (watchId === null) {
      get().ensureWatching();
      return;
    }
    if (!navigator.geolocation) return;
    set({ isLocating: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastFix = { point, atMs: pos.timestamp || Date.now() };
        set({
          position: point,
          accuracy: pos.coords.accuracy,
          heading:
            typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
              ? pos.coords.heading
              : get().heading,
          speedMps: typeof pos.coords.speed === 'number' ? pos.coords.speed : null,
          error: null,
          isLocating: false,
          hasFix: true
        });
      },
      (err) => set({ isLocating: false, error: err.message }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
  }
}));

// Стартуємо стеження одразу при завантаженні модуля (один раз за весь час
// життя вкладки) — "постійна" геолокація, а не тільки за кліком на кнопку.
// Якщо дозвіл ще не надавався, браузер сам покаже системний промпт ОДИН РАЗ;
// якщо дозвіл вже надано раніше — позиція підхоплюється без жодного промпта.
if (typeof window !== 'undefined') {
  useGeolocationStore.getState().ensureWatching();
}
