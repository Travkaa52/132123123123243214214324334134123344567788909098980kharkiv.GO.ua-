import { NavLink } from 'react-router-dom';
import { Home, Map, Route as RouteIcon, Star, User } from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Головна', icon: Home, exact: true },
  { to: '/map', label: 'Карта', icon: Map, exact: true },
  { to: '/routes', label: 'Маршрути', icon: RouteIcon },
  { to: '/favorites', label: 'Обране', icon: Star },
  { to: '/profile', label: 'Профіль', icon: User },
];

/**
 * Нижня навігаційна панель у стилі Ultra Premium Glassmorphism.
 * Забезпечує адаптивні відступи (Safe Area) та плавну мікроанімацію активного стану.
 */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe px-4" aria-label="Основна навігація">
      <div className="glass-surface mx-auto mb-3 flex max-w-md items-center justify-between rounded-[28px] p-1.5 shadow-glass-lg">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className="group relative z-[2] flex flex-1 flex-col items-center justify-center gap-1 rounded-[22px] py-2.5 transition-transform duration-200 ease-out active:scale-90"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[22px] bg-primary/14 shadow-[inset_0_1px_0.5px_rgb(255_255_255_/_0.4)] animate-in fade-in zoom-in-95 duration-200"
                      aria-hidden
                    />
                  )}
                  <Icon
                    className={clsx(
                      'relative h-[22px] w-[22px] transition-all duration-200',
                      isActive
                        ? '-translate-y-0.5 stroke-[2.4] text-primary'
                        : 'stroke-[1.75] text-ink-muted group-hover:text-ink-text group-hover:scale-105'
                    )}
                  />
                  <span
                    className={clsx(
                      'relative text-[10.5px] tracking-tight leading-none transition-colors duration-200',
                      isActive ? 'font-bold text-primary' : 'font-semibold text-ink-muted group-hover:text-ink-text'
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
