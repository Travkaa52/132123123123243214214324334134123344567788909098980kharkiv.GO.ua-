import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { RouteCard } from '@/components/RouteCard';
import { StopCard } from '@/components/StopCard';
import { localRoutes, localStops } from '@/data/localData';
import { useFavoritesStore } from '@/store/useFavoritesStore';

export function FavoritesPage() {
  const navigate = useNavigate();
  const stopFavs = useFavoritesStore((s) => s.stops);
  const routeFavs = useFavoritesStore((s) => s.routes);

  // Раніше сторінка малювала обране як прості <li> без кольору маршруту,
  // іконок виду транспорту й без переходу на деталі — виглядало інакше,
  // ніж всюди в застосунку, і по суті було "мертвим" списком.
  // Тепер переюзаємо ті самі RouteCard/StopCard, що й на сторінці маршрутів —
  // однаковий вигляд, той самий тап для переходу до деталей.
  const routes = routeFavs.map((r) => localRoutes.getById(r.routeId)).filter(Boolean);
  const stops = stopFavs.map((s) => localStops.getById(s.stopId)).filter(Boolean);

  const isEmpty = routes.length === 0 && stops.length === 0;

  return (
    <div className="min-h-dvh bg-surface-soft pb-20">
      <PageHeader title="Обране" subtitle="Ваші улюблені зупинки та маршрути" />
      <div className="flex flex-col gap-4 px-4">
        {isEmpty && (
          <div className="flex flex-col items-center gap-3 rounded-xl2 bg-ink-surface/70 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <svg width="26" height="26" viewBox="0 0 24 24" className="fill-transparent stroke-current" strokeWidth="1.8">
                <path d="M12 3.5l2.55 5.44 5.95.8-4.3 4.24 1.05 5.98L12 17.02l-5.25 2.94 1.05-5.98-4.3-4.24 5.95-.8L12 3.5Z" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-text">Ще немає обраного</p>
            <p className="text-sm text-ink-muted max-w-[240px]">
              Натисніть на зірочку біля зупинки чи маршруту, щоб додати сюди
            </p>
          </div>
        )}

        {routes.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-sm font-bold text-ink-text/80">Маршрути</h2>
            <div className="flex flex-col gap-2">
              {routes.map((route) => (
                <RouteCard key={route!.id} route={route!} />
              ))}
            </div>
          </section>
        )}

        {stops.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-sm font-bold text-ink-text/80">Зупинки</h2>
            <div className="flex flex-col gap-2">
              {stops.map((stop) => (
                <StopCard key={stop!.id} stop={stop!} onClick={() => navigate(`/map?stop=${stop!.id}`)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
