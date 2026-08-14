import type { TripPlan, TripPlanMode } from '@/data/localData';
import { estimateTripMinutes, applyTripPlanMode } from '@/data/localData';
import { getWalkingRoutesBatch, getTransitStreetPathsBatch } from '@/lib/osrmRouting';
import { hasKmlGeometry } from '@/lib/mapLayers';

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
  toPoint: { lat: number; lng: number },
  mode: TripPlanMode = 'smart'
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

  // Для ділянок транспорту, для яких немає точної KML-геометрії маршруту
  // (routeGeometries.json), окремо уточнюємо реальну вуличну трасу через
  // OSRM (профіль driving) — інакше на карті лишається ламана лінія по
  // рідких координатах самих зупинок. Індекси зберігаємо як (planIndex,
  // legIndex), бо таких ділянок у різних планах — довільна, розріджена
  // кількість (0, 1 або 2 на план).
  const transitLegRefs: Array<{ planIndex: number; legIndex: number }> = [];
  const transitPairs = plans.flatMap((plan, planIndex) =>
    plan.legs
      .map((leg, legIndex) => ({ leg, legIndex }))
      .filter(({ leg }) => !hasKmlGeometry(leg.route.kind, leg.route.number))
      .map(({ leg, legIndex }) => {
        transitLegRefs.push({ planIndex, legIndex });
        return {
          aLat: leg.boardStop.position.lat,
          aLng: leg.boardStop.position.lng,
          bLat: leg.alightStop.position.lat,
          bLng: leg.alightStop.position.lng
        };
      })
  );

  const [boardResults, alightResults, transferResults, transitResults] = await Promise.all([
    getWalkingRoutesBatch(boardPairs),
    getWalkingRoutesBatch(alightPairs),
    getWalkingRoutesBatch(transferPairs),
    getTransitStreetPathsBatch(transitPairs)
  ]);

  const refined: TripPlan[] = plans.map((plan, i) => {
    const legs = plan.legs.map((leg) => ({ ...leg }));
    const transferPos = transferIndices.indexOf(i);
    if (transferPos !== -1) {
      legs[1] = {
        ...legs[1],
        transferWalkFromM: transferResults[transferPos].distanceM,
        transferWalkPath: transferResults[transferPos].coordinates
      };
    }
    transitLegRefs.forEach((ref, idx) => {
      if (ref.planIndex !== i) return;
      const path = transitResults[idx];
      if (path && path.length >= 2) {
        legs[ref.legIndex] = { ...legs[ref.legIndex], transitPath: path };
      }
    });
    const updated: TripPlan = {
      ...plan,
      legs,
      boardWalkM: boardResults[i].distanceM,
      alightWalkM: alightResults[i].distanceM,
      boardWalkPath: boardResults[i].coordinates,
      alightWalkPath: alightResults[i].coordinates,
      estimatedMinutes: plan.estimatedMinutes
    };
    updated.estimatedMinutes = estimateTripMinutes(updated);
    return updated;
  });

  // Переупорядковуємо/фільтруємо за тим самим режимом ("розумний"/
  // найшвидший/найменше пересадок/лише метро/без довгих переходів), яким
  // варіанти вже були відфільтровані на першому проході — інакше уточнення
  // реальною вуличною мережею тихо "забувало" обраний користувачем режим і
  // відкочувало список назад до сортування просто за часом.
  return applyTripPlanMode(refined, mode);
}
