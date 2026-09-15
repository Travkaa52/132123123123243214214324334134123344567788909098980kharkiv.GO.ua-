import clsx from 'clsx';

interface GpsButtonProps {
  onClick: () => void;
  isLocating?: boolean;
  hasError?: boolean;
}

export function GpsButton({ onClick, isLocating, hasError }: GpsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Визначити моє місцезнаходження"
      className={clsx(
        'glass-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-glass transition',
        'hover:scale-105 active:scale-95',
        hasError && 'ring-2 ring-red-400'
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className={clsx('text-forest', isLocating && 'animate-spin')}
      >
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      </svg>
    </button>
  );
}
