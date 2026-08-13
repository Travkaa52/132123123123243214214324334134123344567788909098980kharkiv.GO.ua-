import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useRouteAlertsStore } from '@/store/useRouteAlertsStore';
import { findAlertForRoute } from '@/lib/routeAlerts';
import type { TransportKind } from '@/types/transport';

/**
 * Вспомогательная функция для форматирования времени алерта
 */
function formatAlertTime(dateString?: string) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

/**
 * Банер активного оголошення про затримку для конкретного маршруту.
 * Оголошення з'являється, коли адмін підтвердив затримку через бота
 * (вручну або після скарг ≥5 користувачів) і зникає автоматично.
 */
export function RouteAlertBanner({
  routeNumber,
  kind
}: {
  routeNumber: string;
  kind?: TransportKind;
}) {
  const alerts = useRouteAlertsStore((s) => s.alerts);
  const startPolling = useRouteAlertsStore((s) => s.startPolling);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  const alert = findAlertForRoute(alerts, routeNumber, kind);
  if (!alert) return null;

  // Безопасное получение времени создания/обновления
  const rawDate = alert.createdAt || (alert as { updatedAt?: string; date?: string }).updatedAt || (alert as { date?: string }).date;
  const formattedTime = formatAlertTime(rawDate);
  const isLongMessage = alert.message && alert.message.length > 120;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3.5 shadow-glass backdrop-blur-md transition-all animate-slide-up">
      {/* Легкий красный фоновый градиент для глубины */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-rose-500/15 blur-xl" />

      <div className="flex items-start gap-3">
        {/* Анимированный плашка-иконка с пульсирующим индикатором */}
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/20 text-rose-500 shadow-xs">
          <AlertTriangle size={18} />
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
        </div>

        {/* Контентная часть */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold tracking-wide text-rose-500 uppercase">
              Можлива затримка руху
            </h4>
            
            {formattedTime && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-rose-500/70">
                <Clock size={12} />
                {formattedTime}
              </span>
            )}
          </div>

          <p
            className={`mt-1 text-xs leading-relaxed text-ink-text/90 ${
              !isExpanded && isLongMessage ? 'line-clamp-2' : ''
            }`}
          >
            {alert.message}
          </p>

          {/* Кнопка раскрытия, если текст объявления длинный */}
          {isLongMessage && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors"
            >
              {isExpanded ? (
                <>
                  Згорнути <ChevronUp size={12} />
                </>
              ) : (
                <>
                  Читати повністю <ChevronDown size={12} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
