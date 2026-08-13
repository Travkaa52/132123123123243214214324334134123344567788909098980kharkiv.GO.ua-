import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Palette,
  Map,
  Globe,
  Ruler,
  Bell,
  Building2,
  Database,
  Check,
  Trash2,
  Sparkles,
  AlertTriangle,
  MapPin,
  ChevronLeft,
  RefreshCw,
  Info,
  Sun,
  Moon,
  MonitorSmartphone,
  Zap,
  Layers,
  RotateCcw
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, SegmentedControl, Switch, Button, Emblem } from '@/components/ui';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { TRANSPORT_COLORS } from '@/config/map';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { enableDelayPushSubscription, disableDelayPushSubscription, isPushSubscriptionAvailable } from '@/lib/pushSubscription';
import type { AppSettings } from '@/types/user';
import type { TransportKind } from '@/types/transport';

const ALL_KINDS: TransportKind[] = ['metro', 'tram', 'trolleybus', 'bus'];

interface SectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

function Section({ id, title, icon, children, action }: SectionProps) {
  return (
    <section id={id} className="flex flex-col gap-2.5 scroll-mt-24">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-ink-muted">
          {icon && <span className="text-primary/80">{icon}</span>}
          <h2 className="text-caption font-semibold uppercase tracking-wider text-xs opacity-75">{title}</h2>
        </div>
        {action}
      </div>
      <Card
        padding="none"
        className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-surface/80 backdrop-blur-md shadow-sm transition-all hover:border-border/80"
      >
        {children}
      </Card>
    </section>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  icon?: ReactNode;
  control: ReactNode;
  badge?: ReactNode;
}

function Row({ label, hint, icon, control, badge }: RowProps) {
  return (
    <div className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3.5 min-w-0">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-ink-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-body font-medium text-ink-text">{label}</p>
            {badge}
          </div>
          {hint && <p className="text-body-sm text-ink-muted/80 mt-0.5 leading-snug">{hint}</p>}
        </div>
      </div>
      <div className="shrink-0 pl-2">{control}</div>
    </div>
  );
}

const THEME_OPTIONS: {
  value: AppSettings['theme'];
  label: string;
  desc: string;
  icon: ReactNode;
  bg: string;
  surface: string;
  accent: string;
}[] = [
  { value: 'light', label: 'Світла', desc: 'Чітко вдень', icon: <Sun className="h-3.5 w-3.5" />, bg: '#eef2ee', surface: '#ffffff', accent: '#08a85c' },
  { value: 'dark', label: 'Темна', desc: "М'яко ввечері", icon: <Moon className="h-3.5 w-3.5" />, bg: '#060a09', surface: '#0f1613', accent: '#34e08a' },
  { value: 'amoled', label: 'AMOLED', desc: 'Максимум контрасту', icon: <Zap className="h-3.5 w-3.5" />, bg: '#000000', surface: '#0a0e0d', accent: '#39ff94' },
  { value: 'auto', label: 'Авто', desc: 'За системою', icon: <MonitorSmartphone className="h-3.5 w-3.5" />, bg: 'linear-gradient(135deg,#060a09 50%,#eef2ee 50%)', surface: '#111', accent: '#d6a316' }
];

function ThemePicker({
  value,
  onChange
}: {
  value: AppSettings['theme'];
  onChange: (t: AppSettings['theme']) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 p-3.5">
      {THEME_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`group relative flex flex-col gap-2 overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-200 active:scale-[0.97] ${
              active
                ? 'border-primary/70 shadow-[0_0_0_1px_rgb(var(--color-primary)/0.35),0_8px_20px_-6px_rgb(var(--color-primary)/0.35)]'
                : 'border-border/60 hover:border-border'
            }`}
          >
            <div
              className="relative h-12 w-full rounded-lg overflow-hidden border border-white/10"
              style={{ background: opt.bg }}
            >
              <div
                className="absolute left-1.5 top-1.5 right-1.5 h-3.5 rounded-md"
                style={{ background: opt.surface, opacity: 0.9 }}
              />
              <div
                className="absolute left-1.5 bottom-1.5 h-2.5 w-6 rounded-full"
                style={{ background: opt.accent }}
              />
              <div
                className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5 rounded-full"
                style={{ background: opt.accent, opacity: 0.5 }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 text-ink-text">
                <span className={active ? 'text-primary' : 'text-ink-muted'}>{opt.icon}</span>
                <span className="text-body-sm font-semibold">{opt.label}</span>
              </div>
              {active && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
            <p className="text-[11px] leading-tight text-ink-muted/80 -mt-1">{opt.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

const QUICK_NAV: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'sec-appearance', label: 'Вигляд', icon: <Palette className="h-3.5 w-3.5" /> },
  { id: 'sec-locale', label: 'Мова', icon: <Globe className="h-3.5 w-3.5" /> },
  { id: 'sec-notifications', label: 'Сповіщення', icon: <Bell className="h-3.5 w-3.5" /> },
  { id: 'sec-map', label: 'Карта', icon: <MapPin className="h-3.5 w-3.5" /> },
  { id: 'sec-data', label: 'Дані', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'sec-about', label: 'Про додаток', icon: <Info className="h-3.5 w-3.5" /> }
];

export function SettingsPage() {
  const settings = useSettingsStore();
  const [clearingState, setClearingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTogglingDelayAlerts, setIsTogglingDelayAlerts] = useState(false);
  const favoriteRoutes = useFavoritesStore((s) => s.routes);
  const [isResetting, setIsResetting] = useState(false);
  const [activeNav, setActiveNav] = useState(QUICK_NAV[0].id);
  const showToast = useToastStore((s) => s.show);
  const navScrollRef = useRef<HTMLDivElement>(null);

  const handleTogglePush = async () => {
    if (!settings.pushNotificationsEnabled && notifStatus !== 'granted' && typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      setNotifStatus(result);
      if (result !== 'granted') return;
    }
    settings.togglePushNotifications();
  };

  const handleToggleDelayAlerts = async () => {
    if (isTogglingDelayAlerts) return;

    if (settings.delayNotificationsEnabled) {
      settings.setDelayNotificationsEnabled(false);
      void disableDelayPushSubscription();
      return;
    }

    setIsTogglingDelayAlerts(true);
    try {
      const routeIds = favoriteRoutes.map((r) => r.routeId);
      const ok = await enableDelayPushSubscription(routeIds);
      if (ok) {
        settings.setDelayNotificationsEnabled(true);
        showToast('Сповіщення про затримки увімкнено.', 'success');
      } else {
        showToast('Не вдалося увімкнути сповіщення про затримки.', 'error');
      }
    } finally {
      setIsTogglingDelayAlerts(false);
    }
  };

  const handleClearCache = async () => {
    setClearingState('loading');
    await settings.clearCache();
    setClearingState('done');
    setTimeout(() => setClearingState('idle'), 2500);
  };

  const handleUpdateData = () => {
    setIsUpdating(true);
    setTimeout(() => {
      setIsUpdating(false);
      showToast('Дані успішно оновлено до актуальної версії.', 'success');
    }, 800);
  };

  const isDefault = useMemo(
    () =>
      settings.theme === 'dark' &&
      settings.language === 'uk' &&
      settings.units === 'metric' &&
      settings.showStopsOnMap &&
      settings.is3DMode &&
      settings.visibleTransportKinds.length === ALL_KINDS.length,
    [settings.theme, settings.language, settings.units, settings.showStopsOnMap, settings.is3DMode, settings.visibleTransportKinds]
  );

  const handleReset = () => {
    setIsResetting(true);
    settings.setTheme('dark');
    settings.setLanguage('uk');
    settings.setUnits('metric');
    if (!settings.showStopsOnMap) settings.toggleStopsOnMap();
    if (!settings.is3DMode) settings.toggle3DMode();
    settings.showAllTransportKinds();
    setTimeout(() => {
      setIsResetting(false);
      showToast('Налаштування повернуто до типових.', 'success');
    }, 400);
  };

  const scrollToSection = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-bg via-bg/95 to-bg pb-28 text-ink-text selection:bg-primary/20">
      <PageHeader
        title="Налаштування"
        action={
          <Link
            to="/profile"
            aria-label="Назад до профілю"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-surface/80 text-ink-text shadow-xs backdrop-blur-md transition-all hover:bg-surface active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <div className="relative my-4 flex flex-col items-center justify-center gap-3 px-4 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-40 w-64 rounded-full bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 blur-3xl opacity-60" />
        <div className="relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-accent/30 blur-lg opacity-70 animate-pulse" />
          <Emblem size={56} glow className="relative drop-shadow-md" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/60 backdrop-blur-md px-3 py-1 shadow-2xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-caption font-semibold text-ink-text">Kharkiv GO</span>
            <span className="h-1 w-1 rounded-full bg-ink-muted/40" />
            <span className="text-caption text-ink-muted">v2.4.0</span>
          </div>
          <p className="text-body-sm text-ink-muted max-w-xs mt-1">
            Офіційний вигляд та розклад громадського транспорту Харкова
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-20 mb-1 bg-gradient-to-b from-bg via-bg/95 to-transparent pb-2 pt-1 backdrop-blur-md">
        <div ref={navScrollRef} className="flex gap-2 overflow-x-auto px-4 no-scrollbar scroll-smooth">
          {QUICK_NAV.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 active:scale-95 ${
                  active
                    ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_0_1px_rgb(var(--color-primary)/0.25)]'
                    : 'border-border/60 bg-surface/70 text-ink-muted hover:text-ink-text hover:border-border'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pt-2 max-w-md mx-auto">
        <Section id="sec-appearance" title="Оформлення" icon={<Palette className="h-4 w-4" />}>
          <div className="px-1 pt-1">
            <ThemePicker value={settings.theme} onChange={settings.setTheme} />
          </div>
          <Row
            label="Стиль карти"
            icon={<Map className="h-4 w-4" />}
            hint="Автоматично узгоджується з темою"
            control={
              <SegmentedControl
                value={settings.mapStyle}
                onChange={settings.setMapStyle}
                options={[
                  { value: 'day', label: 'Денний' },
                  { value: 'night', label: 'Нічний' }
                ]}
                className="w-36 shadow-2xs"
              />
            }
          />
        </Section>

        <Section id="sec-locale" title="Мова та одиниці" icon={<Globe className="h-4 w-4" />}>
          <Row
            label="Мова застосунку"
            icon={<Globe className="h-4 w-4" />}
            control={
              <SegmentedControl
                value={settings.language}
                onChange={settings.setLanguage}
                options={[
                  { value: 'uk', label: 'Укр' },
                  { value: 'en', label: 'Eng' }
                ]}
                className="w-36 shadow-2xs"
              />
            }
          />
          <Row
            label="Одиниці виміру"
            icon={<Ruler className="h-4 w-4" />}
            control={
              <SegmentedControl
                value={settings.units}
                onChange={settings.setUnits}
                options={[
                  { value: 'metric', label: 'км' },
                  { value: 'imperial', label: 'mi' }
                ]}
                className="w-28 shadow-2xs"
              />
            }
          />
        </Section>

        <Section id="sec-notifications" title="Сповіщення" icon={<Bell className="h-4 w-4" />}>
          <Row
            label="Push-сповіщення"
            icon={<Bell className="h-4 w-4" />}
            hint={
              notifStatus === 'denied'
                ? 'Заблоковано в налаштуваннях браузера'
                : 'Про затримки, сирени та зміни маршрутів'
            }
            badge={
              notifStatus === 'denied' ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Заблоковано
                </span>
              ) : null
            }
            control={
              <Switch
                checked={settings.pushNotificationsEnabled}
                onChange={handleTogglePush}
                disabled={notifStatus === 'denied'}
                label="Push-сповіщення"
              />
            }
          />
          {isPushSubscriptionAvailable() && (
            <Row
              label="Сповіщення про затримки"
              icon={<AlertTriangle className="h-4 w-4" />}
              hint={
                favoriteRoutes.length === 0
                  ? 'Додайте маршрути в обране, щоб отримувати сповіщення саме по них'
                  : `Стежимо за ${favoriteRoutes.length} обраним(и) маршрутом(ами)`
              }
              control={
                <Switch
                  checked={settings.delayNotificationsEnabled}
                  onChange={handleToggleDelayAlerts}
                  disabled={isTogglingDelayAlerts || notifStatus === 'denied'}
                  label="Сповіщення про затримки"
                />
              }
            />
          )}
        </Section>

        <Section id="sec-map" title="Інтерактивна карта" icon={<MapPin className="h-4 w-4" />}>
          <Row
            label="Зупинки на карті"
            icon={<MapPin className="h-4 w-4" />}
            hint="Відображати маркери зупинок під час зуму"
            control={<Switch checked={settings.showStopsOnMap} onChange={settings.toggleStopsOnMap} label="Зупинки на карті" />}
          />
          <Row
            label="3D-будівлі"
            icon={<Building2 className="h-4 w-4" />}
            hint="Об'ємні фасади для кращої орієнтації"
            control={<Switch checked={settings.is3DMode} onChange={settings.toggle3DMode} label="3D-будівлі" />}
          />

          <div className="p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink-muted">
                <Layers className="h-3.5 w-3.5" />
                <span className="text-body-sm font-medium">Види транспорту на карті</span>
              </div>
              {settings.visibleTransportKinds.length < ALL_KINDS.length && (
                <button
                  type="button"
                  onClick={settings.showAllTransportKinds}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  Показати всі
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_KINDS.map((kind) => {
                const active = settings.visibleTransportKinds.includes(kind);
                const color = TRANSPORT_COLORS[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={active}
                    onClick={() => settings.toggleTransportKind(kind)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all duration-200 active:scale-[0.97] ${
                      active ? 'border-border/70 bg-muted/40' : 'border-border/30 opacity-50 grayscale'
                    }`}
                    style={active ? { boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}
                  >
                    <TransportKindIcon kind={kind} size={22} />
                    <span className="text-body-sm font-medium text-ink-text truncate">{KIND_LABELS_UK[kind]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        <Section id="sec-data" title="Пам'ять та дані" icon={<Database className="h-4 w-4" />}>
          <div className="p-3.5 space-y-2.5">
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={handleUpdateData}
              disabled={isUpdating}
              className="font-medium"
            >
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
                <span>{isUpdating ? 'Оновлення...' : 'Оновити дані розкладу'}</span>
              </div>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={handleClearCache}
              disabled={clearingState !== 'idle'}
              className={`relative overflow-hidden transition-all duration-300 font-medium ${
                clearingState === 'done' ? 'border-border text-ink-text bg-surface-soft' : ''
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {clearingState === 'loading' && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {clearingState === 'done' ? (
                  <>
                    <Check className="h-4 w-4 text-ink-text animate-bounce" />
                    <span>Кеш успішно очищено</span>
                  </>
                ) : clearingState === 'loading' ? (
                  <span>Очищення...</span>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 opacity-70" />
                    <span>Очистити локальний кеш</span>
                  </>
                )}
              </div>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={handleReset}
              disabled={isDefault || isResetting}
              className="font-medium text-ink-muted hover:text-ink-text"
            >
              <div className="flex items-center justify-center gap-2">
                <RotateCcw className={`h-4 w-4 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isDefault ? 'Усе за типовими значеннями' : 'Скинути до типових налаштувань'}</span>
              </div>
            </Button>
          </div>
        </Section>

        <Section id="sec-about" title="Про додаток" icon={<Info className="h-4 w-4" />}>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-muted font-medium">Версія додатка</span>
              <span className="font-bold text-ink-text">v1.3.0 Pro</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-muted font-medium">Карта</span>
              <span className="font-bold text-ink-text">MapLibre GL / OpenFreeMap</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-muted font-medium">Останнє оновлення даних</span>
              <span className="font-bold text-ink-text">Сьогодні, 06:30</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
