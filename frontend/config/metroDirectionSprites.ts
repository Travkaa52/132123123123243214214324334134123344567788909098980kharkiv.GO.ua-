/**
 * Спрайти потягів метро за лінією (кольором) ТА напрямком руху.
 *
 * Джерело файлів: /public/sprites/metro sprite-napryamok ryhy/<колір лінії>/...
 * Кожна лінія має 2 спрайти — по одному на кожну кінцеву станцію (напрямок):
 *   - forward  — потяг їде до останньої станції списку лінії (напр. Індустріальна)
 *   - backward — потяг їде до першої станції списку лінії (напр. Холодна гора)
 *
 * Узгоджено з `dir`/`direction: 'forward' | 'backward'` у liveMetroEngine.ts
 * та в page-локальному computeActiveTrains() (LiveMetroPage.tsx): forward —
 * це напрямок від stations[0] до stations[last], backward — у зворотний бік.
 */

/** Префіксує шлях у /public базовим шляхом збірки (важливо для GitHub Pages, де base ≠ "/") і кодує пробіли в назвах папок. */
function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return encodeURI(`${normalizedBase}${path}`);
}

const SPRITE_ROOT = '/sprites/metro sprite-napryamok ryhy';

export interface MetroDirectionSpritePair {
  /** Спрайт потяга, що прямує до кінцевої станції в кінці списку лінії (напр. Індустріальна). */
  forward: string;
  /** Спрайт потяга, що прямує до кінцевої станції на початку списку лінії (напр. Холодна гора). */
  backward: string;
}

export const METRO_DIRECTION_SPRITES: Record<string, MetroDirectionSpritePair> = {
  'route-metro-1': {
    // Червона лінія (Холодногірсько-Заводська): Холодна гора ⇄ Індустріальна
    forward: assetUrl(`${SPRITE_ROOT}/red line/metro-red-line-indystrialna.png`),
    backward: assetUrl(`${SPRITE_ROOT}/red line/metro-red-line-holodna-gora.png`)
  },
  'route-metro-2': {
    // Синя лінія (Салтівська): Салтівська ⇄ Історичний музей
    forward: assetUrl(`${SPRITE_ROOT}/blue line/metro-blue-line-istoruchnyi.png`),
    backward: assetUrl(`${SPRITE_ROOT}/blue line/metro-blue-line-saltivska.png`)
  },
  'route-metro-3': {
    // Зелена лінія (Олексіївська): Перемога ⇄ Метробудівників
    forward: assetUrl(`${SPRITE_ROOT}/green line/metro-green-line-metrobydivnukiv.png`),
    backward: assetUrl(`${SPRITE_ROOT}/green line/metro-green-line-peremoga.png`)
  }
};

/**
 * Обрати шлях до спрайту потяга за id лінії та напрямком руху.
 * Повертає null, якщо для лінії немає напрямкових спрайтів (тоді викликач
 * має підставити свій фолбек — наприклад, єдиний спрайт лінії або емодзі).
 */
export function getMetroDirectionSprite(
  lineId: string,
  direction: 'forward' | 'backward' | undefined | null
): string | null {
  const entry = METRO_DIRECTION_SPRITES[lineId];
  if (!entry || !direction) return null;
  return direction === 'forward' ? entry.forward : entry.backward;
}
