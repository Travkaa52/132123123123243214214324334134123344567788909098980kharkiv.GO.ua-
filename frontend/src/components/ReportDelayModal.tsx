import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Sheet, Button } from '@/components/ui';
import { useToastStore } from '@/store/useToastStore';
import { sendDelayReport, minutesSinceLastReport, QUICK_COMMENTS } from '@/lib/reportDelay';
import type { TransportKind } from '@/types/transport';

interface ReportDelayModalProps {
  open: boolean;
  onClose: () => void;
  initialKind?: TransportKind | null;
  initialRouteNumber?: string;
  initialStopName?: string;
}

const KIND_OPTIONS: Array<{ value: TransportKind; label: string; icon: string }> = [
  { value: 'bus', label: 'Автобус', icon: '🚌' },
  { value: 'trolleybus', label: 'Тролейбус', icon: '🚎' },
  { value: 'tram', label: 'Трамвай', icon: '🚊' },
  { value: 'metro', label: 'Метро', icon: '🚇' }
];

/**
 * Шторка "Повідомити про затримку". Якщо форму відкрили з конкретного
 * маршруту (RouteDetailModal тощо), вид транспорту й номер маршруту вже
 * підставлені — лишається тапнути готовий варіант коментаря (або нічого не
 * чіпати) і один раз підтвердити відправку. Дані йдуть адміну в ЛС через
 * Telegram-бота (lib/reportDelay.ts); саме Telegram вимагає останнє
 * підтвердження "Надіслати" в чаті з ботом — це захист від спаму на боці
 * платформи, обійти його з фронтенду без бекенду не можна.
 */
export function ReportDelayModal({
  open,
  onClose,
  initialKind = null,
  initialRouteNumber = '',
  initialStopName = ''
}: ReportDelayModalProps) {
  const showToast = useToastStore((s) => s.show);

  const [kind, setKind] = useState<TransportKind | null>(initialKind);
  const [routeNumber, setRouteNumber] = useState(initialRouteNumber);
  const [stopName, setStopName] = useState(initialStopName);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setRouteNumber(initialRouteNumber);
    setStopName(initialStopName);
    setComment('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind, initialRouteNumber, initialStopName]);

  const resetForm = () => {
    setKind(null);
    setRouteNumber('');
    setStopName('');
    setComment('');
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const isValid = routeNumber.trim().length > 0;
  const recentMinutes = minutesSinceLastReport(kind, routeNumber);

  const handleSubmit = () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    const result = sendDelayReport({ kind, routeNumber, stopName, comment });
    setIsSubmitting(false);

    if (result.ok) {
      showToast('Дякуємо! Залишилось підтвердити "Надіслати" в чаті з ботом.', 'success');
      resetForm();
      onClose();
      return;
    }

    showToast('Функція ще не налаштована адміністратором. Спробуйте пізніше.', 'error');
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Повідомити про затримку">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-[18px] border border-gold/25 bg-gold/10 p-3.5 text-xs leading-relaxed text-ink-text">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-gold" />
          <span>
            Усе вже підставлено — можна одразу тиснути кнопку внизу. Відкриється чат із ботом
            Kharkiv GO в Telegram із заповненим повідомленням, залишиться тільки натиснути
            «Надіслати».
          </span>
        </div>

        {recentMinutes !== null && (
          <div className="flex items-start gap-2.5 rounded-[18px] border border-primary/25 bg-primary/10 p-3.5 text-xs leading-relaxed text-ink-text">
            <Check size={17} className="mt-0.5 shrink-0 text-primary" />
            <span>
              Ви вже повідомляли про цей маршрут {recentMinutes === 0 ? 'щойно' : `${recentMinutes} хв тому`}.
              Якщо затримка триває — можна надіслати ще раз.
            </span>
          </div>
        )}

        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted">
            Вид транспорту
          </label>
          <div className="grid grid-cols-4 gap-2">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value === kind ? null : opt.value)}
                className={`flex flex-col items-center gap-1.5 rounded-[16px] border py-3 text-[11px] font-bold transition-all active:scale-95 ${
                  kind === opt.value
                    ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
                    : 'border-border/40 bg-surface-soft text-ink-muted hover:bg-surface'
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="delay-route" className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted">
            Номер маршруту *
          </label>
          <input
            id="delay-route"
            type="text"
            inputMode="text"
            value={routeNumber}
            onChange={(e) => setRouteNumber(e.target.value)}
            placeholder="Напр. 27 або А1"
            className="w-full rounded-[16px] border border-border/40 bg-surface-soft px-4 py-3.5 text-sm font-semibold text-ink-text outline-none placeholder:text-ink-muted focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <div>
          <label htmlFor="delay-stop" className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted">
            Зупинка (необов’язково)
          </label>
          <input
            id="delay-stop"
            type="text"
            value={stopName}
            onChange={(e) => setStopName(e.target.value)}
            placeholder="Де саме чекаєте транспорт?"
            className="w-full rounded-[16px] border border-border/40 bg-surface-soft px-4 py-3.5 text-sm font-semibold text-ink-text outline-none placeholder:text-ink-muted focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted">
            Коментар
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_COMMENTS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setComment(comment === preset ? '' : preset)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95 ${
                  comment === preset
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/40 bg-surface-soft text-ink-muted hover:bg-surface'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            id="delay-comment"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Або опишіть словами — необов'язково"
            className="w-full resize-none rounded-[16px] border border-border/40 bg-surface-soft px-4 py-3.5 text-sm font-semibold text-ink-text outline-none placeholder:text-ink-muted focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
          />
        </div>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          disabled={!isValid}
          onClick={handleSubmit}
        >
          Відкрити чат з ботом
        </Button>
      </div>
    </Sheet>
  );
}
