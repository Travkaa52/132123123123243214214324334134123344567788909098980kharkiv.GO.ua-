import { Suspense, useState, useEffect, memo, startTransition } from 'react';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { TelegramGate } from '@/components/TelegramGate';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';
import { RegistrationModal } from '@/components/RegistrationModal';
import { PageTransition } from '@/components/PageTransition';
import { Toast } from '@/components/ui';
import { SplashScreen } from '@/components/SplashScreen';
import { useTelegramEnvironment } from '@/hooks/useTelegramEnvironment';
import { useThemeSync } from '@/hooks/useThemeSync';
import { useAppReady } from '@/hooks/useAppReady';
import { useDepartureReminder } from '@/hooks/useDepartureReminder';
import { useAuthStore } from '@/store/useAuthStore';
import { HomePage } from '@/pages/HomePage';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DevToolsGuardOverlay } from '@/components/DevToolsGuardOverlay';

/**
 * ---------------------------------------------------------------------------
 * Динамічне завантаження важких екранів (Code Splitting & Lazy Loading)
 * з можливістю Prefetch при наведенні або передчасному фокусі.
 *
 * Використовуємо lazyWithRetry (а не голий React.lazy) — саме голий lazy()
 * був причиною "чорного екрана" на /metro/live: коли в браузері закешований
 * старий index.html, а на хостингу вже новий деплой з іншими хешами чанків,
 * динамічний import() старого чанка падає з "Failed to fetch dynamically
 * imported module". lazyWithRetry ловить саме цю мережеву помилку і робить
 * одне примусове перезавантаження сторінки, щоб підтягнути свіжий index.html.
 * ---------------------------------------------------------------------------
 */
const MapPage = lazyWithRetry(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })), 'MapPage');
const RoutesPage = lazyWithRetry(() => import('@/pages/RoutesPage').then((m) => ({ default: m.RoutesPage })), 'RoutesPage');
const RouteDetailPage = lazyWithRetry(() => import('@/pages/RouteDetailPage').then((m) => ({ default: m.RouteDetailPage })), 'RouteDetailPage');
const TransportKindPage = lazyWithRetry(() => import('@/pages/TransportKindPage').then((m) => ({ default: m.TransportKindPage })), 'TransportKindPage');
const LiveMetroPage = lazyWithRetry(() => import('@/pages/LiveMetroPage').then((m) => ({ default: m.LiveMetroPage })), 'LiveMetroPage');
const FavoritesPage = lazyWithRetry(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })), 'FavoritesPage');
const HistoryPage = lazyWithRetry(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })), 'HistoryPage');
const SettingsPage = lazyWithRetry(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })), 'SettingsPage');
const ProfilePage = lazyWithRetry(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })), 'ProfilePage');
const RemindersPage = lazyWithRetry(() => import('@/pages/RemindersPage').then((m) => ({ default: m.RemindersPage })), 'RemindersPage');
const InstallAppPage = lazyWithRetry(() => import('@/pages/InstallAppPage').then((m) => ({ default: m.InstallAppPage })), 'InstallAppPage');

/**
 * Преміальний Route Fallback із використанням Glassmorphism, Skeleton та Shimmer-ефекту.
 * Повністю адаптований під сучасні вимоги продуктивності та доступності.
 */
const RouteFallback = memo(function RouteFallback() {
  return (
    <div 
      className="flex min-h-dvh w-full items-center justify-center bg-bg p-4"
      role="status"
      aria-label="Завантаження сторінки..."
    >
      <div className="glass-surface relative w-full max-w-md overflow-hidden rounded-2xl p-6 shadow-lg backdrop-blur-xl will-change-transform">
        {/* Shimmer overlay animation */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        
        {/* Skeleton UI Structure */}
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-surface-raised/60 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-3/4 rounded bg-surface-raised/60 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-surface-raised/40 animate-pulse" />
            </div>
          </div>
          <div className="h-32 w-full rounded-xl bg-surface-raised/40 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-surface-raised/50 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-surface-raised/50 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Мемоізований компонент навігації для запобігання зайвим ререндерам
 */
const MemoizedBottomNav = memo(BottomNav);
const MemoizedTelegramGate = memo(TelegramGate);

export default function App() {
  const telegramStatus = useTelegramEnvironment();
  useThemeSync();
  useDepartureReminder();

  const appReady = useAppReady();
  const [splashMounted, setSplashMounted] = useState<boolean>(true);
  const location = useLocation();

  // Вікно реєстрації показуємо лише коли: застосунок точно НЕ в Telegram
  // (там профіль підтягується автоматично), користувач ще не проходив
  // "знайомство" на цьому пристрої, і сплеш-екран вже пішов — щоб форма
  // не блимала поверх анімації запуску.
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);
  const showRegistration = telegramStatus === 'outside' && !hasCompletedOnboarding && !splashMounted;

  // Карта — важкий компонент (ініціалізація MapLibre, завантаження стилю,
  // тайлів, шрифтів). Щоб вона відкривалась миттєво щоразу після першого
  // разу, а не перезавантажувалась заново на кожен вхід у "/map", ми не
  // розмонтовуємо <MapPage /> при виході зі сторінки — лишаємо її живою
  // в DOM (просто ховаємо через CSS) одразу після першого відвідування.
  const isMapRoute = location.pathname === '/map';
  const [mapMounted, setMapMounted] = useState(isMapRoute);
  useEffect(() => {
    if (isMapRoute) setMapMounted(true);
  }, [isMapRoute]);

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-bg text-ink-text antialiased selection:bg-primary/20">
      <ErrorBoundary label="Сторінка">
        <Suspense fallback={<RouteFallback />}>
          <PageTransition pathKey={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              {/* MapPage рендериться окремо нижче — постійно змонтована, щоб не
                  перезавантажуватись при кожному переході на цю сторінку. */}
              <Route path="/map" element={null} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/routes/:routeId" element={<RouteDetailPage />} />
              <Route path="/metro" element={<TransportKindPage kind="metro" />} />
              <Route
                path="/metro/live"
                element={
                  <ErrorBoundary label="Жива карта метро">
                    <LiveMetroPage />
                  </ErrorBoundary>
                }
              />
              <Route path="/trams" element={<TransportKindPage kind="tram" />} />
              <Route path="/trolleybuses" element={<TransportKindPage kind="trolleybus" />} />
              <Route path="/buses" element={<TransportKindPage kind="bus" />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/install-app" element={<InstallAppPage />} />

              {/* Обробка невідомих URL та 404 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PageTransition>
        </Suspense>
      </ErrorBoundary>

      {mapMounted && (
        <div className={isMapRoute ? 'contents' : 'hidden'}>
          <ErrorBoundary label="Карта">
            <Suspense fallback={<RouteFallback />}>
              <MapPage />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {telegramStatus === 'outside' && !showRegistration && <MemoizedTelegramGate />}

      <MemoizedBottomNav />
      <Toast />
      <PwaUpdateBanner />
      <DevToolsGuardOverlay />

      {showRegistration && <RegistrationModal />}

      {splashMounted && (
        <SplashScreen
          leaving={appReady}
          onLeaveEnd={() => {
            startTransition(() => {
              setSplashMounted(false);
            });
          }}
        />
      )}
    </div>
  );
}
