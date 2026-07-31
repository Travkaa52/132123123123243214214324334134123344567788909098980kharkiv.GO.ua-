import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useRouteAlertsStore } from '@/store/useRouteAlertsStore';
import { findAlertForRoute } from '@/lib/routeAlerts';
import type { TransportKind } from '@/types/transport';

/**
 * Банер активного оголошення про затримку для конкретного маршруту.
 * Оголошення з'являється, коли адмін підтвердив затримку через бота
 * (вручну або після скарг ≥5 користувачів — server/README.md) і зникає
 * автоматично через ~2 години. Нічого не рендерить, якщо оголошення нема.
 */
export function RouteAlertBanner({ routeNumber, kind }: { routeNumber: string; kind?: TransportKind }) {
  const alerts = useRouteAlertsStore((s) => s.alerts);
  const startPolling = useRouteAlertsStore((s) => s.startPolling);

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  const alert = findAlertForRoute(alerts, routeNumber, kind);
  if (!alert) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-[12px] leading-relaxed text-ink-text">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-red-500">Можлива затримка руху</p>
        <p className="mt-0.5 text-ink-text">{alert.message}</p>
      </div>
    </div>
  );
}
