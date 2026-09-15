import { useState } from 'react';
import clsx from 'clsx';
import { TransportKindIcon, KIND_LABELS_UK } from '@/components/TransportKindIcon';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { TransportKind } from '@/types/transport';

const KIND_ORDER: TransportKind[] = ['metro', 'tram', 'trolleybus', 'bus'];

/**
 * Плаваюча панель керування шарами карти.
 *
 * Дозволяє вмикати/вимикати показ кожного виду транспорту (метро, трамвай,
 * тролейбус, автобус — лінії маршрутів на карті) і окремо шар зупинок з
 * локальної бази. Стан зберігається в useSettingsStore (persist), тож
 * вибір користувача переживає перезавантаження застосунку.
 *
 * У згорнутому вигляді — компактна кругла кнопка-перемикач (щоб не
 * перекривати карту); розгорнута — картка з тумблерами в стилі застосунку
 * (glass-картка, forest/gold/mint палітра).
 */
export function TransportLayersPanel() {
  const [open, setOpen] = useState(false);
  const visibleKinds = useSettingsStore((s) => s.visibleTransportKinds);
  const showStops = useSettingsStore((s) => s.showStopsOnMap);
  const toggleKind = useSettingsStore((s) => s.toggleTransportKind);
  const toggleStops = useSettingsStore((s) => s.toggleStopsOnMap);
  const showAll = useSettingsStore((s) => s.showAllTransportKinds);

  const allVisible = visibleKinds.length === KIND_ORDER.length && showStops;

  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 z-30 flex flex-col items-start gap-2">
      {open && (
        <div className="w-56 animate-slide-up rounded-xl2 border border-white/60 bg-white/95 p-3 shadow-glass-lg backdrop-blur-xs">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-graphite/60">На карті</p>
            <button
              type="button"
              onClick={showAll}
              disabled={allVisible}
              className={clsx(
                'text-[11px] font-semibold',
                allVisible ? 'text-graphite/30' : 'text-forest hover:underline'
              )}
            >
              Показати все
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {KIND_ORDER.map((kind) => {
              const active = visibleKinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition',
                    active ? 'bg-mint/30' : 'bg-transparent opacity-50'
                  )}
                >
                  <TransportKindIcon kind={kind} size={20} />
                  <span className="flex-1 font-body text-sm font-medium text-graphite">{KIND_LABELS_UK[kind]}</span>
                  <span
                    className={clsx(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      active ? 'bg-forest' : 'bg-graphite/20'
                    )}
                  >
                    <span
                      className={clsx(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                        active ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t border-graphite/10 pt-2">
            <button
              type="button"
              onClick={toggleStops}
              aria-pressed={showStops}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition',
                showStops ? 'bg-gold/20' : 'bg-transparent opacity-50'
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-forest bg-white text-[9px] font-bold text-forest">
                •
              </span>
              <span className="flex-1 font-body text-sm font-medium text-graphite">Зупинки</span>
              <span
                className={clsx(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                  showStops ? 'bg-forest' : 'bg-graphite/20'
                )}
              >
                <span
                  className={clsx(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    showStops ? 'translate-x-4' : 'translate-x-0.5'
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Керування шарами транспорту на карті"
        className={clsx(
          'relative flex h-12 w-12 items-center justify-center rounded-full shadow-glass-lg backdrop-blur-xs transition hover:scale-105 active:scale-95',
          open ? 'bg-forest text-white' : 'bg-white/90 text-forest'
        )}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 6h16M4 12h10M4 18h13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
          <circle cx="16" cy="18" r="2" fill="currentColor" />
        </svg>
        {!allVisible && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-gold" />
        )}
      </button>
    </div>
  );
}
