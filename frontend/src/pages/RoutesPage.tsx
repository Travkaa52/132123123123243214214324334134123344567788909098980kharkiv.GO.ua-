import { useState } from 'react';
import clsx from 'clsx';
import { TransportKindPage } from '@/pages/TransportKindPage';
import { assetUrl } from '@/lib/assetUrl';
import type { TransportKind } from '@/types/transport';

interface TabItem {
  kind: TransportKind;
  label: string;
  /** Файл іконки виду транспорту з /public/icons — авторські PNG без фону. */
  icon: string;
}

const TABS: TabItem[] = [
  { kind: 'bus', label: 'Автобуси', icon: 'avtobusicono.png' },
  { kind: 'trolleybus', label: 'Тролейбуси', icon: 'troleyicono.png' },
  { kind: 'tram', label: 'Трамваї', icon: 'tramwaiicono.png' },
  { kind: 'metro', label: 'Метро', icon: 'metroicono.png' }
];

export function RoutesPage() {
  const [activeTab, setActiveTab] = useState<TransportKind>('bus');

  return (
    <div className="min-h-dvh bg-bg text-ink-text selection:bg-primary/20">
      {/* Sticky Glassmorphic Navigation Bar — єдиний нейтральний стиль для всіх вкладок */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center gap-2 overflow-x-auto px-4 pt-3.5 pb-2 no-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.kind;

            return (
              <button
                key={tab.kind}
                onClick={() => setActiveTab(tab.kind)}
                className={clsx(
                  // h-10 фіксує ВИСОТУ КНОПКИ — вона не росте.
                  // overflow-visible дозволяє картинці вилазити за межі кнопки замість обрізання.
                  'relative flex h-10 shrink-0 items-center gap-1 overflow-visible rounded-lg border pl-1 pr-2.5 text-[11px] font-semibold transition-all duration-200 active:scale-95',
                  isActive
                    ? 'border-border bg-surface-raised text-ink-text shadow-sm backdrop-blur-md'
                    : 'border-border/40 bg-surface/50 text-ink-muted hover:bg-surface/80 hover:text-ink-text backdrop-blur-sm'
                )}
              >
                <img
                  src={assetUrl(`/icons/${tab.icon}`)}
                  alt={tab.label}
                  onError={(e) => {
                    // Якщо файл іконки раптом відсутній/не завантажився — просто ховаємо
                    // картинку замість "битого" значка браузера, лишається текстова мітка.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  className={clsx(
                    // Картинка БІЛЬША за кнопку (h-16 проти h-10) — вилазить зверху й знизу,
                    // сама кнопка (фон/рамка) лишається того самого розміру.
                    'h-16 w-16 shrink-0 object-contain transition-opacity duration-200',
                    isActive ? 'opacity-100' : 'opacity-60'
                  )}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Дисклеймер про точність даних — нейтральний стиль, без кольорового акценту */}
      <div className="mx-auto max-w-md px-4 pt-3">
        <div className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-[11px] leading-snug text-ink-muted">
          🛑Дані про маршрути можуть бути неточними — дані взяті з відкритих джерел і можуть відрізнятися від
          фактичного руху транспорту‼️
        </div>
      </div>

      {/* Active Tab Content */}
      <main className="relative">
        <TransportKindPage key={activeTab} kind={activeTab} />
      </main>
    </div>
  );
}
