import { ArrowRight, ChevronRight, Navigation2, Repeat, Route as RouteIcon, Zap } from 'lucide-react';
import { KIND_LABELS_UK } from '@/components/TransportKindIcon';
import type { TripPlan } from '@/data/localData';

interface TripPlanSheetProps {
  plans: TripPlan[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Підтвердити обраний варіант і почати відстеження живої поїздки. */
  onStartTrip: (index: number) => void;
}

function formatWalk(m: number): string {
  return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км`;
}

/**
 * Список варіантів поїздки: прямі рейси і варіанти з однією пересадкою.
 * Кожен варіант показує ланцюжок transport-badge'ів у їхніх фірмових
 * кольорах — так одразу видно, на чому їхати і де пересідати. Варіанти
 * відсортовані (buildTripPlans/refineTripPlansWithOSM) за реальним
 * орієнтовним часом у дорозі (ходьба + очікування + рух + пересадка),
 * тож перший у списку — справді найшвидший, а не просто "найближчий пішки".
 */
export function TripPlanSheet({ plans, selectedIndex, onSelect, onStartTrip }: TripPlanSheetProps) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <RouteIcon className="h-6 w-6 text-ink-muted" />
        <p className="text-xs font-bold text-ink-text">Прямих маршрутів не знайдено</p>
        <p className="text-[11px] text-ink-muted">Спробуйте обрати точки ближче до зупинок громадського транспорту</p>
      </div>
    );
  }

  const fastestMinutes = Math.min(...plans.map((p) => p.estimatedMinutes));

  return (
    <div className="divide-y divide-border/40 p-2">
      <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-wider text-ink-muted">
        Варіанти поїздки ({plans.length})
      </p>
      {plans.map((plan, index) => {
        const isSelected = selectedIndex === index;
        const totalWalk = plan.boardWalkM + plan.alightWalkM;
        const isFastest = plan.estimatedMinutes === fastestMinutes;

        return (
          <div
            key={index}
            className={`w-full rounded-2xl transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-soft'}`}
          >
          <button
            onClick={() => onSelect(index)}
            className="flex w-full flex-col gap-2 px-2.5 py-2.5 text-left active:scale-[0.99]"
          >
            <div className="flex items-center gap-1.5">
              {plan.legs.map((leg, legIndex) => (
                <div key={legIndex} className="flex items-center gap-1.5">
                  <span
                    className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white shadow-xs"
                    style={{ backgroundColor: leg.route.color }}
                  >
                    {leg.route.number}
                  </span>
                  {legIndex < plan.legs.length - 1 && <Repeat size={14} className="shrink-0 text-ink-muted" />}
                </div>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="text-sm font-black text-ink-text">≈{plan.estimatedMinutes} хв</span>
                {isFastest && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-primary">
                    <Zap size={9} />
                    Найшвидший
                  </span>
                )}
                <ChevronRight size={14} className="shrink-0 text-ink-muted" />
              </div>
            </div>

            <div className="min-w-0 text-xs">
              <div className="truncate font-bold text-ink-text">
                {plan.legs.map((leg) => `${KIND_LABELS_UK[leg.route.kind]} №${leg.route.number}`).join(' → ')}
              </div>
              {plan.transfersCount > 0 ? (
                <div className="truncate text-[11px] text-ink-muted">
                  {plan.legs[1]?.boardStop.id === plan.legs[0].alightStop.id ? (
                    <>Пересадка на «{plan.legs[0].alightStop.name}»</>
                  ) : (
                    <>
                      Пересадка: «{plan.legs[0].alightStop.name}» → пішки{' '}
                      {Math.round(plan.legs[1]?.transferWalkFromM ?? 0)} м → «{plan.legs[1]?.boardStop.name}»
                    </>
                  )}
                </div>
              ) : (
                <div className="truncate text-[11px] text-ink-muted">
                  Посадка: {plan.legs[0].boardStop.name} → Вихід: {plan.legs[0].alightStop.name}
                </div>
              )}
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                <ArrowRight size={11} />
                <span>Пішки загалом ≈ {formatWalk(totalWalk)}</span>
              </div>
            </div>
          </button>

          {isSelected && (
            <div className="px-2.5 pb-2.5">
              <button
                type="button"
                onClick={() => onStartTrip(index)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-3 py-2.5 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.98] hover:brightness-105"
              >
                <Navigation2 size={14} />
                <span>В дорогу</span>
              </button>
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}
