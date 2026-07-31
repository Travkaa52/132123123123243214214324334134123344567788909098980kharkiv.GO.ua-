import type { TripPlan } from '@/data/localData';
import { estimateTripMinutes } from '@/data/localData';
import { getWalkingRoutesBatch } from '@/lib/osrmRouting';

/**
 * Другий, уточнюючий прохід по вже підібраних варіантах поїздки:
 * замінює приблизні "по прямій" пішохідні відстані (boardWalkM,
 * alightWalkM, transferWalkFromM) на реальні — вздовж вуличної мережі
 * OpenStreetMap (див. lib/osrmRouting.ts) — і переупорядковує варіанти
 * за фактичною сумарною ходьбою, а не за оцінкою по прямій.
 *
 * Викликається асинхронно ПІСЛЯ того, як користувач вже побачив швидкий
 * (haversine) результат — інтерфейс не блокується мережею, а варіанти
 * "дотягуються" точнішими цифрами, щойно вони готові.
 */
export async function refineTripPlansWithOSM(
  plans: TripPlan[],
  fromPoint: { lat: number; lng: number },
  toPoint: { lat: number; lng: number }
): Promise<TripPlan[]> {
  if (plans.length === 0) return plans;

  // Для кожного плану потрібно уточнити: посадку (from -> boardStop першої
  // ділянки), висадку (alightStop останньої ділянки -> to) і, якщо є
  // пересадка пішки між станціями — саму пересадку.
  const boardPairs = plans.map((plan) => ({
    aLat: fromPoint.lat,
    aLng: fromPoint.lng,
    bLat: plan.legs[0].boardStop.position.lat,
    bLng: plan.legs[0].boardStop.position.lng
  }));

  const alightPairs = plans.map((plan) => {
    const lastLeg = plan.legs[plan.legs.length - 1];
    return {
      aLat: lastLeg.alightStop.position.lat,
      aLng: lastLeg.alightStop.position.lng,
      bLat: toPoint.lat,
      bLng: toPoint.lng
    };
  });

  const transferIndices: number[] = [];
  const transferPairs = plans
    .map((plan, i) => {
      if (plan.legs.length < 2) return null;
      const [first, second] = plan.legs;
      if (!second.transferWalkFromM || second.transferWalkFromM <= 0) return null;
      transferIndices.push(i);
      return {
        aLat: first.alightStop.position.lat,
        aLng: first.alightStop.position.lng,
        bLat: second.boardStop.position.lat,
        bLng: second.boardStop.position.lng
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const [boardResults, alightResults, transferResults] = await Promise.all([
    getWalkingRoutesBatch(boardPairs),
    getWalkingRoutesBatch(alightPairs),
    getWalkingRoutesBatch(transferPairs)
  ]);

  const refined: TripPlan[] = plans.map((plan, i) => {
    const legs = plan.legs.map((leg) => ({ ...leg }));
    const transferPos = transferIndices.indexOf(i);
    if (transferPos !== -1) {
      legs[1] = { ...legs[1], transferWalkFromM: transferResults[transferPos].distanceM };
    }
    const updated: TripPlan = {
      ...plan,
      legs,
      boardWalkM: boardResults[i].distanceM,
      alightWalkM: alightResults[i].distanceM,
      estimatedMinutes: plan.estimatedMinutes
    };
    updated.estimatedMinutes = estimateTripMinutes(updated);
    return updated;
  });

  // Переупорядковуємо за реальним орієнтовним часом у дорозі (ходьба по
  // вуличній мережі + очікування + сам рух + пересадка), а не лише за
  // сумарною ходьбою — раніше маршрут з довшою поїздкою в салоні міг
  // випереджати значно швидший варіант тільки тому, що до зупинки було
  // на 20 метрів ближче пішки.
  return refined.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
}
