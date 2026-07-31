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
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe px-3" aria-label="Основна навігація">
      <div className="glass-surface mx-auto mb-2 flex max-w-md items-center justify-between rounded-full px-2 py-1.5 shadow-glass-lg">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                clsx(
                  'group relative z-[2] flex flex-1 flex-col items-center justify-center gap-1 rounded-full py-1.5 transition-all duration-300 ease-out active:scale-90',
                  isActive
                    ? 'text-primary font-bold bg-primary/12 shadow-[inset_0_1px_0.5px_rgb(255_255_255_/_0.35)]'
                    : 'text-ink-muted hover:text-ink-text hover:bg-primary/5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={clsx(
                      'h-5 w-5 transition-all duration-200',
                      isActive
                        ? '-translate-y-0.5 stroke-[2.25] text-primary'
                        : 'stroke-[1.75] group-hover:scale-105'
                    )}
                  />

                  <span className="text-[10px] tracking-tight leading-none">
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
