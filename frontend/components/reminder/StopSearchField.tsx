import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { localStops } from '@/data/localData';
import type { StopItem } from '@/data/localData';

interface StopSearchFieldProps {
  label: string;
  placeholder: string;
  value: StopItem | null;
  onSelect: (stop: StopItem) => void;
}

/**
 * Пошук точки (дому/пункту призначення) через найближчу реальну зупинку —
 * без окремого геокодера адрес застосунок використовує назву найближчої
 * зупинки як практичний замінник адреси: користувач вводить назву
 * вулиці/району, з підказок обирає найближчу зупинку, а далі система вже
 * сама рахує пішу відстань і маршрут від цієї точки.
 */
export function StopSearchField({ label, placeholder, value, onSelect }: StopSearchFieldProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    return localStops.search(query).slice(0, 6);
  }, [query]);

  return (
    <div className="space-y-1.5">
      <label className="px-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</label>

      {value && !focused ? (
        <button
          type="button"
          onClick={() => setFocused(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5 text-left active:scale-[0.99]"
        >
          <MapPin size={16} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-text">{value.name}</span>
        </button>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-surface-soft px-3 py-2.5">
            <Search size={16} className="shrink-0 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={placeholder}
              className="w-full bg-transparent text-sm text-ink-text placeholder:text-ink-muted/60 focus:outline-none"
            />
          </div>

          {focused && results.length > 0 && (
            <div className="absolute inset-x-0 top-[calc(100%+4px)] z-10 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-surface shadow-2xl">
              {results.map((stop) => (
                <button
                  key={stop.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(stop);
                    setQuery('');
                    setFocused(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-soft"
                >
                  <MapPin size={14} className="shrink-0 text-ink-muted" />
                  <span className="truncate text-sm font-medium text-ink-text">{stop.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
