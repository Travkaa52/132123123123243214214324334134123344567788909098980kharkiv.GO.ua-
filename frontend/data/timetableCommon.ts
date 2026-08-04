/**
 * Спільна логіка розбору "сирих" таблиць розкладу (формат
 * { row_index, columns: string[], links }[]), в якому приходять готові
 * загальні (не по-маршрутні) файли розкладів — рядок зупинки має вигляд
 * [назва, "робочі дні" рядком через пробіл, "вихідні дні" рядком (опційно)].
 *
 * Використовується і для автобусів (один спільний файл на всі маршрути:
 * assets/rozklad ryhy avtobus/all_routes_avtobus.json), і для трамваїв
 * (готові файли по кожній лінії: assets/rozklad ryhy tramway/*.json) —
 * без окремого власноруч написаного файлу-парсера під кожен маршрут.
 */

export interface StationTimetable {
  station: string;
  workdays: string[];
  weekends: string[];
}

export interface RouteTimetableData {
  routeNumber: string;
  sourceId: string;
  stations: StationTimetable[];
}

export interface RouteTimetableInfo {
  routeNumber: string;
  routeUrl?: string;
  path?: string;
  depot?: string;
  rollingStock?: string;
  notes?: string;
}

export interface RawTableRow {
  row_index: number;
  columns: string[];
  links?: (string | null)[];
}

const TIME_RE = /^\d{1,2}:\d{2}\*?$/;

// Рядки-артефакти парсингу першоджерела, які не є даними зупинки.
const HEADER_LABELS = new Set(['', 'Зупинка', 'Час відправлення', 'робочі дні', 'вихідні дні']);

export function asTimeArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => TIME_RE.test(v))
    .map((v) => v.replace('*', ''));
}

/**
 * Перетворює "сирий" масив рядків таблиці розкладу однієї лінії
 * (в такому вигляді зберігаються і спільний файл автобусів, і кожен
 * готовий файл трамваю) на список зупинок з часами руху.
 */
export function parseStopScheduleRows(rows: RawTableRow[] | undefined): StationTimetable[] {
  const stations: StationTimetable[] = [];
  if (!Array.isArray(rows)) return stations;

  for (const row of rows) {
    const cols = row.columns || [];
    // Джерело інколи додає зайву лапку на самому початку назви
    // (артефакт парсингу, напр. `"Станція метро "Турбоатом"`) — прибираємо
    // лише її; завершальну лапку не чіпаємо, бо це часто законна закриваюча
    // лапка назви станції в лапках (напр. `Станція метро "Наукова"`).
    const name = (cols[0] || '').trim().replace(/^"/, '');
    if (!name || HEADER_LABELS.has(name) || TIME_RE.test(name)) continue;

    const workdays = asTimeArray(cols[1]);
    const weekends = asTimeArray(cols[2]);
    if (workdays.length === 0 && weekends.length === 0) continue;

    stations.push({ station: name, workdays, weekends });
  }

  return stations;
}
