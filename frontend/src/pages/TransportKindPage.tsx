import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  TrainTrack, 
  Bus, 
  Zap, 
  Search, 
  RotateCcw, 
  AlertCircle, 
  ArrowRight, 
  Radio, 
  SearchX,
  Compass,
  SlidersHorizontal,
  ArrowUpDown,
  Star,
  Check
} from 'lucide-react';
import { RouteCard } from '@/components/RouteCard';
import { MetroLinesExplorer } from '@/components/MetroLinesExplorer';
import { routesApi } from '@/api/routes';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import type { TransportKind, TransportRoute } from '@/types/transport';

interface TransportMeta {
  title: string;
  subtitle: string;
  icon: typeof TrainTrack;
  badgeColor: string;
  themeColor: string;
}

const TRANSPORT_META: Record<TransportKind, TransportMeta> = {
  metro: { 
    title: 'Метро', 
    subtitle: '3 лінії · 30 станцій · Швидкісний підземний транспорт', 
    icon: TrainTrack,
    badgeColor: 'text-ink-text bg-surface-raised border-border/40',
    themeColor: 'from-primary to-forest-dark'
  },
  tram: { 
    title: 'Трамваї', 
    subtitle: 'Наземні рейкові маршрути міста', 
    icon: TrainTrack,
    badgeColor: 'text-ink-text bg-surface-raised border-border/40',
    themeColor: 'from-primary to-forest-dark'
  },
  trolleybus: { 
    title: 'Тролейбуси', 
    subtitle: 'Екологічний міський електротранспорт', 
    icon: Zap,
    badgeColor: 'text-ink-text bg-surface-raised border-border/40',
    themeColor: 'from-primary to-forest-dark'
  },
  bus: { 
    title: 'Автобуси', 
    subtitle: 'Міські та приміські маршрутні автобуси', 
    icon: Bus,
    badgeColor: 'text-ink-text bg-surface-raised border-border/40',
    themeColor: 'from-primary to-forest-dark'
  }
};

function RouteSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-surface-raised px-2.5 py-2 shadow-sm animate-pulse">
      <div className="h-12 w-12 shrink-0 rounded-full bg-surface" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-1/3 rounded-lg bg-surface" />
        <div className="h-3 w-3/4 rounded-lg bg-surface-soft" />
      </div>
    </div>
  );
}

export function TransportKindPage({ kind }: { kind: TransportKind }) {
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'favorites'>('all');
  const [sortAsc, setSortAsc] = useState(true);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const favoriteRoutes = useFavoritesStore((s) => s.routes);
  const isRouteFavorite = useFavoritesStore((s) => s.isRouteFavorite);

  const meta = TRANSPORT_META[kind] || TRANSPORT_META.bus;
  const TransportIcon = meta.icon;

  const loadRoutes = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);

    routesApi
      .getByKind(kind)
      .then((data) => {
        if (!cancelled) setRoutes(data);
      })
      .catch(() => {
        if (!cancelled) setErrorMsg('Не вдалося завантажити маршрути. Перевірте з’єднання.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    const cleanup = loadRoutes();
    return cleanup;
  }, [loadRoutes]);

  const filteredRoutes = useMemo(() => {
    let result = routes;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const numMatch = r.number != null && String(r.number).toLowerCase().includes(query);
        const nameMatch = r.name != null && r.name.toLowerCase().includes(query);
        return numMatch || nameMatch;
      });
    }

    if (selectedFilter === 'favorites') {
      result = result.filter((r) => isRouteFavorite(r.id));
    }

    result = [...result].sort((a, b) => {
      const cmp = String(a.number ?? '').localeCompare(String(b.number ?? ''), 'uk', { numeric: true, sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [routes, searchQuery, selectedFilter, sortAsc, favoriteRoutes, isRouteFavorite]);

  return (
    <div className="min-h-dvh bg-surface-soft pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink-text selection:bg-primary selection:text-white font-sans antialiased">
      
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="mx-auto max-w-md space-y-4 px-4 relative z-10">
        
        <header className="flex items-start justify-between pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-2xs ${meta.badgeColor}`}>
                <TransportIcon className="h-3.5 w-3.5" />
                <span>{meta.title}</span>
              </span>
            </div>
            <h1 className="font-display text-2xl font-black tracking-tight text-ink-text mt-2">Маршрути</h1>
            <p className="text-xs text-ink-muted font-medium mt-0.5">Оберіть маршрут громадського транспорту</p>
          </div>

          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setIsFiltersOpen((v) => !v)}
              aria-label="Фільтри"
              aria-pressed={isFiltersOpen}
              className={`p-2.5 rounded-full border shadow-sm transition-all active:scale-95 ${
                isFiltersOpen
                  ? 'bg-primary border-primary/40 text-white'
                  : 'bg-surface-raised border-border/40 hover:bg-surface text-ink-text'
              }`}
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              onClick={() => setSortAsc((v) => !v)}
              aria-label={sortAsc ? 'Сортування за зростанням' : 'Сортування за спаданням'}
              title={sortAsc ? 'За зростанням номера' : 'За спаданням номера'}
              className="p-2.5 rounded-full bg-surface-raised border border-border/40 hover:bg-surface text-ink-text shadow-sm transition-all active:scale-95"
            >
              <ArrowUpDown size={17} className={sortAsc ? '' : 'scale-y-[-1]'} />
            </button>

            {isFiltersOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsFiltersOpen(false)} />
                <div className="absolute right-0 top-12 z-30 w-52 rounded-2xl border border-border/40 bg-surface-raised p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150">
                  <p className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-wider text-ink-muted">
                    Показувати
                  </p>
                  {(['all', 'favorites'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setSelectedFilter(f);
                        setIsFiltersOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-bold text-ink-text transition-colors hover:bg-surface-soft"
                    >
                      <span>{f === 'all' ? 'Усі маршрути' : 'Лише обране'}</span>
                      {selectedFilter === f && <Check size={14} className="text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {kind === 'metro' && (
          <div className="relative group overflow-hidden rounded-[22px] bg-gradient-to-r from-primary to-forest-dark p-4 text-white shadow-lg shadow-primary/10 transition-transform active:scale-[0.99]">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            
            <Link
              to="/metro/live"
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-white">
                  <Radio className="h-5 w-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tracking-tight">Живе метро</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-extrabold tracking-wider uppercase backdrop-blur-md">
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100 font-medium truncate">
                    Поїзди на схемі в реальному часі
                  </p>
                </div>
              </div>

              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          </div>
        )}

        {kind === 'metro' && (
          <div className="pt-1">
            <MetroLinesExplorer />
          </div>
        )}

        {!loading && !errorMsg && routes.length > 0 && (
          <div className="relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук маршруту..."
              className="w-full rounded-[20px] border border-border/40 bg-surface-raised py-3 pl-10 pr-10 text-xs font-semibold text-ink-text placeholder:text-ink-muted shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-muted hover:text-ink-text bg-surface px-2 py-0.5 rounded-full"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {!loading && !errorMsg && routes.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 shadow-2xs ${
                selectedFilter === 'all'
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'bg-surface-raised text-ink-muted border border-border/40 hover:bg-surface'
              }`}
            >
              Усі маршрути ({routes.length})
            </button>
            <button
              onClick={() => setSelectedFilter('favorites')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1 shadow-2xs ${
                selectedFilter === 'favorites'
                  ? 'bg-primary text-white shadow-md shadow-primary/20'
                  : 'bg-surface-raised text-ink-muted border border-border/40 hover:bg-surface'
              }`}
            >
              <Star size={13} className="fill-current" />
              <span>Обране</span>
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {loading && (
            <>
              <RouteSkeleton />
              <RouteSkeleton />
              <RouteSkeleton />
              <RouteSkeleton />
            </>
          )}

          {errorMsg && !loading && (
            <div className="flex flex-col items-center justify-center rounded-[22px] border border-border/40 bg-surface-raised p-8 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-ink-muted mb-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-ink-text mb-1">Помилка завантаження</h3>
              <p className="text-xs text-ink-muted max-w-xs mb-4">{errorMsg}</p>
              <button
                onClick={loadRoutes}
                className="inline-flex items-center gap-2 rounded-xl bg-bg px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-surface-raised active:scale-95 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Спробувати знову</span>
              </button>
            </div>
          )}

          {!loading && !errorMsg && routes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[22px] border border-border/40 bg-surface-raised p-8 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-ink-muted mb-3">
                <Compass className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-ink-text mb-1">Маршрутів не знайдено</p>
              <p className="text-xs text-ink-muted">Список наразі порожній.</p>
            </div>
          )}

          {!loading && !errorMsg && routes.length > 0 && filteredRoutes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[22px] border border-border/40 bg-surface-raised p-8 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-ink-muted mb-3">
                <SearchX className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-ink-text mb-1">Маршрутів не знайдено</p>
              <p className="text-xs text-ink-muted mb-4">
                Спробуйте змінити параметри пошуку.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-sm hover:bg-primary active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <span>Скинути фільтри</span>
              </button>
            </div>
          )}

          {!loading &&
            !errorMsg &&
            filteredRoutes.map((route) => (
              <RouteCard key={route.id} route={route} />
            ))}
        </div>

      </div>
    </div>
  );
}
