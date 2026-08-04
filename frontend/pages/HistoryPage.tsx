import { PageHeader } from '@/components/PageHeader';
import { useHistoryStore } from '@/store/useHistoryStore';

const TYPE_LABELS: Record<string, string> = { stop: 'Зупинка', route: 'Маршрут', address: 'Адреса' };

// Іконка на тип запису — раніше всі рядки історії виглядали однаково
// (просто текст + підпис типу), важко було відсканувати список оком.
const TYPE_ICON: Record<string, React.ReactNode> = {
  stop: <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
  route: <path d="M4 6h16M4 12h10M4 18h13" strokeLinecap="round" />,
  address: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
};

export function HistoryPage() {
  const entries = useHistoryStore((s) => s.entries);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const clear = useHistoryStore((s) => s.clear);

  return (
    <div className="min-h-dvh bg-surface-soft pb-20">
      <PageHeader title="Історія" subtitle="Останні пошукові запити" />
      <div className="px-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl2 bg-ink-surface/70 py-16 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-text">Історія пошуку порожня</p>
            <p className="text-sm text-ink-muted max-w-[240px]">
              Тут з'являтимуться ваші останні пошуки зупинок, маршрутів і адрес
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <button
                onClick={clear}
                className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted transition hover:text-destructive"
              >
                Очистити все
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl2 bg-ink-surface/90 p-3 shadow-glass transition hover:shadow-glass-lg"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint/30 text-mint">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      {TYPE_ICON[entry.type]}
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-text">{entry.query}</p>
                    <p className="text-xs text-ink-muted">{TYPE_LABELS[entry.type]}</p>
                  </div>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Видалити запис"
                    className="shrink-0 rounded-full p-2 text-ink-muted transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
