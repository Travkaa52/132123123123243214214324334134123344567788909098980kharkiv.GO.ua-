import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet, Button } from '@/components/ui';
import { useToastStore } from '@/store/useToastStore';
import { sendDelayReport } from '@/lib/reportDelay';
import type { TransportKind } from '@/types/transport';

interface ReportDelayModalProps {
  open: boolean;
  onClose: () => void;
}

const KIND_OPTIONS: Array<{ value: TransportKind; label: string; icon: string }> = [
  { value: 'bus', label: 'Автобус', icon: '🚌' },
  { value: 'trolleybus', label: 'Тролейбус', icon: '🚎' },
  { value: 'tram', label: 'Трамвай', icon: '🚊' },
  { value: 'metro', label: 'Метро', icon: '🚇' }
];

/**
 * Шторка "Повідомити про затримку" — форма, яку користувач заповнює на
 * головній сторінці, щоб поскаржитись на затримку транспорту. Дані
 * відправляються адміну в ЛС через Telegram-бота (lib/reportDelay.ts).
 */
export function ReportDelayModal({ open, onClose }: ReportDelayModalProps) {
  const showToast = useToastStore((s) => s.show);

  const [kind, setKind] = useState<TransportKind | null>(null);
  const [routeNumber, setRouteNumber] = useState('');
  const [stopName, setStopName] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    const result = sendDelayReport({ kind, routeNumber, stopName, comment });
    setIsSubmitting(false);

    if (result.ok) {
      showToast('Відкрили чат з ботом — натисніть "Надіслати", щоб підтвердити.', 'success');
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
            Розкажіть, який транспорт затримується — відкриється чат із ботом Kharkiv GO в
            Telegram із заповненим повідомленням, залишиться тільки натиснути «Надіслати».
          </span>
        </div>

        {/* Вид транспорту */}
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

        {/* Номер маршруту */}
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

        {/* Зупинка (необов'язково) */}
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

        {/* Коментар */}
        <div>
          <label htmlFor="delay-comment" className="mb-2 block text-xs font-bold uppercase tracking-wide text-ink-muted">
            Коментар
          </label>
          <textarea
            id="delay-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Наскільки велика затримка, з якого часу немає транспорту тощо"
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
