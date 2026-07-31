import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import {
  Star,
  ChevronRight,
  Map as MapIcon,
  Train,
  Bus,
  Navigation,
  Bell,
  Settings,
  Plus,
  Activity,
  ArrowUpRight,
  AlertCircle
} from 'lucide-react';
import { localRoutes, localStops } from '@/data/localData';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { TransportKind } from '@/types/transport';

const KIND_ICON: Record<TransportKind, string> = {
  metro: '🚇',
  tram: '🚊',
  trolleybus: '🚎',
  bus: '🚌'
};

/** Format distance in meters or kilometers */
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Calculate actual distance between two points using the Haversine formula */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function HomePage() {
  const favoriteRoutes = useFavoritesStore((s) => s.routes);
  const { position } = useGeolocation();

  const favoriteRouteDetails = useMemo(
    () =>
      favoriteRoutes
        .slice(0, 3)
        .map((f) => localRoutes.getById(f.routeId))
        .filter((r): r is NonNullable<typeof r> => !!r),
    [favoriteRoutes]
  );

  // Nearby stops with calculated exact distance
  const nearbyStopsWithDistance = useMemo(() => {
    if (!position) return [];
    const stops = localStops.getNearby(position.lat, position.lng, 900).slice(0, 4);
    return stops.map((stop) => ({
      ...stop,
      distance: calculateDistanceMeters(position.lat, position.lng, stop.position.lat, stop.position.lng)
    }));
  }, [position]);

  const hour = new Date().getHours();
  const greeting =
    hour < 6 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative min-h-dvh bg-surface-soft pb-28 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink-text overflow-x-hidden font-sans antialiased selection:bg-primary selection:text-white">
      
      {/* Decorative ambient glow */}
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-md px-4 space-y-4">
        
        {/* 1. COMPACT HEADER */}
        <header className="flex items-center justify-between pt-1 pb-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-ink-text">
                Kharkiv <span className="text-emerald-600">GO</span>
              </span>
              <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-full">
                BETA
              </span>
            </div>
            <h1 className="font-display text-xl font-bold text-ink-text mt-0.5 tracking-tight">{greeting} 👋</h1>
            <p className="text-[11px] text-ink-muted font-medium">Kharkiv public transport navigation</p>
          </div>

          <div className="flex items-center gap-2">
            <button 
              aria-label="Notifications"
              className="p-2.5 rounded-full bg-surface-raised border border-border/40 hover:bg-surface transition-all active:scale-95 text-ink-text shadow-sm"
            >
              <Bell size={17} />
            </button>
            <button 
              aria-label="Settings"
              className="p-2.5 rounded-full bg-surface-raised border border-border/40 hover:bg-surface transition-all active:scale-95 text-ink-text shadow-sm"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        {/* 2. METRO ONLINE CARD (Main Accent) */}
        <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 shadow-lg shadow-emerald-900/10 transition-transform duration-300 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 bg-white/15 px-3 py-1 rounded-full backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span className="text-xs font-semibold tracking-wide uppercase">🚇 Metro Online</span>
            </div>
            <Activity size={16} className="text-emerald-200" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
              <div className="text-2xl font-black tracking-tight">18</div>
              <div className="text-[11px] text-emerald-100 font-medium">active trains</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/10">
              <div className="text-2xl font-black tracking-tight">3</div>
              <div className="text-[11px] text-emerald-100 font-medium">active lines</div>
            </div>
          </div>

          <Link
            to="/metro/live"
            className="w-full py-3 px-4 bg-surface-raised text-emerald-800 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:bg-emerald-50 active:scale-[0.98] transition-all duration-200"
          >
            <Train size={18} />
            <span>Open metro map</span>
            <ArrowUpRight size={16} className="text-emerald-700" />
          </Link>
        </section>

        {/* 3. QUICK ACTIONS (2×2 Grid) */}
        <section className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-3 duration-400">
          {[
            { label: 'Routes', icon: Bus, to: '/routes', color: 'bg-blue-50 text-blue-600' },
            { label: 'Map', icon: MapIcon, to: '/map', color: 'bg-emerald-50 text-emerald-600' },
            { label: 'Metro', icon: Train, to: '/metro/live', color: 'bg-amber-50 text-amber-600' },
            { label: 'Favorites', icon: Star, to: '/favorites', color: 'bg-purple-50 text-purple-600' },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={index}
                to={item.to}
                className="bg-surface-raised rounded-[22px] p-4 flex items-center gap-3.5 border border-border/40 shadow-sm hover:shadow-md hover:border-border/60 active:scale-[0.97] transition-all duration-200 group"
              >
                <div className={`w-11 h-11 rounded-2xl ${item.color} flex items-center justify-center transition-transform group-hover:scale-110 shadow-2xs`}>
                  <Icon size={21} />
                </div>
                <span className="font-bold text-ink-text text-sm">{item.label}</span>
              </Link>
            );
          })}
        </section>

        {/* 4. NEARBY STOPS */}
        <section className="bg-surface-raised rounded-[22px] p-4 border border-border/40 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <Navigation size={16} />
              </div>
              <h2 className="font-bold text-ink-text text-sm">📍 Nearby</h2>
            </div>
            <Link 
              to="/map"
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 active:scale-95 transition-transform"
            >
              <span>Show all</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          {nearbyStopsWithDistance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center bg-surface-soft rounded-xl border border-dashed border-border/60 px-3">
              <Navigation className="h-5 w-5 text-ink-muted mb-1 animate-bounce" />
              <p className="text-xs font-medium text-ink-muted">Enable GPS to find nearby stops</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nearbyStopsWithDistance.map((stop) => (
                <Link
                  key={stop.id}
                  to={`/map?q=${encodeURIComponent(stop.name)}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-soft hover:bg-primary/10 transition-colors border border-transparent hover:border-primary/15 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-surface-raised shadow-xs flex items-center justify-center text-emerald-600 font-bold text-xs shrink-0">
                      🚏
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-text text-xs truncate group-hover:text-primary">{stop.name}</div>
                      <div className="text-[10px] text-ink-muted">Transport stop</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full shrink-0">
                    {formatDistance(stop.distance)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 5. FAVORITES */}
        <section className="bg-surface-raised rounded-[22px] p-4 border border-border/40 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-50 text-amber-600 rounded-xl">
                <Star size={16} className="fill-amber-400 text-amber-400" />
              </div>
              <h2 className="font-bold text-ink-text text-sm">Favorites</h2>
            </div>
            {favoriteRouteDetails.length > 0 && (
              <Link to="/favorites" className="text-xs font-bold text-amber-600 hover:text-amber-700">
                All
              </Link>
            )}
          </div>

          {favoriteRouteDetails.length === 0 ? (
            <div className="text-center py-5 px-4 bg-surface-soft rounded-xl border border-dashed border-border/60">
              <div className="text-2xl mb-1">⭐</div>
              <p className="text-xs font-bold text-ink-text mb-1">No favorites yet</p>
              <p className="text-[11px] text-ink-muted mb-3">Pin routes and stops for quick access</p>
              <Link 
                to="/routes"
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-emerald-700 active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Add</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {favoriteRouteDetails.map((r) => (
                <Link
                  key={r.id}
                  to={`/routes/${r.id}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-soft hover:bg-surface transition-colors border border-border/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm">{KIND_ICON[r.kind]}</span>
                    <span className="font-bold text-ink-text text-xs truncate">{r.number}</span>
                  </div>
                  <ChevronRight size={14} className="text-ink-muted" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 6. TRANSPORT NEWS */}
        <section className="bg-surface-raised rounded-[22px] p-4 border border-border/40 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-xl">
              <AlertCircle size={16} />
            </div>
            <h2 className="font-bold text-ink-text text-sm">Transport News</h2>
          </div>

          <div className="p-3 bg-surface-soft rounded-xl border border-border/40 text-center">
            <p className="text-xs font-medium text-ink-muted">No current updates</p>
          </div>
        </section>

        {/* 7. FOOTER */}
        <footer className="text-center py-2 space-y-0.5">
          <p className="text-[11px] font-medium text-ink-muted">Kharkiv GO • Version 1.3.0 Beta</p>
          <p className="text-[10px] text-ink-muted">Last data update: just now</p>
        </footer>

      </div>
    </div>
  );
}
