import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { 
  X, 
  Mic, 
  Plus, 
  Minus, 
  Compass, 
  MapPin,
  ArrowUpDown,
  Route as RouteIcon,
  LocateFixed
} from 'lucide-react';
import { MapView } from '@/components/MapView';
import { StopDetailModal } from '@/components/StopDetailModal';
import { TripPlanSheet } from '@/components/TripPlanSheet';
import { RouteSheet } from '@/components/RouteSheet';
import { Sheet } from '@/components/ui/Sheet';
import { MapSearchSuggestions } from '@/components/MapSearchSuggestions';
import { GpsButton } from '@/components/GpsButton';
import { MapModeButton } from '@/components/MapModeButton';
import { TransportLayersPanel } from '@/components/TransportLayersPanel';
import { AirAlertBanner } from '@/components/AirAlertBanner';
import { useGeolocation } from '@/hooks/useGeolocation';
import { localRoutes, localStops, type TripPlan, type StopItem } from '@/data/localData';
import { getRouteBounds } from '@/lib/mapLayers';
import { refineTripPlansWithOSM } from '@/lib/tripPlanRefine';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import { ActiveTripBar } from '@/components/ActiveTripBar';
import { useActiveTripProgress } from '@/hooks/useActiveTripProgress';
import { type ActiveTrip, startActiveTrip, loadActiveTrip, saveActiveTrip } from '@/lib/activeTrip';

const SUGGESTIONS_LIMIT = 6;
const STORAGE_PREFIX = 'kharkiv_go_map_state_';

export function MapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  // Дозволяє відкривати конкретну зупинку одразу прямим посиланням виду
  // /map?stop=<id> — саме так на цю сторінку веде "Найближчі зупинки" з
  // HomePage. Захоплюємо початкове значення один раз: нижче одразу
  // прибираємо його з URL, тому читати searchParams напряму в рендері
  // після монтування вже не можна.
  const initialDeepLinkStopIdRef = useRef(searchParams.get('stop'));
  const deepLinkedStopId = searchParams.get('stop');
  const { position, heading, isMoving, isLocating, error, locate } = useGeolocation();
  
  const storeVisibleKinds = useSettingsStore((s) => s.visibleTransportKinds);
  const showStops = useSettingsStore((s) => s.showStopsOnMap);

  const [map, setMap] = useState<MapLibreMap | null>(null);

  const [selectedStopId, setSelectedStopId] = useState<string | null>(initialDeepLinkStopIdRef.current);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

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
  // Шторка "Варіанти поїздки" — окремий прапорець видимості, НЕ пов'язаний
  // із самими даними (tripPlans). Раніше закриття шторки (onClose) одразу
  // очищало tripPlans, і маршрут зникав з карти. Тепер закриття шторки лише
  // ховає її, а побудований маршрут лишається намальованим на карті, поки
  // користувач явно не прибере його (кнопка "×" на міні-плашці нижче) або
  // не побудує інший.
  const [isTripSheetOpen, setIsTripSheetOpen] = useState(false);
  // Деталі активної поїздки (розгортаються по тапу на плаваючу плашку "У дорозі").
  const [isActiveTripSheetOpen, setIsActiveTripSheetOpen] = useState(false);
  // "Активна поїздка" — підтверджений кнопкою "В дорогу" варіант, який
  // живе окремо від tripPlans/шторки: зберігається між перезавантаженнями
  // і відстежується за живою геопозицією (useActiveTripProgress нижче).
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(() => loadActiveTrip());
  const showToast = useToastStore((s) => s.show);

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
    // Побудова нового маршруту скасовує попередню активну поїздку (якщо
    // була) — інакше на карті одночасно "боролись" би два різні маршрути.
    setActiveTrip(null);
    saveActiveTrip(null);
    const plans = localRoutes.buildTripPlans(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng);
    setTripPlans(plans);
    setSelectedPlanIndex(plans.length > 0 ? 0 : null);
    setIsTripSheetOpen(true);

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

  const selectedTripPlan = useMemo(() => {
    if (activeTrip) return activeTrip.plan;
    return tripPlans && selectedPlanIndex !== null ? tripPlans[selectedPlanIndex] : null;
  }, [activeTrip, tripPlans, selectedPlanIndex]);

  // Точки "Звідки"/"Куди" для відмальовування маршруту на карті: під час
  // активної поїздки прив'язуємось саме до її точок, щоб лінія й піни не
  // "стрибали", навіть якщо користувач тим часом почне редагувати пошукові
  // поля для нового маршруту.
  const drawnFromPoint = activeTrip ? activeTrip.fromPoint : fromPoint;
  const drawnToPoint = activeTrip ? activeTrip.toPoint : toPoint;

  const handleStartTrip = useCallback(
    (index: number) => {
      const plan = tripPlans?.[index];
      if (!plan) return;
      const trip = startActiveTrip(plan, fromPoint, toPoint);
      setActiveTrip(trip);
      saveActiveTrip(trip);
      setIsTripSheetOpen(false);
      showToast('Поїздку розпочато — підказуватимемо по дорозі', 'success');
    },
    [tripPlans, fromPoint, toPoint, showToast]
  );

  const handleCancelActiveTrip = useCallback(() => {
    setActiveTrip(null);
    saveActiveTrip(null);
    setIsActiveTripSheetOpen(false);
  }, []);

  const tripProgress = useActiveTripProgress({
    activeTrip,
    position,
    onUpdate: setActiveTrip,
    onArrived: () => setActiveTrip(null)
  });

  const handleClearBuiltRoute = useCallback(() => {
    setTripPlans(null);
    setSelectedPlanIndex(null);
    setIsTripSheetOpen(false);
  }, []);

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

  // Якщо параметр stop у URL змінюється (наприклад, повторний перехід з
  // головної сторінки на іншу найближчу зупинку), синхронізуємо вибір.
  useEffect(() => {
    if (deepLinkedStopId) setSelectedStopId(deepLinkedStopId);
  }, [deepLinkedStopId]);

  // Одразу після відкриття конкретної зупинки за deep-лінком прибираємо
  // параметр з URL, щоб закриття модалки (onClose) і подальший пошук на
  // карті поводились природно, без "залипання" на старій зупинці.
  useEffect(() => {
    if (deepLinkedStopId) {
      const next = new URLSearchParams(searchParams);
      next.delete('stop');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedStopId]);

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
    // Якщо параметр "stop" вже встигли прибрати з URL (ефект вище, що
    // синхронізує selectedStopId, видаляє його одразу — ще до того, як
    // карта стане готовою), беремо початкове значення з рефа. Інакше
    // flyTo нижче ніколи не спрацьовував би при першому відкритті
    // /map?stop=... — модалка відкривалась, а карта не перелітала.
    const stopId = searchParams.get('stop') ?? initialDeepLinkStopIdRef.current;
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

    // Реф потрібен лише для першого спрацювання (поки карта ще не готова),
    // після використання одразу скидаємо його, щоб наступні зміни
    // searchParams (без "stop") не викликали повторний flyTo до старої зупинки.
    initialDeepLinkStopIdRef.current = null;

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
          fromPoint={drawnFromPoint}
          toPoint={drawnToPoint}
          tripPlan={selectedTripPlan}
        />
      </div>

      {/* 2. ВЕРХНЯ ПАНЕЛЬ: побудова маршруту "Звідки -> Куди" */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col gap-2.5 p-4 pt-[max(1rem,env(safe-area-inset-top))] will-change-transform">

        <div className="pointer-events-auto">
          <AirAlertBanner />
        </div>

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

      {/* 4б. НИЖНЯ ШТОРКА: варіанти побудованої поїздки — теж виїжджає знизу.
          Закриття (onClose) лише ховає шторку — сам маршрут (tripPlans)
          лишається і продовжує малюватись на карті через selectedTripPlan. */}
      <Sheet
        open={tripPlans !== null && isTripSheetOpen}
        onClose={() => setIsTripSheetOpen(false)}
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
              <TripPlanSheet
                plans={tripPlans}
                selectedIndex={selectedPlanIndex}
                onSelect={handleSelectTripOption}
                onStartTrip={handleStartTrip}
              />
            </div>
          </div>
        )}
      </Sheet>

      {/* 4в. Плаваюча плашка над нижньою навігацією: коли активна поїздка —
          показує живу підказку "куди йти зараз"; коли маршрут просто
          побудований, але шторку закрито — компактне нагадування з
          можливістю знову відкрити варіанти або прибрати маршрут з карти. */}
      {activeTrip && tripProgress ? (
        <div className="pointer-events-none absolute left-4 right-20 bottom-24 z-30">
          <ActiveTripBar
            instruction={tripProgress.instruction}
            progress={tripProgress.progress}
            onCancel={handleCancelActiveTrip}
            onExpand={() => setIsActiveTripSheetOpen(true)}
          />
        </div>
      ) : (
        tripPlans !== null &&
        !isTripSheetOpen && (
          <div className="pointer-events-none absolute left-4 right-20 bottom-24 z-30">
            <div className="pointer-events-auto flex items-center gap-2.5 overflow-hidden rounded-[22px] glass-surface border border-border/40 px-3.5 py-3 shadow-xl shadow-black/10">
              <button
                type="button"
                onClick={() => setIsTripSheetOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <RouteIcon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wide text-ink-muted">Маршрут на карті</p>
                  <p className="truncate text-xs font-bold text-ink-text">Показати варіанти поїздки</p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleClearBuiltRoute}
                aria-label="Прибрати маршрут з карти"
                className="shrink-0 rounded-full p-2 text-ink-muted hover:bg-surface-soft hover:text-ink-text transition-colors active:scale-90"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )
      )}


      {/* 4г. НИЖНЯ ШТОРКА: деталі активної поїздки — ланцюжок ділянок і
          поточна підказка, з можливістю завершити поїздку вручну. */}
      <Sheet open={isActiveTripSheetOpen} onClose={() => setIsActiveTripSheetOpen(false)} title="Поточна поїздка">
        {activeTrip && tripProgress && (
          <div className="-mx-1 space-y-3">
            <div className="rounded-2xl bg-primary/10 px-3.5 py-3 text-xs font-bold text-primary">
              {tripProgress.instruction}
            </div>
            <div className="space-y-2">
              {activeTrip.plan.legs.map((leg, legIndex) => (
                <div key={legIndex} className="flex items-center gap-2.5 rounded-2xl border border-border/40 bg-surface-soft px-3 py-2.5">
                  <span
                    className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white shadow-xs"
                    style={{ backgroundColor: leg.route.color }}
                  >
                    {leg.route.number}
                  </span>
                  <div className="min-w-0 text-xs">
                    <div className="truncate font-bold text-ink-text">{leg.headsign}</div>
                    <div className="truncate text-[11px] text-ink-muted">
                      {leg.boardStop.name} → {leg.alightStop.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCancelActiveTrip}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-500 transition-all active:scale-[0.98] hover:bg-red-500/15"
            >
              <X size={15} />
              <span>Завершити поїздку</span>
            </button>
          </div>
        )}
      </Sheet>

      {/* 5. МОДАЛКА ЗУПИНКИ */}
      <StopDetailModal
        stop={selectedStop ?? null}
        arrivals={arrivals}
        userPosition={position}
        onClose={() => setSelectedStopId(null)}
        onRouteSelect={handleRouteSelect}
        onUseAsFrom={handleUseStopAsFrom}
        onUseAsTo={handleUseStopAsTo}
      />
    </div>
  );
}
