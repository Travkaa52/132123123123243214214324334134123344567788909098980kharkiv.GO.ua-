import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { Navigation } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DEFAULT_ZOOM, KHARKIV_CENTER, MAP_STYLES, MAX_ZOOM, MIN_ZOOM, TRANSPORT_COLORS } from '@/config/map';
import { useSettingsStore } from '@/store/useSettingsStore';
import { buildRouteLinesGeoJson, buildStopsGeoJson, buildTripPathGeoJson } from '@/lib/mapLayers';
import { assetUrl } from '@/lib/assetUrl';
import { localRoutes } from '@/data/localData';
import type { TripPlan } from '@/data/localData';
import type { TransportKind } from '@/types/transport';

const TRIP_PATH_SOURCE_ID = 'khgo-trip-path';
const TRIP_PATH_CASING_LAYER_ID = 'khgo-trip-path-casing';
const TRIP_PATH_LAYER_ID = 'khgo-trip-path-line';
const TRIP_PATH_WALK_LAYER_ID = 'khgo-trip-path-walk';

const ROUTES_SOURCE_ID = 'khgo-routes';
const ROUTES_LAYER_ID = 'khgo-routes-lines';
const ROUTES_CASING_LAYER_ID = 'khgo-routes-casing';
const ROUTES_HITBOX_LAYER_ID = 'khgo-routes-hitbox';
const STOPS_SOURCE_ID = 'khgo-stops';
const STOPS_LAYER_ID = 'khgo-stops-circles';
const STOPS_HALO_LAYER_ID = 'khgo-stops-halo';
const STOP_HIGHLIGHT_LAYER_ID = 'khgo-stops-highlight';
// Метро — окремий шар без minzoom-обмеження: станції метро мають лишатись
// видимими на будь-якому масштабі карти, на відміну від трамвайних/тролейбусних/
// автобусних зупинок, яких на віддаленому зумі забагато й вони заховані навмисно.
// Рендериться значком метрополітену (public/icons/kharkiv-metro-logo.png) з
// назвою станції збоку, а не звичайним кольоровим кружечком.
const METRO_STOPS_LAYER_ID = 'khgo-stops-metro-icons';
const METRO_ICON_IMAGE_ID = 'khgo-metro-station-icon';

const STOP_COLOR_MATCH: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'dominantKind'],
  'metro',
  TRANSPORT_COLORS.metro,
  'tram',
  TRANSPORT_COLORS.tram,
  'trolleybus',
  TRANSPORT_COLORS.trolleybus,
  TRANSPORT_COLORS.bus
];

/**
 * Додає статичні шари маршрутів (лінії) і зупинок (точки).
 */
function addStaticTransitLayers(
  map: MapLibreMap,
  visibleKinds: TransportKind[],
  showStops: boolean,
  selectedRouteId?: string | null
) {
  if (!map.getSource(ROUTES_SOURCE_ID)) {
    map.addSource(ROUTES_SOURCE_ID, { type: 'geojson', data: buildRouteLinesGeoJson(visibleKinds, selectedRouteId) });

    map.addLayer({
      id: ROUTES_CASING_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0A0F0D',
        'line-width': ['case', ['get', 'selected'], ['interpolate', ['linear'], ['zoom'], 11, 4, 17, 8], 0],
        'line-opacity': ['case', ['get', 'dimmed'], 0, 0.35]
      }
    });

    map.addLayer({
      id: ROUTES_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#05522E'],
        'line-width': [
          'case',
          ['get', 'selected'],
          ['interpolate', ['linear'], ['zoom'], 11, 3, 17, 6.5],
          ['interpolate', ['linear'], ['zoom'], 11, 1.4, 17, 3.5]
        ],
        'line-opacity': ['case', ['get', 'dimmed'], 0.12, 0.9]
      }
    });

    // Невидимий, але значно ширший шар-"мішень" під видимою лінією маршруту.
    // Раніше клікабельним був лише сам ROUTES_LAYER_ID шириною 1.4–6.5px —
    // на телефоні потрапити пальцем у тонку лінію тролейбуса/трамвая було
    // практично неможливо, тому побудова маршруту на карті "не працювала".
    // Цей шар нічого не малює (line-opacity: 0), лише розширює ділянку кліку.
    map.addLayer({
      id: ROUTES_HITBOX_LAYER_ID,
      type: 'line',
      source: ROUTES_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#000000',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 18, 17, 26],
        'line-opacity': 0
      }
    }, ROUTES_LAYER_ID);
  }

  // Шар намальованого шляху обраного варіанту поїздки (Звідки -> Куди):
  // пунктирна пішохідна ділянка + суцільна лінія кольору виду транспорту
  // для кожного legу (з пересадкою — кілька кольорових відрізків підряд).
  if (!map.getSource(TRIP_PATH_SOURCE_ID)) {
    map.addSource(TRIP_PATH_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: TRIP_PATH_WALK_LAYER_ID,
      type: 'line',
      source: TRIP_PATH_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'walk'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#9AA3AE',
        'line-width': 3,
        'line-dasharray': [0.001, 1.6]
      }
    });

    map.addLayer({
      id: TRIP_PATH_CASING_LAYER_ID,
      type: 'line',
      source: TRIP_PATH_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'transit'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0A0F0D',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 7, 17, 12],
        'line-opacity': 0.5
      }
    });

    map.addLayer({
      id: TRIP_PATH_LAYER_ID,
      type: 'line',
      source: TRIP_PATH_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'transit'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#05522E'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 17, 9],
        'line-opacity': 1
      }
    });
  }

  if (!map.getSource(STOPS_SOURCE_ID)) {
    map.addSource(STOPS_SOURCE_ID, { type: 'geojson', data: buildStopsGeoJson(visibleKinds) });

    map.addLayer({
      id: STOPS_HALO_LAYER_ID,
      type: 'circle',
      source: STOPS_SOURCE_ID,
      minzoom: 12,
      layout: { visibility: showStops ? 'visible' : 'none' },
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          ['case', ['get', 'isHub'], 4.5, 3.5],
          17,
          ['case', ['get', 'isHub'], 11, 8.5]
        ],
        'circle-color': '#FFFFFF',
        'circle-opacity': 0.9
      }
    });

    map.addLayer({
      id: STOPS_LAYER_ID,
      type: 'circle',
      source: STOPS_SOURCE_ID,
      minzoom: 12,
      layout: { visibility: showStops ? 'visible' : 'none' },
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          ['case', ['get', 'isHub'], 3.2, 2.2],
          17,
          ['case', ['get', 'isHub'], 8, 5.5]
        ],
        'circle-color': STOP_COLOR_MATCH,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': ['case', ['get', 'isHub'], 2, 1.4]
      }
    });

    map.addLayer({
      id: STOP_HIGHLIGHT_LAYER_ID,
      type: 'circle',
      source: STOPS_SOURCE_ID,
      minzoom: 11,
      filter: ['in', ['get', 'stopId'], ['literal', []]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 6, 17, 13],
        'circle-color': 'transparent',
        'circle-stroke-color': '#C6A552',
        'circle-stroke-width': 2.5
      }
    });

    // Метро — без minzoom, завжди видимі, поки showStops увімкнено.
    // Значок станції (лого метрополітену) + назва станції збоку.
    addMetroIconLayer(map, showStops);
  }
}

/**
 * Додає значок станції метро (public/icons/kharkiv-metro-logo.png) як
 * MapLibre-зображення та символьний шар поверх нього з назвою станції
 * збоку. Зображення потрібно вантажити асинхронно й наново після кожної
 * зміни стилю карти (map.setStyle скидає всі раніше додані зображення),
 * тому виклик безпечний для повторного виконання.
 */
function addMetroIconLayer(map: MapLibreMap, showStops: boolean) {
  const buildLayer = () => {
    if (map.getLayer(METRO_STOPS_LAYER_ID) || !map.getSource(STOPS_SOURCE_ID)) return;
    map.addLayer({
      id: METRO_STOPS_LAYER_ID,
      type: 'symbol',
      source: STOPS_SOURCE_ID,
      filter: ['==', ['get', 'dominantKind'], 'metro'],
      layout: {
        visibility: showStops ? 'visible' : 'none',
        'icon-image': map.hasImage(METRO_ICON_IMAGE_ID) ? METRO_ICON_IMAGE_ID : '',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.32, 17, 0.6],
        'icon-anchor': 'center',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-anchor': 'left',
        'text-offset': [1.15, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true
      },
      paint: {
        'text-color': TRANSPORT_COLORS.metro,
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 1.4
      }
    });
  };

  if (map.hasImage(METRO_ICON_IMAGE_ID)) {
    buildLayer();
    return;
  }

  map
    .loadImage(assetUrl('icons/kharkiv-metro-logo.png'))
    .then((result) => {
      if (result?.data && !map.hasImage(METRO_ICON_IMAGE_ID)) {
        map.addImage(METRO_ICON_IMAGE_ID, result.data);
      }
    })
    .catch(() => {
      // Якщо картинку не вдалось завантажити, шар все одно додаємо —
      // тоді станції метро лишаться підписаними назвою (без іконки), а не
      // зникнуть з карти повністю.
    })
    .finally(() => {
      buildLayer();
    });
}

function updateRouteStopHighlight(map: MapLibreMap, selectedRouteId?: string | null) {
  if (!map.getLayer(STOP_HIGHLIGHT_LAYER_ID)) return;
  const route = selectedRouteId ? localRoutes.getById(selectedRouteId) : undefined;
  map.setFilter(STOP_HIGHLIGHT_LAYER_ID, ['in', ['get', 'stopId'], ['literal', route?.stopIds ?? []]]);
}

function ensureBuildingsLayer(map: MapLibreMap, visible: boolean) {
  if (map.getLayer('3d-buildings') || !map.getSource('openmaptiles')) return;
  map.addLayer({
    id: '3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    layout: { visibility: visible ? 'visible' : 'none' },
    paint: {
      'fill-extrusion-color': '#CFE9DA',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.75
    }
  });
}

function updateStaticTransitLayers(
  map: MapLibreMap,
  visibleKinds: TransportKind[],
  showStops: boolean,
  selectedRouteId?: string | null
) {
  const routesSource = map.getSource(ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  routesSource?.setData(buildRouteLinesGeoJson(visibleKinds, selectedRouteId));

  const stopsSource = map.getSource(STOPS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  stopsSource?.setData(buildStopsGeoJson(visibleKinds));

  updateRouteStopHighlight(map, selectedRouteId);

  for (const layerId of [STOPS_LAYER_ID, STOPS_HALO_LAYER_ID, METRO_STOPS_LAYER_ID]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', showStops ? 'visible' : 'none');
    }
  }
}

interface MapViewProps {
  userPosition?: { lat: number; lng: number } | null;
  userHeading?: number | null;
  userIsMoving?: boolean;
  onStopSelect?: (stopId: string) => void;
  selectedRouteId?: string | null;
  onRouteSelect?: (routeId: string) => void;
  visibleKinds?: TransportKind[];
  showStops?: boolean;
  onMapReady?: (map: MapLibreMap | null) => void;
  /** Викликається, якщо стиль карти не вдалось завантажити (мережа/CORS/недоступний тайл-сервер). */
  onMapError?: (message: string) => void;
  /** Точка "Звідки" для побудови маршруту — позначається зеленим піном. */
  fromPoint?: { lat: number; lng: number } | null;
  /** Точка "Куди" для побудови маршруту — позначається червоним піном. */
  toPoint?: { lat: number; lng: number } | null;
  /** Обраний варіант поїздки — малюється кольоровим шляхом по видах транспорту. */
  tripPlan?: TripPlan | null;
}

export function MapView({
  userPosition,
  userHeading = null,
  userIsMoving = false,
  onStopSelect,
  selectedRouteId = null,
  onRouteSelect,
  visibleKinds = ['metro', 'tram', 'trolleybus', 'bus'],
  showStops = true,
  onMapReady,
  onMapError,
  fromPoint = null,
  toPoint = null,
  tripPlan = null
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = useRef<maplibregl.Marker | null>(null);

  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const show3DBuildings = useSettingsStore((s) => s.is3DMode);

  const [mapReady, setMapReady] = useState(false);

  const onStopSelectRef = useRef(onStopSelect);
  onStopSelectRef.current = onStopSelect;
  const onRouteSelectRef = useRef(onRouteSelect);
  onRouteSelectRef.current = onRouteSelect;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const onMapErrorRef = useRef(onMapError);
  onMapErrorRef.current = onMapError;

  // Ініціалізація карти
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[mapStyle],
      center: [KHARKIV_CENTER.lng, KHARKIV_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      maxZoom: MAX_ZOOM,
      minZoom: MIN_ZOOM,
      pitch: show3DBuildings ? 45 : 0,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    // Карта лишається інтерактивною (панорамування/зум) навіть до фінального 'load' —
    // раніше повноекранний оверлей завантаження блокував кліки по канвасу карти,
    // і якщо стиль не завантажувався (нестабільна мережа, заблокований тайл-сервер),
    // користувач взагалі не міг користуватись картою. Тепер помилку стилю ловимо
    // явно і повідомляємо викликача замість вічного спінера.
    map.on('error', (e) => {
      const message = e?.error?.message || 'Не вдалося завантажити стиль карти';
      onMapErrorRef.current?.(message);
    });

    map.on('load', () => {
      ensureBuildingsLayer(map, show3DBuildings);
      addStaticTransitLayers(map, visibleKinds, showStops, selectedRouteId);

      map.on('click', STOPS_LAYER_ID, (e) => {
        const stopId = e.features?.[0]?.properties?.stopId as string | undefined;
        if (stopId) onStopSelectRef.current?.(stopId);
      });

      map.on('click', METRO_STOPS_LAYER_ID, (e) => {
        const stopId = e.features?.[0]?.properties?.stopId as string | undefined;
        if (stopId) onStopSelectRef.current?.(stopId);
      });

      map.on('click', ROUTES_HITBOX_LAYER_ID, (e) => {
        const routeId = e.features?.[0]?.properties?.routeId as string | undefined;
        if (routeId) onRouteSelectRef.current?.(routeId);
      });

      for (const layerId of [STOPS_LAYER_ID, METRO_STOPS_LAYER_ID, ROUTES_HITBOX_LAYER_ID]) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      setMapReady(true);
      onMapReadyRef.current?.(map);
    });

    mapRef.current = map;

    return () => {
      onMapReadyRef.current?.(null);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Зміна стилю карти (день/ніч)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(MAP_STYLES[mapStyle]);
    map.once('styledata', () => {
      ensureBuildingsLayer(map, show3DBuildings);
      addStaticTransitLayers(map, visibleKinds, showStops, selectedRouteId);
      const tripSource = map.getSource(TRIP_PATH_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      tripSource?.setData(
        tripPlan ? buildTripPathGeoJson(tripPlan, fromPoint, toPoint) : { type: 'FeatureCollection', features: [] }
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // Живе перемикання 2D/3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch: show3DBuildings ? 45 : 0, duration: 400 });
    ensureBuildingsLayer(map, show3DBuildings);
    if (map.getLayer('3d-buildings')) {
      map.setLayoutProperty('3d-buildings', 'visibility', show3DBuildings ? 'visible' : 'none');
    }
  }, [show3DBuildings, mapReady]);

  // Перефільтрація видів транспорту та зупинок
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    updateStaticTransitLayers(map, visibleKinds, showStops, selectedRouteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKinds, showStops, mapReady]);

  // Підсвічування обраного маршруту
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const routesSource = map.getSource(ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    routesSource?.setData(buildRouteLinesGeoJson(visibleKinds, selectedRouteId));
    updateRouteStopHighlight(map, selectedRouteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteId, mapReady]);

  // Маркер користувача
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'kg-user-marker relative h-11 w-11';
      el.innerHTML = `
        <div class="absolute inset-0 rounded-full bg-primary/30 animate-ping"></div>
        <div class="kg-user-marker-rotate absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out">
          <img class="kg-user-marker-icon h-11 w-11 select-none drop-shadow-md" src="${assetUrl('markers/user-location.png')}" alt="" draggable="false" />
          <video class="kg-user-marker-video absolute inset-0 hidden h-11 w-11 rounded-full object-cover shadow-lg" src="${assetUrl('markers/walking.mp4')}" muted loop playsinline preload="none"></video>
        </div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([userPosition.lng, userPosition.lat])
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat([userPosition.lng, userPosition.lat]);
    }
  }, [userPosition]);

  // Перемикання станів та орієнтації маркера
  useEffect(() => {
    const el = userMarkerRef.current?.getElement();
    if (!el) return;
    const img = el.querySelector<HTMLImageElement>('.kg-user-marker-icon');
    const video = el.querySelector<HTMLVideoElement>('.kg-user-marker-video');
    const rotor = el.querySelector<HTMLElement>('.kg-user-marker-rotate');
    if (!img || !video || !rotor) return;

    if (userIsMoving) {
      img.classList.add('hidden');
      video.classList.remove('hidden');
      if (video.paused) void video.play().catch(() => {});
      rotor.style.transform = 'rotate(0deg)';
    } else {
      video.classList.add('hidden');
      video.pause();
      img.classList.remove('hidden');
      rotor.style.transform = typeof userHeading === 'number' ? `rotate(${userHeading}deg)` : 'rotate(0deg)';
    }
  }, [userIsMoving, userHeading]);

  // Малювання шляху обраного варіанту поїздки кольором транспорту
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(TRIP_PATH_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      tripPlan ? buildTripPathGeoJson(tripPlan, fromPoint, toPoint) : { type: 'FeatureCollection', features: [] }
    );
  }, [tripPlan, fromPoint, toPoint, mapReady]);

  // Маркери "Звідки" / "Куди" для побудови маршруту
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!fromPoint) {
      fromMarkerRef.current?.remove();
      fromMarkerRef.current = null;
    } else {
      if (!fromMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'flex h-8 w-8 items-center justify-center';
        el.innerHTML = `<div style="width:16px;height:16px;border-radius:9999px;background:#059669;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`;
        fromMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([fromPoint.lng, fromPoint.lat]).addTo(map);
      } else {
        fromMarkerRef.current.setLngLat([fromPoint.lng, fromPoint.lat]);
      }
    }
  }, [fromPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!toPoint) {
      toMarkerRef.current?.remove();
      toMarkerRef.current = null;
    } else {
      if (!toMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'flex h-8 w-8 items-center justify-center';
        el.innerHTML = `<div style="width:16px;height:16px;border-radius:9999px;background:#e11d48;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`;
        toMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([toPoint.lng, toPoint.lat]).addTo(map);
      } else {
        toMarkerRef.current.setLngLat([toPoint.lng, toPoint.lat]);
      }
    }
  }, [toPoint]);

  function flyToUser() {
    if (mapRef.current && userPosition) {
      mapRef.current.flyTo({ center: [userPosition.lng, userPosition.lat], zoom: 16, essential: true });
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* КРИТИЧНО: position/inset заданий інлайн-стилем, а НЕ класами Tailwind
          (absolute inset-0). Бібліотека maplibre-gl.css сама додає на цей
          контейнер клас .maplibregl-map з правилом `position: relative` —
          та сама специфічність (один клас), тож перемагає той, чий CSS
          підключений пізніше в зібраному бандлі. Раніше це призводило до
          того, що контейнер лишався position:relative без заданої висоти,
          inset-0 переставав щось важити, висота схлопувалась у 0px — і
          карта була невидимою (canvas 0×0), хоча жодної JS-помилки не було.
          Інлайн-стиль має найвищий пріоритет і завжди перемагає будь-який
          зовнішній клас, тож карта відображається незалежно від порядку
          CSS-чанків у білді. */}
      <div ref={containerRef} className="absolute inset-0" style={{ position: 'absolute', inset: 0 }} />

      {/* Плаваюча кнопка «Моє місцезнаходження» (FAB) */}
      {userPosition && (
        <button
          type="button"
          onClick={flyToUser}
          aria-label="Показати моє місцезнаходження"
          className="absolute bottom-20 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/40 bg-surface/85 text-primary shadow-2xl backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-surface active:scale-95 mb-safe"
        >
          <Navigation className="h-5 w-5 fill-primary/20 stroke-[2.25]" />
        </button>
      )}
    </div>
  );
}
