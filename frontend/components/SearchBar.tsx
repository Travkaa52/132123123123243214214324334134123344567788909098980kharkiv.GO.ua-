import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface SearchBarProps {
  placeholder?: string;
  onSubmit: (query: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Викликається на кожну зміну введення — для живих підказок (напр. на карті). */
  onQueryChange?: (query: string) => void;
  autoFocus?: boolean;
  /** Керований ззовні очищений стан (напр. після вибору підказки на карті). */
  value?: string;
}

export function SearchBar({
  placeholder = 'Пошук зупинок, маршрутів, адрес…',
  onSubmit,
  onFocus,
  onBlur,
  onQueryChange,
  autoFocus,
  value: controlledValue
}: SearchBarProps) {
  const [value, setValue] = useState(controlledValue ?? '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (controlledValue !== undefined) setValue(controlledValue);
  }, [controlledValue]);

  function updateValue(next: string) {
    setValue(next);
    onQueryChange?.(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={clsx(
          'flex items-center gap-3 rounded-xl2 border border-white/40 bg-white/80 px-4 py-3',
          'shadow-glass backdrop-blur-xs transition-shadow',
          focused && 'shadow-glass-lg ring-2 ring-gold/50'
        )}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-graphite/50">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={value}
          onChange={(e) => updateValue(e.target.value)}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full bg-transparent font-body text-sm text-graphite placeholder:text-graphite/40 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => updateValue('')}
            aria-label="Очистити пошук"
            className="shrink-0 text-graphite/40 hover:text-graphite"
          >
            ✕
          </button>
        )}
      </div>
    </form>
  );
}
