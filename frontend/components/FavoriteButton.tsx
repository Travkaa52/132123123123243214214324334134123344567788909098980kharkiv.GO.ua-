import clsx from 'clsx';

interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}

/**
 * Кнопка "додати в обране" — раніше в RouteCard/StopCard дублювався
 * текстовий гліф ★/☆ без анімації та aria-pressed. Тепер це один
 * переюзабельний компонент: справжня SVG-зірка, що плавно масштабується
 * і заливається золотим при активації, з коректною семантикою для читалок екрана.
 */
export function FavoriteButton({ active, onToggle, label, className }: FavoriteButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={label}
      className={clsx(
        'group/fav shrink-0 rounded-full p-1.5 transition-transform active:scale-90',
        className
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        className={clsx(
          'transition-all duration-200 ease-out',
          active
            ? 'scale-110 fill-gold stroke-gold drop-shadow-[0_0_6px_rgba(198,165,82,0.55)]'
            : 'scale-100 fill-transparent stroke-graphite/40 group-hover/fav:stroke-gold/70'
        )}
        strokeWidth="1.6"
      >
        <path
          d="M12 3.5l2.55 5.44 5.95.8-4.3 4.24 1.05 5.98L12 17.02l-5.25 2.94 1.05-5.98-4.3-4.24 5.95-.8L12 3.5Z"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
