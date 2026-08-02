import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Star, 
  ChevronRight, 
  Map as MapIcon, 
  Navigation, 
  Settings, 
  Plus, 
  ArrowUpRight, 
  AlertCircle,
  Search as SearchIcon,
  X,
  History,
  Clock,
  MapPin,
  Compass,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  TrainTrack,
  AlarmClock
} from 'lucide-react';
import { ReportDelayModal } from '@/components/ReportDelayModal';
import { RouteDetailModal } from '@/components/RouteDetailModal';
import { TrainWishSprite } from '@/components/TrainWishSprite';
import { NotificationsBell, NotificationsSection } from '@/components/NotificationsSection';
import { localRoutes, localStops } from '@/data/localData';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuthStore } from '@/store/useAuthStore';
import { useToastStore } from '@/store/useToastStore';
import { assetUrl } from '@/lib/assetUrl';
import {
  BUILT_LINES,
  getActiveTrains,
  getUpcomingArrivalsForStation,
  formatEtaCountdown
} from '@/liveMetro/liveMetroEngine';
import { METRO_STATION_GEO } from '@/liveMetro/metroStationsGeo';
import type { TransportKind, TransportRoute } from '@/types/transport';

// metroicono.png ще не покладений у public/icons (див. README.txt там же) —
// доки його не додадуть, для ВСІХ згадок метро на головній сторінці
// використовуємо вже наявний, гарантовано робочий kharkiv-metro-logo.png.
const metroIconPrimary = assetUrl('/icons/metroicono.png');
const metroIconFallback = assetUrl('/icons/kharkiv-metro-logo.png');
const metroIcon = metroIconFallback;
const routesIcon = assetUrl('/icons/marshryticono.png');
const mapIcon = assetUrl('/icons/kartaicono.png');
const favoritesIcon = assetUrl('/icons/obraneicono.png');

const KIND_ICON: Record<TransportKind, string> = {
  metro: '🚇',
  tram: '🚊',
  trolleybus: '🚎',
  bus: '🚌'
};

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} м`;
  return `${(m / 1000).toFixed(1)} км`;
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
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
  const profile = useAuthStore((s) => s.profile);
  const showToast = useToastStore((s) => s.show);
  const favoriteRoutes = useFavoritesStore((s) => s.routes);
  const favoriteStops = useFavoritesStore((s) => s.stops);
  const { position, locate } = useGeolocation();
  
  const historyEntries = useHistoryStore((s) => s.entries);
  const addHistoryEntry = useHistoryStore((s) => s.addEntry);

  // Модалка "Повідомити про затримку"
  const [isReportDelayOpen, setIsReportDelayOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState<TransportRoute | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Real-time clock & date
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = useMemo(() => {
    return currentTime.toLocaleDateString('uk-UA', { 
      day: 'numeric', 
      month: 'long', 
      weekday: 'short' 
    });
  }, [currentTime]);

  const formattedTimeStr = useMemo(() => {
    return currentTime.toLocaleTimeString('uk-UA', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }, [currentTime]);

  // --- Живі дані метро для картки "Метро онлайн" -------------------------
  const activeMetroTrains = useMemo(() => getActiveTrains(currentTime), [currentTime]);
  const isMetroServiceRunning = activeMetroTrains.length > 0;

  const nearestMetroStation = useMemo(() => {
    if (!position) return null;

    let best: { id: string; name: string; distM: number; lineColor?: string } | null = null;

    for (const { line } of BUILT_LINES) {
      for (const s of line.stations) {
        const geo = METRO_STATION_GEO[s.id];
        if (!geo) continue;

        const distM = calculateDistanceMeters(position.lat, position.lng, geo.lat, geo.lng);

        if (!best || distM < best.distM) {
          best = { id: s.id, name: s.name, distM, lineColor: line.color };
        }
      }
    }
    return best;
  }, [position]);

  const nearestMetroArrivals = useMemo(() => {
    if (!nearestMetroStation) return [];
    return getUpcomingArrivalsForStation(nearestMetroStation.id, currentTime, 2);
  }, [nearestMetroStation, currentTime]);

  const metroTrackArrivals = useMemo(() => {
    if (nearestMetroArrivals.length === 0) return { track1: null, track2: null };
    const track1 = nearestMetroArrivals.find((a) => a.direction === 'forward') ?? nearestMetroArrivals[0] ?? null;
    const track2 = nearestMetroArrivals.find((a) => a.direction === 'backward' && a !== track1) ?? null;
    return { track1, track2 };
  }, [nearestMetroArrivals]);

  const metroNowSec =
    currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();

  // Search results calculation across routes, stops and metro
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return { routes: [], stops: [], metro: [] };
    const q = searchQuery.toLowerCase().trim();

    const matchedRoutes = localRoutes.search(q).slice(0, 4);
    const matchedStops = localStops.search(q).slice(0, 4);
    
    // Search metro stations from routes/stops where kind is metro
    const matchedMetro: Array<{ id: string; name: string; lineName?: string }> = [];
    try {
      const allRoutes = localRoutes.search(q) || [];
      for (const r of allRoutes) {
        if (r.kind === 'metro') {
          matchedMetro.push({ id: r.id, name: r.name, lineName: r.number });
        }
      }
    } catch {
      // fallback
    }

    return {
      routes: matchedRoutes,
      stops: matchedStops,
      metro: matchedMetro.slice(0, 3)
    };
  }, [searchQuery]);

  const hasSearchResults = searchResults.routes.length > 0 || searchResults.stops.length > 0 || searchResults.metro.length > 0;

  // Favorites data
  const favoriteRouteDetails = useMemo(
    () => favoriteRoutes.map((f) => localRoutes.getById(f.routeId)).filter((r): r is NonNullable<typeof r> => !!r),
    [favoriteRoutes]
  );
  const favoriteStopDetails = useMemo(
    () => favoriteStops.map((f) => localStops.getById(f.stopId)).filter((s): s is NonNullable<typeof s> => !!s),
    [favoriteStops]
  );

  // Nearby stops
  const nearbyStopsWithDistance = useMemo(() => {
    if (!position) return [];
    const stops = localStops.getNearby(position.lat, position.lng, 1500).slice(0, 4);
    return stops.map((stop) => ({
      ...stop,
      distance: calculateDistanceMeters(position.lat, position.lng, stop.position.lat, stop.position.lng)
    }));
  }, [position]);

  const hour = currentTime.getHours();
  const greeting = hour < 6 ? 'Доброї ночі' : hour < 12 ? 'Доброго ранку' : hour < 18 ? 'Доброго дня' : 'Доброго вечора';
  const displayName = profile?.displayName || profile?.username || 'Гість';

  return (
    <div className="relative min-h-dvh bg-bg pb-32 pt-[max(0.75rem,env(safe-area-inset-top))] text-ink-text overflow-x-hidden font-sans antialiased selection:bg-primary selection:text-white">
      
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/12 blur-[90px]" />
      <div className="pointer-events-none absolute top-32 -right-16 h-64 w-64 rounded-full bg-gold/8 blur-[80px]" />

      <div className="relative z-10 mx-auto max-w-md px-4 space-y-5">
        
        {/* 1. UPPER HEADER */}
        <header className="flex items-center justify-between pt-2 pb-1 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 shrink-0 rounded-[18px] bg-gradient-to-br from-primary to-forest-dark flex items-center justify-center text-white shadow-lg shadow-primary/25 font-black text-lg tracking-tighter ring-1 ring-white/10">
              GO
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[13px] tracking-tight text-ink-muted">
                  Kharkiv <span className="text-primary font-extrabold">GO</span>
                </span>
                <span className="px-2 py-0.5 text-[9px] font-extrabold bg-primary/10 text-primary rounded-full border border-primary/20">
                  PRO
                </span>
              </div>
              <h1 className="font-display text-xl font-black text-ink-text mt-0.5 tracking-tight truncate max-w-[210px]">
                {greeting}, {displayName} 👋
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden xs:flex flex-col items-end text-right mr-0.5">
              <span className="text-sm font-extrabold text-ink-text tabular-nums">{formattedTimeStr}</span>
              <span className="text-[10px] font-semibold text-ink-muted capitalize">{formattedDate}</span>
            </div>
            
            <NotificationsBell />

            <Link 
              to="/profile"
              aria-label="Налаштування"
              className="p-2.5 rounded-[16px] bg-surface-raised border border-border/40 hover:bg-surface-soft transition-all active:scale-90 text-ink-text shadow-sm"
            >
              <Settings size={19} />
            </Link>
          </div>
        </header>

        {/* 2. ADVANCED REAL-TIME SEARCH BAR */}
        <div className="relative z-30 animate-in fade-in slide-in-from-top-1 duration-500 delay-75 fill-mode-both">
          <TrainWishSprite />
          <div className={`relative flex items-center bg-surface-raised rounded-[24px] border transition-all duration-200 shadow-sm ${
            isSearchFocused ? 'border-primary/40 ring-4 ring-primary/10 shadow-md' : 'border-border/40 hover:border-border/60'
          }`}>
            <div className="pl-4 pr-2 text-ink-muted">
              <SearchIcon size={19} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              placeholder="Пошук маршруту, зупинки, метро..."
              className="w-full py-4 pr-4 text-sm font-semibold text-ink-text bg-transparent outline-none placeholder:text-ink-muted placeholder:font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-2 mr-2 text-ink-muted hover:text-ink-text rounded-full transition-colors"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* Search Dropdown Results Panel */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <>
              {/* Backdrop to close search */}
              <div 
                className="fixed inset-0 z-20 bg-ink-text/20 backdrop-blur-xs"
                onClick={() => setIsSearchFocused(false)}
              />
              
              <div className="absolute left-0 right-0 top-14 z-30 bg-surface-raised rounded-[22px] border border-border/40 shadow-2xl p-3 max-h-[380px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                {!hasSearchResults ? (
                  <div className="py-8 text-center">
                    <p className="text-xs font-bold text-ink-text mb-1">Нічого не знайдено</p>
                    <p className="text-[11px] text-ink-muted">Спробуйте змінити запит</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Routes */}
                    {searchResults.routes.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-ink-muted px-2 mb-1.5">Маршрути</div>
                        <div className="space-y-1">
                          {searchResults.routes.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setIsSearchFocused(false);
                                addHistoryEntry({ query: `Маршрут ${r.number}`, type: 'route' });
                                setActiveRoute(r);
                              }}
                              className="flex w-full items-center justify-between p-2 rounded-xl hover:bg-primary/10 transition-colors group"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-sm">{KIND_ICON[r.kind]}</span>
                                <span className="font-bold text-xs text-ink-text group-hover:text-primary">{r.number} — {r.name}</span>
                              </div>
                              <ChevronRight size={14} className="text-ink-muted" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stops */}
                    {searchResults.stops.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-ink-muted px-2 mb-1.5">Зупинки</div>
                        <div className="space-y-1">
                          {searchResults.stops.map((s) => (
                            <Link
                              key={s.id}
                              to={`/map?q=${encodeURIComponent(s.name)}`}
                              onClick={() => {
                                setIsSearchFocused(false);
                                addHistoryEntry({ query: s.name, type: 'stop' });
                              }}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-primary/10 transition-colors group"
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-xs">🚏</span>
                                <span className="font-bold text-xs text-ink-text group-hover:text-primary">{s.name}</span>
                              </div>
                              <ChevronRight size={14} className="text-ink-muted" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metro Stations */}
                    {searchResults.metro.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-ink-muted px-2 mb-1.5">Метро</div>
                        <div className="space-y-1">
                          {searchResults.metro.map((m) => (
                            <Link
                              key={m.id}
                              to={`/metro/live`}
                              onClick={() => {
                                setIsSearchFocused(false);
                                addHistoryEntry({ query: m.name, type: 'route' });
                              }}
                              className="flex items-center justify-between p-2 rounded-xl hover:bg-primary/10 transition-colors group"
                            >
                              <div className="flex items-center gap-2.5">
                                <img src={metroIcon} alt="Метро" className="w-6 h-6 rounded-lg object-contain bg-gold/15 p-0.5" />
                                <div>
                                  <span className="font-bold text-xs text-ink-text group-hover:text-primary block">{m.name}</span>
                                  {m.lineName && <span className="text-[10px] text-ink-muted">{m.lineName}</span>}
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-ink-muted" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 3. QUICK ACTIONS GRID (2x2) — премиальные плитки в мягком iOS-стиле, каждая со своим акцентом */}
        <section className="grid grid-cols-2 gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-both">
          {[
            { label: 'Маршрути', icon: Navigation, image: routesIcon, imageFallback: undefined as string | undefined, to: '/routes', tint: 'bg-primary/12 text-primary', imageScale: 'scale-125', overflowVisible: false },
            { label: 'Карта', icon: MapIcon, image: mapIcon, imageFallback: undefined as string | undefined, to: '/map', tint: 'bg-blue-500/12 text-blue-500', imageScale: 'scale-125', overflowVisible: false },
            { label: 'Метро', icon: TrainTrack, image: metroIconPrimary, imageFallback: metroIconFallback as string | undefined, to: '/metro/live', tint: 'bg-emerald-500/12 text-emerald-500', imageScale: 'scale-150', overflowVisible: true },
            { label: 'Обране', icon: Star, image: favoritesIcon, imageFallback: undefined as string | undefined, to: '/favorites', tint: 'bg-gold/14 text-gold', imageScale: 'scale-125', overflowVisible: false },
          ].map((item, index) => {
            const Icon = item.icon;
            const fallback = item.imageFallback;
            return (
              <Link
                key={index}
                to={item.to}
                className="bg-surface-raised rounded-[20px] p-3 flex items-center gap-3 border border-border/40 shadow-sm hover:shadow-md hover:border-border/60 active:scale-[0.97] transition-all duration-200 group"
              >
                <div className={`w-14 h-14 shrink-0 rounded-[16px] ${item.tint} flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${item.overflowVisible ? 'overflow-visible' : 'overflow-hidden'}`}>
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.label}
                      className={`w-[3.75rem] h-[3.75rem] object-contain ${item.imageScale} ${item.overflowVisible ? 'relative z-10' : ''}`}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement & { dataset: { triedFallback?: string } };
                        // Спочатку, якщо є запасний PNG (напр. лого метро замість
                        // ще не завантаженого metroicono.png) — пробуємо його.
                        if (fallback && img.dataset.triedFallback !== '1') {
                          img.dataset.triedFallback = '1';
                          img.src = fallback;
                          return;
                        }
                        // Якщо і запасний PNG не завантажився — ховаємо картинку
                        // і показуємо lucide-іконку замість неї.
                        img.style.display = 'none';
                        const iconFallback = img.nextElementSibling as HTMLElement | null;
                        if (iconFallback) iconFallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  {Icon && (
                    <Icon
                      size={26}
                      style={item.image ? { display: 'none' } : undefined}
                    />
                  )}
                </div>
                <span className="font-extrabold text-ink-text text-[13px] tracking-tight leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </section>

        {/* 3.5. SMART DEPARTURE REMINDER ENTRY POINT */}
        <Link
          to="/reminders"
          className="flex items-center gap-3 rounded-[20px] border border-border/40 bg-surface-raised p-4 shadow-sm hover:shadow-md hover:border-border/60 active:scale-[0.98] transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/12 text-primary">
            <AlarmClock size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-ink-text">Час виходити</p>
            <p className="truncate text-xs text-ink-muted font-medium">Розумне нагадування про вихід із дому</p>
          </div>
          <ChevronRight size={17} className="shrink-0 text-ink-muted" />
        </Link>

        {/* 4. LIVE METRO CARD */}
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 shadow-lg shadow-emerald-900/20 ring-1 ring-white/10 transition-transform duration-300 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both">
          <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-32 h-32 bg-emerald-300/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 bg-white/15 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              <span className="text-xs font-bold tracking-wide uppercase">Метро онлайн</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold bg-white/10 px-2.5 py-1.5 rounded-full text-emerald-100">
              <CheckCircle2 size={13} className="text-emerald-300" />
              <span>Працює штатно</span>
            </div>
          </div>

          {!isMetroServiceRunning ? (
            <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10 mb-4 text-center">
              <div className="text-xs font-bold text-emerald-100">🌙 Нічна перерва</div>
              <div className="text-[11px] text-emerald-100/70 mt-0.5">Перші потяги о 05:30</div>
            </div>
          ) : !position ? (
            <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10 mb-4 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-emerald-100 flex items-center gap-1.5">
                <MapPin size={13} className="text-emerald-200" />
                Увімкніть геопозицію, щоб бачити рейси з найближчої станції
              </span>
              <button
                onClick={() => locate()}
                className="shrink-0 text-[11px] font-bold text-white bg-white/15 px-2.5 py-1 rounded-full hover:bg-white/25 transition-colors"
              >
                Дозволити
              </button>
            </div>
          ) : nearestMetroStation ? (
            <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10 mb-4 space-y-2">
              <Link
                to={`/metro/live?station=${nearestMetroStation.id}&tab=timetable`}
                className="flex items-center justify-between hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/25"
                    style={{ backgroundColor: nearestMetroStation.lineColor ?? '#ffffff' }}
                  />
                  <span className="truncate text-xs font-bold text-white">ст. {nearestMetroStation.name}</span>
                </div>
                <span className="shrink-0 text-[10px] font-semibold bg-white/15 px-2 py-0.5 rounded-full text-emerald-100">
                  {formatDistance(nearestMetroStation.distM)}
                </span>
              </Link>

              <MetroTrackRow label="Колія 1" arrival={metroTrackArrivals.track1} nowSec={metroNowSec} />
              <MetroTrackRow label="Колія 2" arrival={metroTrackArrivals.track2} nowSec={metroNowSec} />
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-3.5 border border-white/10 mb-4 text-center">
              <div className="text-[11px] text-emerald-100">Не вдалось визначити найближчу станцію</div>
            </div>
          )}

          <Link
            to={nearestMetroStation ? `/metro/live?station=${nearestMetroStation.id}&tab=timetable` : '/metro/live'}
            className="relative w-full py-4 px-4 bg-white text-emerald-700 rounded-[18px] font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:brightness-105 active:scale-[0.98] transition-all duration-200"
          >
            <img src={metroIcon} alt="Метро" className="w-4 h-4 object-contain" />
            <span>{nearestMetroStation ? 'Розклад найближчої станції' : 'Відкрити карту метро'}</span>
            <ArrowUpRight size={17} />
          </Link>
        </section>

        <NotificationsSection />

        {/* 5. NEAREST STOPS WITH GEO PERMISSION/STATE */}
        <section className="bg-surface-raised rounded-[24px] p-4 border border-border/40 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 text-primary rounded-[14px]">
                <Navigation size={17} />
              </div>
              <h2 className="font-extrabold text-ink-text text-sm">Найближчі зупинки</h2>
            </div>
            <Link 
              to="/map"
              className="text-xs font-bold text-primary flex items-center gap-0.5 active:scale-95 transition-transform"
            >
              <span>На карті</span>
              <ChevronRight size={14} />
            </Link>
          </div>

          {!position ? (
            <div className="flex flex-col items-center justify-center py-7 text-center bg-surface-soft rounded-[18px] border border-dashed border-border/60 px-4">
              <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center mb-2.5">
                <Compass size={21} className="animate-spin" />
              </div>
              <p className="text-sm font-bold text-ink-text mb-1">Геолокація вимкнена або не дозволена</p>
              <p className="text-xs text-ink-muted mb-3.5 max-w-[240px]">Увімкніть доступ до GPS, щоб бачити зупинки поруч з вами</p>
              <button
                onClick={() => locate()}
                className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-sm hover:brightness-105 active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <MapPin size={14} />
                <span>Увімкнути геолокацію</span>
              </button>
            </div>
          ) : nearbyStopsWithDistance.length === 0 ? (
            <div className="py-4 text-center bg-surface-soft rounded-[18px] border border-border/40">
              <p className="text-xs font-medium text-ink-muted">Поблизу зупинок не знайдено</p>
            </div>
          ) : (
            <div className="space-y-2">
              {nearbyStopsWithDistance.map((stop) => (
                <Link
                  key={stop.id}
                  to={`/map?q=${encodeURIComponent(stop.name)}`}
                  onClick={() => addHistoryEntry({ query: stop.name, type: 'stop' })}
                  className="flex items-center justify-between p-3 rounded-[18px] bg-surface-soft hover:bg-primary/10 transition-colors border border-transparent hover:border-primary/15 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-[13px] bg-surface-raised shadow-xs flex items-center justify-center text-primary font-bold text-sm shrink-0 border border-border/40">
                      🚏
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-ink-text text-sm truncate group-hover:text-primary">{stop.name}</div>
                      <div className="text-[11px] text-ink-muted font-medium">Зупинка громадського транспорту</div>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-primary bg-primary/15 px-3 py-1.5 rounded-full shrink-0">
                    {formatDistance(stop.distance)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 6. FAVORITES SECTION */}
        <section className="bg-surface-raised rounded-[24px] p-4 border border-border/40 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gold/10 text-gold rounded-[14px]">
                <Star size={17} className="fill-gold text-gold" />
              </div>
              <h2 className="font-extrabold text-ink-text text-sm">Обране</h2>
            </div>
            {(favoriteRouteDetails.length > 0 || favoriteStopDetails.length > 0) && (
              <Link to="/favorites" className="text-xs font-bold text-gold hover:brightness-110 flex items-center gap-0.5">
                <span>Усі ({favoriteRouteDetails.length + favoriteStopDetails.length})</span>
                <ChevronRight size={14} />
              </Link>
            )}
          </div>

          {favoriteRouteDetails.length === 0 && favoriteStopDetails.length === 0 ? (
            <div className="text-center py-7 px-4 bg-surface-soft rounded-[18px] border border-dashed border-border/60">
              <div className="text-3xl mb-1.5">⭐</div>
              <p className="text-sm font-extrabold text-ink-text mb-1">У вас ще немає обраного</p>
              <p className="text-xs text-ink-muted mb-3.5 max-w-[220px] mx-auto">Закріплюйте маршрути та зупинки для швидкого доступу</p>
              <Link 
                to="/routes"
                className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-sm hover:brightness-105 active:scale-95 transition-all inline-flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>Додати маршрути</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {favoriteRouteDetails.slice(0, 3).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    addHistoryEntry({ query: `Маршрут ${r.number}`, type: 'route' });
                    setActiveRoute(r);
                  }}
                  className="flex w-full items-center justify-between p-3 rounded-[18px] bg-surface-soft hover:bg-surface transition-colors border border-border/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {r.kind === 'metro' ? (
                      <img src={metroIcon} alt="Метро" className="w-5 h-5 object-contain" />
                    ) : (
                      <span className="text-base">{KIND_ICON[r.kind]}</span>
                    )}
                    <div className="truncate">
                      <span className="font-extrabold text-ink-text text-sm truncate block">{r.number} — {r.name}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-ink-muted shrink-0" />
                </button>
              ))}

              {favoriteStopDetails.slice(0, 2).map((s) => (
                <Link
                  key={s.id}
                  to={`/map?q=${encodeURIComponent(s.name)}`}
                  onClick={() => addHistoryEntry({ query: s.name, type: 'stop' })}
                  className="flex items-center justify-between p-3 rounded-[18px] bg-surface-soft hover:bg-surface transition-colors border border-border/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-xs">🚏</span>
                    <span className="font-extrabold text-ink-text text-sm truncate">{s.name}</span>
                  </div>
                  <ChevronRight size={14} className="text-ink-muted shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 7. RECENT HISTORY SECTION */}
        {historyEntries.length > 0 && (
          <section className="bg-surface-raised rounded-[24px] p-4 border border-border/40 shadow-sm">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-surface text-ink-text rounded-[14px]">
                  <History size={17} />
                </div>
                <h2 className="font-extrabold text-ink-text text-sm">Останні переглянуті</h2>
              </div>
            </div>

            <div className="space-y-1.5 max-h-52 overflow-y-auto no-scrollbar">
              {historyEntries.slice(0, 5).map((entry, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-[16px] bg-surface-soft hover:bg-surface transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Clock size={14} className="text-ink-muted shrink-0" />
                    <span className="font-bold text-sm text-ink-text truncate">{entry.query}</span>
                  </div>
                  <span className="text-[10px] text-ink-muted font-medium shrink-0 ml-2">Щойно</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. TRANSPORT NEWS & ANNOUNCEMENTS */}
        <section className="bg-surface-raised rounded-[24px] p-4 border border-border/40 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="p-2 bg-surface-soft text-ink-muted rounded-[14px]">
              <AlertCircle size={17} />
            </div>
            <h2 className="font-extrabold text-ink-text text-sm">Новини транспорту</h2>
          </div>

          <div className="p-4 bg-surface-soft rounded-[18px] border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-surface-raised text-ink-text">Офіційно</span>
              <span className="text-[10px] font-semibold text-ink-muted">Сьогодні, 08:00</span>
            </div>
            <h3 className="font-extrabold text-ink-text text-sm">Зміни в розкладі рухів тролейбусів у місті</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Інформація щодо оновлення маршрутів громадського транспорту Харкова в умовах воєнного стану.
            </p>
            <div className="pt-1">
              <button 
                onClick={() => showToast('Детальна інформація доступна в офіційному Telegram каналі Kharkiv GO.')}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:brightness-110"
              >
                <span>Детальніше</span>
                <ExternalLink size={13} />
              </button>
            </div>
          </div>
        </section>

        {/* 9. REPORT DELAY CTA */}
        <button
          onClick={() => setIsReportDelayOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-gold/25 bg-gold/10 py-4 text-sm font-extrabold text-gold shadow-sm transition-all active:scale-[0.98] hover:bg-gold/15"
        >
          <AlertTriangle size={17} />
          <span>Повідомити про затримку</span>
        </button>

        {/* 10. FOOTER */}
        <footer className="text-center py-5 space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-ink-text">
            <span>Kharkiv GO</span>
            <span className="text-ink-muted">•</span>
            <span className="text-primary">v1.3.0 Pro</span>
          </div>
          <p className="text-[11px] text-ink-muted font-medium">Найнадійніший міський навігатор Харкова</p>
        </footer>

      </div>

      <ReportDelayModal open={isReportDelayOpen} onClose={() => setIsReportDelayOpen(false)} />
      <RouteDetailModal route={activeRoute} open={!!activeRoute} onClose={() => setActiveRoute(null)} />
    </div>
  );
}

interface MetroTrackRowProps {
  label: string;
  arrival: ReturnType<typeof getUpcomingArrivalsForStation>[number] | null;
  nowSec: number;
}

/** Один рядок картки "Метро онлайн" на головній — рейс по одній колії з відліком часу. */
function MetroTrackRow({ label, arrival, nowSec }: MetroTrackRowProps) {
  if (!arrival) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-emerald-100/50">
        <span className="font-semibold">{label}</span>
        <span className="italic">Рейсів не очікується</span>
      </div>
    );
  }

  const isAtStation = arrival.etaSec <= 5 && arrival.etaSec >= -15;

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: arrival.lineColor }}
        />
        <span className="text-[11px] font-semibold text-emerald-100/70 shrink-0">{label}:</span>
        <span className="truncate text-xs font-bold text-white">→ {arrival.headsign}</span>
      </div>
      <span
        className={`shrink-0 text-xs font-black tabular-nums ${
          isAtStation ? 'text-emerald-200 animate-pulse' : 'text-white'
        }`}
      >
        {isAtStation ? 'На станції' : formatEtaCountdown(arrival.etaSec, nowSec)}
      </span>
    </div>
  );
}
