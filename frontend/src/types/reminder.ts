import type { GeoPoint } from '@/types/transport';

/**
 * "Розумне нагадування про вихід" — користувач один раз задає точку "дім" і
 * точку "куди", а застосунок сам рахує: скільки йти пішки до зупинки +
 * коли найближчий рейс обраного маршруту + скільки їхати — і будить
 * push-нагадуванням саме тоді, коли треба вийти з дому, а не за фіксовану
 * кількість хвилин "на глаз".
 */
export interface ReminderPoint {
  /** Довільна підпис/адреса, яку ввів чи обрав користувач (напр. "Дім", "вул. Сумська 1"). */
  label: string;
  /** Фактична точка (адреса або обрана зупинка) — використовується для рахунку пішого відрізка. */
  position: GeoPoint;
  /** ID найближчої реальної зупинки з localData — точка посадки/висадки транспорту. */
  stopId: string;
  stopName: string;
  /** Відстань пішки від `position` до `stopId`, м — рахується один раз при виборі точки. */
  walkDistanceM: number;
}

export interface SmartReminder {
  id: string;
  /** Назва нагадування, напр. "На роботу". */
  title: string;
  home: ReminderPoint;
  destination: ReminderPoint;
  /** ID обраного маршруту (localRoutes) — той, яким користувач їде. */
  routeId: string;
  /** За скільки хвилин ДО моменту "виходь" надіслати попереднє нагадування (буфер на збори). */
  leadMinutes: number;
  /** Швидкість ходьби, км/год — впливає на розрахунок часу до зупинки. */
  walkSpeedKmh: number;
  /** Дні тижня, коли нагадування активне: 0 = нд ... 6 = сб. */
  activeDays: number[];
  /** Час, з якого нагадування можна спрацьовувати (щоб не будило вночі), "HH:MM". */
  windowStart: string;
  windowEnd: string;
  enabled: boolean;
  createdAt: string;
  /** Останній момент, коли нагадування фактично спрацювало (щоб не дублювати за добу). */
  lastFiredAt: string | null;
}

export interface UpcomingDeparture {
  /** Хвилин до відправлення транспорту від зупинки посадки, від "зараз". */
  etaMinutes: number;
  /** Розрахунковий момент відправлення. */
  departsAt: Date;
}

export interface LeaveTimePlan {
  reminder: SmartReminder;
  walkMinutes: number;
  departure: UpcomingDeparture;
  /** Момент, коли треба вийти з дому, щоб встигнути пішки до зупинки. */
  leaveAt: Date;
  /** Скільки хвилин лишилось до моменту "треба виходити", від зараз (може бути від'ємним). */
  minutesUntilLeave: number;
}
