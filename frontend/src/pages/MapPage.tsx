import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { 
  X, 
  Mic, 
  Plus, 
  Minus, 
  Compass, 
  Navigation, 
  Bus, 
  Zap, 
  TrainTrack,
  MapPin,
  ArrowUpDown,
  Route as RouteIcon,
  LocateFixed
} from 'lucide-react';
import { MapView } from '@/components/MapView';
import { MetroLayer } from '@/components/MetroLayer';
import { StopDetailModal } from '@/components/StopDetailModal';
import { TripPlanSheet } from '@/components/TripPlanSheet';
import { RouteSheet } from '@/components/RouteSheet';
import { Sheet } from '@/components/ui/Sheet';
import { MapSearchSuggestions } from '@/components/MapSearchSuggestions';
import { GpsButton } from '@/components/GpsButton';
import { MapModeButton } from '@/components/MapModeButton';
import { TransportLayersPanel } from '@/components/TransportLayersPanel';
import { useGeolocation } from '@/hooks/useGeolocation';
import { localRoutes, localStops, type TripPlan, type StopItem } from '@/data/localData';
import { getRouteBounds } from '@/lib/mapLayers';
import { refineTripPlansWithOSM } from '@/lib/tripPlanRefine';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { TransportKind } from '@/types/transport';

const SUGGESTIONS_LIMIT = 6;
const STORAGE_PREFIX = 'kharkiv_go_map_state_';

const CHIP_FILTERS: { id: TransportKind | 'stops'; label: string; icon: typeof Bus }[] = [
  { id: 'bus', label: 'Автобуси', icon: Bus },
  { id: 'trolleybus', label: 'Тролейбуси', icon: Zap },
  { id: 'tram', label: 'Трамваї', icon: TrainTrack },
  { id: 'metro', label: 'Метро', icon: TrainTrack },
  { id: 'stops', label: 'Зупинки', icon: Navigation },
];

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const { position, heading, isMoving, isLocating, error, locate } = useGeolocation();
  
  const storeVisibleKinds = useSettingsStore((s) => s.visibleTransportKinds);
  const showStops = useSettingsStore((s) => s.showStopsOnMap);
  const toggleStopsOnMap = useSettingsStore((s) => s.toggleStopsOnMap);

  const [map, setMap] = useState<MapLibreMap | null>(null);

  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedMetroTrainId, setSelectedMetroTrainId] = useState<string | null>(null);

  // --- Побудова маршруту "Звідки -> Куди" -------------------------------
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState(initialQuery);
  const [fromPoint, setFromPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [toPoint, setToPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);
  const [tripPlans, setTripPlans] = useState<TripPlan[] | null>(null);
  const [isRefiningTrip, setIsRefiningTrip] = useState(false);
  const refineRequestIdRef = useRef(0);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [activeFilterChips, setActiveFilterChips] = useState<Record<string, boolean>>(() => {
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}filters`);
      if (cached) return JSON.parse(cached);
    } catch {
      // fallback
    }
    return {
      bus: true,
      trolleybus: true,
      tram: true,
      metro: true,
      stops: true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}filters`, JSON.stringify(activeFilterChips));
    } catch {
      // quota exceeded or private mode
    }
  }, [activeFilterChips]);

  const visibleKinds = useMemo(() => {
    return storeVisibleKinds.filter((kind) => activeFilterChips[kind] ?? true);
  }, [storeVisibleKinds, activeFilterChips]);

  const [voiceSupported] = useState(() => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window));
  const [isListening, setIsListening] = useState(false);

  const handleVoiceSearch = useCallback((field: 'from' | 'to') => {
    const SpeechRecognitionCtor: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'uk-UA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript as string | undefined;
      if (transcript) {
        if (field === 'from') setFromQuery(transcript);
        else setToQuery(transcript);
        setActiveField(field);
      }
    };
    recognition.start();
  }, []);

  const selectedStop = useMemo(() => (selectedStopId ? localStops.getById(selectedStopId) : undefined), [selectedStopId]);
  const arrivals = useMemo(() => (selectedStopId ? localStops.getArrivals(selectedStopId) : []), [selectedStopId]);
  const selectedRoute = useMemo(() => (selectedRouteId ? localRoutes.getById(selectedRouteId) : undefined), [selectedRouteId]);

  const activeFieldQuery = activeField === 'from' ? fromQuery : activeField === 'to' ? toQuery : '';
  const fieldSuggestions = useMemo(
    () => (activeField && activeFieldQuery.trim() ? localStops.search(activeFieldQuery).slice(0, SUGGESTIONS_LIMIT) : []),
    [activeField, activeFieldQuery]
  );

  const clearSelection = useCallback(() => {
    setSelectedStopId(null);
    setSelectedRouteId(null);
  }, []);

  const handleStopSelect = useCallback((stopId: string) => {
    setSelectedRouteId(null);
    setSelectedStopId(stopId);
    setActiveField(null);
    const stop = localStops.getById(stopId);
    if (map && stop) {
      map.flyTo({ center: [stop.position.lng, stop.position.lat], zoom: Math.max(map.getZoom(), 15.5), essential: true });
    }
  }, [map]);

  const handleRouteSelect = useCallback((routeId: string) => {
    setSelectedStopId(null);
    setSelectedRouteId((current) => (current === routeId ? null : routeId));
    setActiveField(null);
    if (map) {
      const coords = getRouteBounds(routeId);
      if (coords.length >= 2) {
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)]
          ],
          { padding: { top: 140, bottom: 280, left: 40, right: 40 }, duration: 700, maxZoom: 16 }
        );
      }
    }
  }, [map]);

  const handlePickPoint = useCallback((field: 'from' | 'to', stop: StopItem) => {
    const point = { lat: stop.position.lat, lng: stop.position.lng };
    if (field === 'from') {
      setFromPoint(point);
      setFromQuery(stop.name);
    } else {
      setToPoint(point);
      setToQuery(stop.name);
      setSearchParams({ q: stop.name });
    }
    setActiveField(null);
    setTripPlans(null);
    setSelectedPlanIndex(null);
    clearSelection();
  }, [clearSelection, setSearchParams]);

  const [pendingUseLocation, setPendingUseLocation] = useState(false);

  const handleUseMyLocationAsFrom = useCallback(() => {
    if (position) {
      setFromPoint({ lat: position.lat, lng: position.lng });
      setFromQuery('Моє місцезнаходження');
      setTripPlans(null);
    setSelectedPlanIndex(null);
    } else {
      setPendingUseLocation(true);
      locate();
    }
  }, [position, locate]);

  useEffect(() => {
    if (pendingUseLocation && position) {
      setFromPoint({ lat: position.lat, lng: position.lng });
      setFromQuery('Моє місцезнаходження');
      setPendingUseLocation(false);
    }
  }, [pendingUseLocation, position]);

  const handleSwapPoints = useCallback(() => {
    setFromPoint(toPoint);
    setToPoint(fromPoint);
    setFromQuery(toQuery);
    setToQuery(fromQuery);
    setTripPlans(null);
    setSelectedPlanIndex(null);
  }, [fromPoint, toPoint, fromQuery, toQuery]);

  const handleBuildTrip = useCallback(() => {
    if (!fromPoint || !toPoint) return;
    clearSelection();
    const plans = localRoutes.buildTripPlans(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng);
    setTripPlans(plans);
    setSelectedPlanIndex(plans.length > 0 ? 0 : null);

    if (map) {
      map.fitBounds(
        [
          [Math.min(fromPoint.lng, toPoint.lng), Math.min(fromPoint.lat, toPoint.lat)],
          [Math.max(fromPoint.lng, toPoint.lng), Math.max(fromPoint.lat, toPoint.lat)]
        ],
        { padding: { top: 160, bottom: 320, left: 60, right: 60 }, duration: 700, maxZoom: 15 }
      );
    }

    // Перший показ — миттєвий (побудований по прямій відстані). Одразу
    // після цього запускаємо другий, уточнюючий прохід через OpenStreetMap
    // (реальна пішохідна мережа вулиць), який тихо підправляє цифри ходьби
    // і, за потреби, переставляє варіанти місцями — без блокування UI.
    if (plans.length > 0) {
      const requestId = ++refineRequestIdRef.current;
      setIsRefiningTrip(true);
      refineTripPlansWithOSM(plans, fromPoint, toPoint)
        .then((refined) => {
          // Ігноруємо застарілу відповідь, якщо користувач встиг побудувати
          // ще один маршрут, поки цей запит ще виконувався.
          if (refineRequestIdRef.current !== requestId) return;
          setTripPlans(refined);
          setSelectedPlanIndex(refined.length > 0 ? 0 : null);
        })
        .finally(() => {
          if (refineRequestIdRef.current === requestId) setIsRefiningTrip(false);
        });
    }
  }, [fromPoint, toPoint, map, clearSelection]);

  const selectedTripPlan = useMemo(
    () => (tripPlans && selectedPlanIndex !== null ? tripPlans[selectedPlanIndex] : null),
    [tripPlans, selectedPlanIndex]
  );

  useEffect(() => {
    if (tripPlans === null) {
      refineRequestIdRef.current += 1;
      setIsRefiningTrip(false);
    }
  }, [tripPlans]);

  const handleSelectTripOption = useCallback((index: number) => {
    setSelectedPlanIndex(index);
    setSelectedStopId(null);
    setSelectedRouteId(null);

    const plan = tripPlans?.[index];
    if (!plan || !map) return;

    const coords: [number, number][] = [];
    if (fromPoint) coords.push([fromPoint.lng, fromPoint.lat]);
    plan.legs.forEach((leg) => {
      coords.push([leg.boardStop.position.lng, leg.boardStop.position.lat]);
      coords.push([leg.alightStop.position.lng, leg.alightStop.position.lat]);
    });
    if (toPoint) coords.push([toPoint.lng, toPoint.lat]);

    if (coords.length >= 2) {
      const lngs = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)]
        ],
        { padding: { top: 160, bottom: 340, left: 60, right: 60 }, duration: 700, maxZoom: 16 }
      );
    }
  }, [tripPlans, fromPoint, toPoint, map]);

  const handleUseStopAsFrom = useCallback((stop: StopItem) => {
    setFromPoint({ lat: stop.position.lat, lng: stop.position.lng });
    setFromQuery(stop.name);
    setTripPlans(null);
    setSelectedPlanIndex(null);
    clearSelection();
  }, [clearSelection]);

  const handleUseStopAsTo = useCallback((stop: StopItem) => {
    setToPoint({ lat: stop.position.lat, lng: stop.position.lng });
    setToQuery(stop.name);
    setTripPlans(null);
    setSelectedPlanIndex(null);
    clearSelection();
  }, [clearSelection]);

  const toggleChip = useCallback((id: string) => {
    setActiveFilterChips((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (id === 'stops') {
        toggleStopsOnMap();
      }
      return next;
    });
  }, [toggleStopsOnMap]);

  useEffect(() => {
    if (!map) return;

    try {
      const cachedState = localStorage.getItem(`${STORAGE_PREFIX}camera`);
      if (cachedState) {
        const { center, zoom } = JSON.parse(cachedState);
        if (center && typeof zoom === 'number') {
          map.jumpTo({ center, zoom });
        }
      }
    } catch {
      // Ignore
    }

    const handleMoveEnd = () => {
      try {
        const center = map.getCenter().toArray();
        const zoom = map.getZoom();
        localStorage.setItem(`${STORAGE_PREFIX}camera`, JSON.stringify({ center, zoom }));
      } catch {
        // Ignore
      }
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map]);

  useEffect(() => {
    if (initialQuery) setToQuery(initialQuery);
  }, [initialQuery]);

  // Карта доступна одразу, без екрана завантаження — <MapView> рендериться
  // і стає інтерактивною відразу після переходу на розділ "Карта", а не
  // після події 'load' від MapLibre (стиль/тайли/зупинки доопрацьовуються
  // самі, поки користувач вже може панорамувати й тапати по карті).
  const handleMapReady = useCallback((mapInstance: MapLibreMap | null) => {
    if (!mapInstance) return;
    setMap(mapInstance);
  }, []);

  // Застосовуємо ?route=<id> / ?stop=<id> з URL — саме сюди веде кнопка
  // "Показати на карті" в RouteDetailContent (розділ "Маршрути"). Раніше
  // MapPage читав з URL лише параметр "q" — посилання /map?route=... не
  // оброблялося зовсім, тож карта відкривалася порожньою, без підсвіченого
  // маршруту. Чекаємо готову карту (для fitBounds/flyTo), один раз
  // застосовуємо параметри й одразу прибираємо їх з адресного рядка, щоб
  // повторний вибір маршруту вручну не "затирався" назад цим самим URL.
  useEffect(() => {
    if (!map) return;
    const routeId = searchParams.get('route');
    const stopId = searchParams.get('stop');
    if (!routeId && !stopId) return;

    if (routeId) {
      const route = localRoutes.getById(routeId);
      if (route) {
        // Якщо фільтр цього виду транспорту вимкнено — лінія й маркери
        // просто не намалюються на карті, навіть після fitBounds.
        setActiveFilterChips((prev) => (prev[route.kind] ? prev : { ...prev, [route.kind]: true }));
        if (stopId) {
          // Клік по конкретній зупинці всередині маршруту — летимо саме до неї.
          handleStopSelect(stopId);
        } else {
          handleRouteSelect(routeId);
        }
      }
    } else if (stopId) {
      handleStopSelect(stopId);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('route');
    next.delete('stop');
    setSearchParams(next, { replace: true });
  }, [map, searchParams, setSearchParams, handleRouteSelect, handleStopSelect]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-ink-text font-sans antialiased selection:bg-primary selection:text-white">
      
      {/* 1. КАРТА — рендериться і стає доступною одразу, без екрана завантаження */}
      <div className="absolute inset-0 z-0">
        <MapView
          userPosition={position}
          userHeading={heading}
          userIsMoving={isMoving}
          onStopSelect={handleStopSelect}
          selectedRouteId={selectedRouteId}
          onRouteSelect={handleRouteSelect}
          visibleKinds={visibleKinds}
          showStops={showStops}
          onMapReady={handleMapReady}
          fromPoint={fromPoint}
          toPoint={toPoint}
          tripPlan={selectedTripPlan}
        />
        <MetroLayer
          map={map}
          visible={visibleKinds.includes('metro')}
          selectedTrainId={selectedMetroTrainId}
          onTrainSelect={setSelectedMetroTrainId}
        />
      </div>

      {/* 2. ВЕРХНЯ ПАНЕЛЬ: побудова маршруту "Звідки -> Куди" */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2.5 p-4 pt-[max(1rem,env(safe-area-inset-top))] will-change-transform">

        <div className="pointer-events-auto relative rounded-[24px] border border-border/40 bg-surface/95 shadow-xl shadow-black/10 backdrop-blur-xl">
          <div className="flex items-stretch">
            <div className="flex flex-col items-center pl-4 pt-4 pb-4">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/20" />
              <span className="my-1 h-6 w-px flex-1 border-l border-dashed border-ink-text/20" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500 ring-4 ring-rose-500/20" />
            </div>

            <div className="flex-1 divide-y divide-border/40 py-1.5">
              {/* Звідки */}
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  type="text"
                  value={fromQuery}
                  onChange={(e) => {
                    setFromQuery(e.target.value);
                    setFromPoint(null);
                    setTripPlans(null);
    setSelectedPlanIndex(null);
                  }}
                  onFocus={() => {
                    clearTimeout(blurTimeoutRef.current);
                    setActiveField('from');
                  }}
                  onBlur={() => {
                    blurTimeoutRef.current = setTimeout(() => setActiveField((f) => (f === 'from' ? null : f)), 200);
                  }}
                  placeholder="Звідки: адреса, зупинка..."
                  className="w-full bg-transparent py-1.5 text-xs font-semibold text-ink-text placeholder:text-ink-text/40 focus:outline-none"
                />
                <button
                  onClick={handleUseMyLocationAsFrom}
                  aria-label="Моє місцезнаходження"
                  title="Моє місцезнаходження"
                  className="shrink-0 rounded-full p-1.5 text-ink-text/50 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <LocateFixed size={15} />
                </button>
                {voiceSupported && (
                  <button
                    onClick={() => handleVoiceSearch('from')}
                    aria-label="Голосовий пошук"
                    className={`shrink-0 rounded-full p-1.5 transition-colors ${
                      isListening && activeField === 'from' ? 'bg-primary/20 text-primary animate-pulse' : 'text-ink-text/50 hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    <Mic size={14} />
                  </button>
                )}
              </div>

              {/* Куди */}
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  type="text"
                  value={toQuery}
                  onChange={(e) => {
                    setToQuery(e.target.value);
                    setToPoint(null);
                    setTripPlans(null);
    setSelectedPlanIndex(null);
                  }}
                  onFocus={() => {
                    clearTimeout(blurTimeoutRef.current);
                    setActiveField('to');
                  }}
                  onBlur={() => {
                    blurTimeoutRef.current = setTimeout(() => setActiveField((f) => (f === 'to' ? null : f)), 200);
                  }}
                  placeholder="Куди: адреса, зупинка, маршрут..."
                  className="w-full bg-transparent py-1.5 text-xs font-semibold text-ink-text placeholder:text-ink-text/40 focus:outline-none"
                />
                {toQuery && (
                  <button
                    onClick={() => {
                      setToQuery('');
                      setToPoint(null);
                      setTripPlans(null);
    setSelectedPlanIndex(null);
                    }}
                    aria-label="Очистити"
                    className="shrink-0 rounded-full p-1.5 text-ink-text/40 transition-colors hover:bg-surface-raised hover:text-ink-text"
                  >
                    <X size={14} />
                  </button>
                )}
                {voiceSupported && (
                  <button
                    onClick={() => handleVoiceSearch('to')}
                    aria-label="Голосовий пошук"
                    className={`shrink-0 rounded-full p-1.5 transition-colors ${
                      isListening && activeField === 'to' ? 'bg-primary/20 text-primary animate-pulse' : 'text-ink-text/50 hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    <Mic size={14} />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={handleSwapPoints}
              aria-label="Поміняти місцями"
              title="Поміняти місцями"
              className="m-2 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full bg-surface-soft text-ink-text/60 transition-colors hover:bg-primary/10 hover:text-primary active:scale-95"
            >
              <ArrowUpDown size={16} />
            </button>
          </div>

          {fromPoint && toPoint && (
            <div className="border-t border-border/40 p-2.5">
              <button
                onClick={handleBuildTrip}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-forest px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.98] hover:brightness-105"
              >
                <RouteIcon size={15} />
                <span>Побудувати маршрут</span>
              </button>
            </div>
          )}
        </div>

        {/* Швидкі фільтри */}
        <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {CHIP_FILTERS.map((chip) => {
            const isActive = activeFilterChips[chip.id];
            const Icon = chip.icon;
            return (
              <button
                key={chip.id}
                onClick={() => toggleChip(chip.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all shrink-0 backdrop-blur-xl shadow-md ${
                  isActive
                    ? 'bg-primary text-white shadow-primary/30 border border-primary/40'
                    : 'glass-surface text-ink-text hover:brightness-105'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-white' : 'text-ink-muted'} />
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        {activeField && fieldSuggestions.length > 0 && (
          <div className="pointer-events-auto shadow-2xl rounded-[24px] overflow-hidden glass-surface animate-in fade-in zoom-in-95 duration-150">
            <MapSearchSuggestions
              stops={fieldSuggestions}
              routes={[]}
              onStopSelect={(stopId) => {
                const stop = localStops.getById(stopId);
                if (stop) handlePickPoint(activeField, stop);
              }}
              onRouteSelect={() => {}}
            />
          </div>
        )}

        {activeField && fieldSuggestions.length === 0 && (activeField === 'from' ? fromQuery : toQuery).trim() && (
          <div className="pointer-events-auto flex flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-surface/95 p-6 text-center shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <MapPin className="h-6 w-6 text-ink-muted/60" />
            <p className="font-body text-sm font-medium text-ink-muted">Зупинок не знайдено</p>
          </div>
        )}
      </div>

      {/* 3. КНОПКИ КАРТИ */}
      <div className="absolute right-4 bottom-32 z-20 flex flex-col gap-2.5 will-change-transform">
        <div className="flex flex-col rounded-[24px] glass-surface shadow-xl shadow-black/10 overflow-hidden">
          <button
            onClick={() => map?.zoomIn({ duration: 300 })}
            className="flex h-[52px] w-[52px] items-center justify-center text-ink-text hover:bg-surface/60 active:bg-surface transition-colors border-b border-border/40"
            aria-label="Збільшити"
          >
            <Plus size={21} />
          </button>
          <button
            onClick={() => map?.zoomOut({ duration: 300 })}
            className="flex h-[52px] w-[52px] items-center justify-center text-ink-text hover:bg-surface/60 active:bg-surface transition-colors"
            aria-label="Зменшити"
          >
            <Minus size={21} />
          </button>
        </div>

        <button
          onClick={() => map?.resetNorthPitch({ duration: 400 })}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-[24px] glass-surface text-ink-text shadow-xl shadow-black/10 hover:brightness-105 active:scale-95 transition-all"
          aria-label="Компас / Північ"
          title="Скинути нахил"
        >
          <Compass size={21} />
        </button>

        <div className="rounded-[24px] overflow-hidden shadow-xl shadow-black/10">
          <MapModeButton />
        </div>

        <div className="rounded-[24px] overflow-hidden shadow-xl shadow-black/10">
          <GpsButton onClick={locate} isLocating={isLocating} hasError={!!error} />
        </div>
      </div>

      <TransportLayersPanel />

      {/* 4. НИЖНЯ ШТОРКА: Маршрут (обраний на карті/зупинці) — виїжджає знизу */}
      <Sheet open={!!selectedRoute} onClose={clearSelection}>
        {selectedRoute && <RouteSheet route={selectedRoute} onClose={clearSelection} onStopSelect={handleStopSelect} />}
      </Sheet>

      {/* 4б. НИЖНЯ ШТОРКА: варіанти побудованої поїздки — теж виїжджає знизу */}
      <Sheet
        open={tripPlans !== null}
        onClose={() => {
          setTripPlans(null);
          setSelectedPlanIndex(null);
        }}
        title="Варіанти поїздки"
      >
        {tripPlans !== null && (
          <div className="-mx-5 -mt-2">
            {isRefiningTrip && (
              <div className="mx-5 mb-2 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-[11px] font-semibold text-primary">
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <span>Уточнюємо пішохідні відстані по картах OpenStreetMap...</span>
              </div>
            )}
            <div className="max-h-[50vh] overflow-y-auto">
              <TripPlanSheet plans={tripPlans} selectedIndex={selectedPlanIndex} onSelect={handleSelectTripOption} />
            </div>
          </div>
        )}
      </Sheet>


      {/* 5. МОДАЛКА ЗУПИНКИ */}
      <StopDetailModal
        stop={selectedStop ?? null}
        arrivals={arrivals}
        onClose={() => setSelectedStopId(null)}
        onRouteSelect={handleRouteSelect}
        onUseAsFrom={handleUseStopAsFrom}
        onUseAsTo={handleUseStopAsTo}
      />
    </div>
  );
}
