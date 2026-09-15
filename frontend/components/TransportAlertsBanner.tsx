import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useRouteAlertsStore } from '@/store/useRouteAlertsStore';
import { findGeneralAlerts } from '@/lib/routeAlerts';
import type { TransportKind } from '@/types/transport';

/**
 * Банер "загального" оголошення про затримку — не привʼязаного до конкретного
 * маршруту. Адмін публікує такий через бота командою `/alert all ...`
 * (весь розділ транспорту) або `/alert all bus ...` (лише автобуси тощо).
 * Показується вгорі списку маршрутів для відповідного виду транспорту.
 * Нічого не рендерить, якщо немає активних загальних оголошень.
 */
export function TransportAlertsBanner({ kind }: { kind?: TransportKind }) {
  const alerts = useRouteAlertsStore((s) => s.alerts);
  const startPolling = useRouteAlertsStore((s) => s.startPolling);

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  const general = findGeneralAlerts(alerts, kind);
  if (general.length === 0) return null;

  return (
    <div className="space-y-2">
      {general.map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-[12px] leading-relaxed text-ink-text animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-red-500">
              {alert.kind ? 'Можлива затримка руху — весь вид транспорту' : 'Можлива затримка руху — по всьому транспорту'}
            </p>
            <p className="mt-0.5 text-ink-text">{alert.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
