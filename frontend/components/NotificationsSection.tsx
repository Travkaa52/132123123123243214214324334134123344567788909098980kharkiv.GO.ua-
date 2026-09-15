import { useEffect, useState, useMemo } from 'react';
import { Bell, ExternalLink, Rss, AlertCircle } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { useNotificationsStore } from '@/store/useNotificationsStore';

// 36 часов в миллисекундах: 36 * 60 * 60 * 1000
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} год тому`;
  const days = Math.floor(hrs / 24);
  return `${days} дн тому`;
}

/** Дзвіночок у шапці головної сторінки: відкриває шторку зі сповіщеннями з Telegram-каналів. */
export function NotificationsBell() {
  const { items, isLoading, error, fetchNotifications, startPolling, markAllSeen, lastSeenCount } = useNotificationsStore();

  // Залишаємо лише сповіщення за останні 36 годин
  const freshItems = useMemo(() => {
    const now = Date.now();
    return items.filter((n) => now - new Date(n.date).getTime() <= MAX_AGE_MS);
  }, [items]);

  const unseenCount = Math.max(0, freshItems.length - lastSeenCount);
  
  // items приходять від парсера відсортованими від найновіших — перші
  // unseenCount записів і є тими, що користувач ще не бачив.
  const hasUnseenAlert = freshItems.slice(0, unseenCount).some((n) => n.kind === 'alert');

  useEffect(() => {
    fetchNotifications();
    // Дзвіночок змонтований весь час, поки застосунок відкритий, тому саме
    // тут запускаємо періодичний опит — щоб термінове оголошення (закриття
    // станції, повітряна тривога тощо) з'являлось без перезаходу в застосунок.
    startPolling();
  }, [fetchNotifications, startPolling]);

  return (
    <NotificationsBellButton
      unseenCount={unseenCount}
      hasUnseenAlert={hasUnseenAlert}
      isLoading={isLoading}
      error={error}
      items={freshItems}
      onOpen={markAllSeen}
    />
  );
}

function NotificationsBellButton({
  unseenCount,
  hasUnseenAlert,
  isLoading,
  error,
  items,
  onOpen
}: {
  unseenCount: number;
  hasUnseenAlert: boolean;
  isLoading: boolean;
  error: string | null;
  items: ReturnType<typeof useNotificationsStore.getState>['items'];
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onOpen();
        }}
        aria-label="Сповіщення"
        className={`relative p-2.5 rounded-2xl bg-surface-raised border transition-all active:scale-95 text-ink-text shadow-xs ${
          hasUnseenAlert ? 'border-rose-500/50 animate-pulse' : 'border-border/40 hover:bg-surface-soft'
        }`}
      >
        <Bell size={18} className={hasUnseenAlert ? 'text-rose-500' : undefined} />
        {unseenCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Сповіщення">
        <NotificationsList items={items} isLoading={isLoading} error={error} />
      </Sheet>
    </>
  );
}

function NotificationsList({
  items,
  isLoading,
  error
}: {
  items: ReturnType<typeof useNotificationsStore.getState>['items'];
  isLoading: boolean;
  error: string | null;
}) {
  // Фільтруємо за останніми 36 годинами + сортуємо (алерти вгору, далі за датою)
  const freshSortedItems = useMemo(() => {
    const now = Date.now();
    return items
      .filter((n) => now - new Date(n.date).getTime() <= MAX_AGE_MS)
      .sort((a, b) => {
        const aAlert = a.kind === 'alert' ? 1 : 0;
        const bAlert = b.kind === 'alert' ? 1 : 0;
        if (aAlert !== bAlert) return bAlert - aAlert;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [items]);

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-3 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertCircle className="h-6 w-6 text-ink-muted/60" />
        <p className="text-xs font-medium text-ink-muted">{error}</p>
      </div>
    );
  }

  if (freshSortedItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Rss className="h-6 w-6 text-ink-muted/60" />
        <p className="text-xs font-medium text-ink-muted">Нових сповіщень немає</p>
      </div>
    );
  }

  return (
    <div className="max-h-[55vh] space-y-2 overflow-y-auto -mx-1 px-1 py-1">
      {freshSortedItems.map((n) => (
        <a
          key={n.id}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`block rounded-2xl border p-3 transition-colors ${
            n.kind === 'alert'
              ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15'
              : 'border-border/40 bg-surface hover:bg-surface-soft'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="flex items-center gap-1.5 min-w-0">
              {n.kind === 'alert' && (
                <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                  Терміново
                </span>
              )}
              <span className="text-[11px] font-bold text-primary truncate">{n.channelTitle}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-ink-muted">{timeAgo(n.date)}</span>
              <ExternalLink className="h-3 w-3 text-ink-muted/60" />
            </div>
          </div>
          <p className="text-xs text-ink-text/90 leading-relaxed line-clamp-3">
            {n.text || (n.hasMedia ? '📎 Медіа-повідомлення' : '')}
          </p>
        </a>
      ))}
    </div>
  );
}

/** Компактний блок з останніми 3 повідомленнями прямо на головній сторінці. */
export function NotificationsSection() {
  const { items, isLoading, error, fetchNotifications } = useNotificationsStore();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Перевіряємо наявність свіжих сповіщень для відображення секції
  const freshItems = useMemo(() => {
    const now = Date.now();
    return items.filter((n) => now - new Date(n.date).getTime() <= MAX_AGE_MS);
  }, [items]);

  if (!isLoading && !error && freshItems.length === 0) return null;

  return (
    <section className="bg-surface-raised rounded-[22px] p-4 border border-border/40 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 mb-3">
        <Rss className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-extrabold text-ink-text">Сповіщення з каналів</h3>
      </div>
      <NotificationsList items={freshItems} isLoading={isLoading} error={error} />
    </section>
  );
}
