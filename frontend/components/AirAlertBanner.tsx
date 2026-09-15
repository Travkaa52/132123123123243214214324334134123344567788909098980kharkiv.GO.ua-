import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAirAlertStore } from '@/store/useAirAlertStore';

/**
 * Помаранчевий банер повітряної тривоги в Харкові — показується на
 * Головній, у Карті та в розділі Маршрути, коли тривога оголошена по
 * всій Харківській області АБО окремо по Харківському району (дивись
 * src/lib/airAlert.ts). Джерело — публічний фід ubilling.net.ua,
 * опитується раз на 30с. Нічого не рендерить, якщо тривоги немає.
 */
export function AirAlertBanner({ className }: { className?: string }) {
  const isAlert = useAirAlertStore((s) => s.isAlert);
  const startPolling = useAirAlertStore((s) => s.startPolling);

  useEffect(() => {
    startPolling();
  }, [startPolling]);

  if (!isAlert) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3.5 text-[12px] leading-relaxed text-ink-text backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${className ?? ''}`}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1 font-semibold text-amber-600">
        В місті Харків та області оголошено повітряну тривогу тому розклад та інтервал руху може змінюватись!
      </p>
    </div>
  );
}
