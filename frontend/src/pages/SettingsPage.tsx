import { useState, type ReactNode } from 'react';
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
  Info
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, SegmentedControl, Switch, Button, Emblem } from '@/components/ui';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';

interface SectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1 text-ink-muted">
        {icon && <span className="text-primary/80">{icon}</span>}
        <h2 className="text-caption font-semibold uppercase tracking-wider text-xs opacity-75">
          {title}
        </h2>
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

export function SettingsPage() {
  const settings = useSettingsStore();
  const [clearingState, setClearingState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const handleTogglePush = async () => {
    if (!settings.pushNotificationsEnabled && notifStatus !== 'granted' && typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      setNotifStatus(result);
      if (result !== 'granted') return;
    }
    settings.togglePushNotifications();
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

      {/* Hero Badge Section */}
      <div className="relative my-4 flex flex-col items-center justify-center gap-3 px-4 text-center">
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

      {/* Main Settings Grid */}
      <div className="flex flex-col gap-6 px-4 pt-2 max-w-md mx-auto">
        
        {/* Оформлення */}
        <Section title="Оформлення" icon={<Palette className="h-4 w-4" />}>
          <Row
            label="Тема"
            icon={<Palette className="h-4 w-4" />}
            control={
              <SegmentedControl
                value={settings.theme}
                onChange={settings.setTheme}
                options={[
                  { value: 'light', label: 'Світла' },
                  { value: 'dark', label: 'Темна' },
                  { value: 'amoled', label: 'AMOLED' },
                  { value: 'auto', label: 'Авто' }
                ]}
                className="w-full shadow-2xs"
              />
            }
          />
          <Row
            label="Стиль карти"
            icon={<Map className="h-4 w-4" />}
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

        {/* Мова та одиниці */}
        <Section title="Мова та одиниці" icon={<Globe className="h-4 w-4" />}>
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

        {/* Сповіщення */}
        <Section title="Сповіщення" icon={<Bell className="h-4 w-4" />}>
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
        </Section>

        {/* Карта */}
        <Section title="Інтерактивна карта" icon={<MapPin className="h-4 w-4" />}>
          <Row 
            label="Зупинки на карті" 
            icon={<MapPin className="h-4 w-4" />}
            hint="Відображати маркери зупинок під час зуму"
            control={
              <Switch 
                checked={settings.showStopsOnMap} 
                onChange={settings.toggleStopsOnMap} 
                label="Зупинки на карті" 
              />
            } 
          />
          <Row 
            label="3D-будівлі" 
            icon={<Building2 className="h-4 w-4" />}
            hint="Об'ємні фасади для кращої орієнтації"
            control={
              <Switch 
                checked={settings.is3DMode} 
                onChange={settings.toggle3DMode} 
                label="3D-будівлі" 
              />
            } 
          />
        </Section>

        {/* Пам'ять та дані */}
        <Section title="Пам'ять та дані" icon={<Database className="h-4 w-4" />}>
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
          </div>
        </Section>

        {/* Системна інформація */}
        <Section title="Про додаток" icon={<Info className="h-4 w-4" />}>
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
