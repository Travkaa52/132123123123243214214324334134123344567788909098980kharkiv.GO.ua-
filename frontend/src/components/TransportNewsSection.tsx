import { useEffect } from 'react';
import { AlertCircle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useRouteAlertsStore } from '@/store/useRouteAlertsStore';
import { useNotificationsStore } from '@/store/useNotificationsStore';
import { GENERAL_ALERT_ROUTE, type RouteAlert } from '@/lib/routeAlerts';
import { TransportKindIcon } from '@/components/TransportKindIcon';
import { BOT_USERNAME } from '@/lib/botConfig';
import type { TransportKind } from '@/types/transport';

const KIND_LABELS: Record<TransportKind, string> = {
  bus: 'Автобус',
  trolleybus: 'Тролейбус',
  tram: 'Трамвай',
  metro: 'Метро'
};

function timeAgo(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const hrs = Math.floor(min / 60);
  return `${hrs} год тому`;
}

function alertTitle(alert: RouteAlert): string {
  const isGeneral = String(alert.routeNumber).trim().toLowerCase() === GENERAL_ALERT_ROUTE;
  const kindLabel = alert.kind ? KIND_LABELS[alert.kind] : null;
  if (isGeneral) return kindLabel ? `Затримки: ${kindLabel.toLowerCase()} (по місту)` : 'Затримки транспорту (по місту)';
  return kindLabel ? `Маршрут ${alert.routeNumber} — ${kindLabel.toLowerCase()}` : `Маршрут ${alert.routeNumber}`;
}

/**
 * Живий розділ "Новини транспорту" на головній: показує активні оголошення
 * про затримки (публікує/знімає адмін через Telegram-бота — див.
 * INTEGRATION_NOTES_UK.md), а якщо активних немає — коротке зведення з
 * офіційних Telegram-каналів (той самий фід, що й дзвіночок сповіщень).
 */
export function TransportNewsSection() {
  const alerts = useRouteAlertsStore((s) => s.alerts);
  const startPolling = useRouteAlertsStore((s) => s.startPolling);
  const { items: channelItems, fetchNotifications } = useNotificationsStore();

  useEffect(() => {
    startPolling();
    fetchNotifications();
  }, [startPolling, fetchNotifications]);

  const sortedAlerts = [...alerts].sort((a, b) => b.createdAt - a.createdAt);
  const latestChannelAlert = channelItems.find((n) => n.kind === 'alert');

  return (
    <section className="bg-surface-raised rounded-[24px] p-4 border border-border/40 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3.5">
        <div className="p-2 bg-surface-soft text-ink-muted rounded-[14px]">
          <AlertCircle size={17} />
        </div>
        <h2 className="font-extrabold text-ink-text text-sm">Новини транспорту</h2>
      </div>

      {sortedAlerts.length > 0 ? (
        <div className="space-y-2">
          {sortedAlerts.map((alert) => (
            <div key={alert.id} className="p-4 bg-red-500/10 rounded-[18px] border border-red-500/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white uppercase tracking-wide">
                  {alert.kind ? <TransportKindIcon kind={alert.kind} size={11} className="text-white" /> : null}
                  Затримка
                </span>
                <span className="text-[10px] font-semibold text-ink-muted">{timeAgo(alert.createdAt)}</span>
              </div>
              <h3 className="font-extrabold text-ink-text text-sm">{alertTitle(alert)}</h3>
              <p className="text-xs text-ink-muted leading-relaxed">{alert.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 bg-surface-soft rounded-[18px] border border-border/40 space-y-2">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 size={16} />
            <span className="text-xs font-bold">Наразі активних оголошень про затримки немає</span>
          </div>
          {latestChannelAlert && (
            <>
              <h3 className="font-extrabold text-ink-text text-sm">{latestChannelAlert.channelTitle}</h3>
              <p className="text-xs text-ink-muted leading-relaxed line-clamp-3">{latestChannelAlert.text}</p>
            </>
          )}
          <div className="pt-1">
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:brightness-110"
            >
              <span>Офіційний Telegram-канал</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
