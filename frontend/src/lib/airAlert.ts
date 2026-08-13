/**
 * Джерело даних про повітряні тривоги — публічний JSON-фід ubilling.net.ua
 * (агрегатор офіційних даних тривог по областях України, оновлюється
 * щохвилини). Ключ у відповіді — точна українська назва області, значення
 * — { alertnow: boolean, changed: string }.
 *
 * Приклад відповіді (реальний, перевірено):
 * {
 *   "source": "...",
 *   "cachedat": "2026-08-05 19:01:07",
 *   "states": {
 *     "Харківська область": { "alertnow": true, "changed": "2026-08-05 07:10:46" },
 *     ...
 *   }
 * }
 *
 * Деякі альтернативні джерела тривог (напр. ukrainealarm.com) віддають
 * ієрархічну структуру область → райони, кожен із власним `enabled`. Щоб
 * застосунок не зламався, якщо underlying-джерело колись зміниться на
 * такий формат, парсер підтримує ОБИДВІ форми відповіді (див. нижче).
 */

const AIR_ALERT_API_URL = 'https://ubilling.net.ua/aerialalerts/?source=klimenko&raw';
const REQUEST_TIMEOUT_MS = 6000; // Таймаут мережевого запиту (6 сек)

/** Точна назва області в офіційних довідниках тривог. */
const KHARKIV_OBLAST_NAME = 'Харківська область';
/** Район, тривога в якому теж прирівнюється до тривоги в Харкові
 *  (сам Харків адміністративно є частиною Харківського району). */
const KHARKIV_DISTRICT_NAME = 'Харківський район';

interface FlatStateEntry {
  alertnow: boolean;
  changed?: string;
}

interface FlatAlertResponse {
  source?: string;
  cachedat?: string;
  states: Record<string, FlatStateEntry>;
}

interface DistrictEntry {
  enabled: boolean;
  type?: string;
  enabled_at?: string | null;
  disabled_at?: string | null;
}

interface HierarchicalStateEntry {
  enabled: boolean;
  type?: string;
  districts?: Record<string, DistrictEntry>;
  enabled_at?: string | null;
  disabled_at?: string | null;
}

interface HierarchicalAlertResponse {
  states: Record<string, HierarchicalStateEntry>;
}

export interface AirAlertStatus {
  /** Чи оголошена тривога, яка стосується Харкова (уся область АБО Харківський район). */
  isAlert: boolean;
  /** Час останньої зміни статусу у форматі ISO, якщо джерело його надало. */
  changedAt: string | null;
}

/** Нормалізує рядок дати YYYY-MM-DD HH:mm:ss до ISO для коректної роботи на iOS/WebKit */
function normalizeDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  return dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
}

function isHierarchical(data: unknown): data is HierarchicalAlertResponse {
  const states = (data as { states?: Record<string, unknown> })?.states;
  const kharkiv = states?.[KHARKIV_OBLAST_NAME] as { enabled?: unknown; alertnow?: unknown } | undefined;
  return !!kharkiv && typeof kharkiv.enabled === 'boolean' && typeof kharkiv.alertnow !== 'boolean';
}

/**
 * Розбирає відповідь API у простий прапорець "тривога в Харкові".
 * Умова (за вимогою): вважаємо тривогу актуальною для застосунку, якщо
 * тривога оголошена по всій Харківській області АБО окремо по
 * Харківському району.
 */
function parseAirAlertResponse(data: unknown): AirAlertStatus {
  if (isHierarchical(data)) {
    const kharkivOblast = (data as HierarchicalAlertResponse).states[KHARKIV_OBLAST_NAME];
    if (!kharkivOblast) return { isAlert: false, changedAt: null };

    const wholeOblastAlert = kharkivOblast.enabled === true;
    const kharkivDistrict = kharkivOblast.districts?.[KHARKIV_DISTRICT_NAME];
    const districtAlert = kharkivDistrict?.enabled === true;

    const isAlert = wholeOblastAlert || districtAlert;
    
    let rawChangedAt: string | null = null;
    if (wholeOblastAlert) {
      rawChangedAt = kharkivOblast.enabled_at ?? null;
    } else if (districtAlert) {
      rawChangedAt = kharkivDistrict?.enabled_at ?? null;
    } else {
      rawChangedAt = kharkivOblast.disabled_at ?? kharkivDistrict?.disabled_at ?? null;
    }

    return { isAlert, changedAt: normalizeDate(rawChangedAt) };
  }

  const flat = data as FlatAlertResponse;
  const kharkiv = flat?.states?.[KHARKIV_OBLAST_NAME];
  if (!kharkiv) return { isAlert: false, changedAt: null };

  return { 
    isAlert: kharkiv.alertnow === true, 
    changedAt: normalizeDate(kharkiv.changed) 
  };
}

/**
 * Тягне поточний статус тривоги для Харкова. Повертає `null` при будь-якій
 * помилці мережі/парсингу — виклик має тихо не показувати банер замість
 * падіння застосунку.
 */
export async function fetchAirAlertStatus(): Promise<AirAlertStatus | null> {
  try {
    const res = await fetch(AIR_ALERT_API_URL, { 
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    return parseAirAlertResponse(data);
  } catch {
    return null;
  }
}
