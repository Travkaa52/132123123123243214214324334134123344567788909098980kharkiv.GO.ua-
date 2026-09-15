import { memo } from 'react';
import { TRANSPORT_COLORS } from '@/config/map';
import { assetUrl } from '@/lib/assetUrl';
import type { TransportKind } from '@/types/transport';

export interface TransportKindIconProps {
  kind: TransportKind;
  size?: number;
  className?: string;
}

/**
 * Реальні фото-іконки виду транспорту з /public/sprites (замовлення
 * замовника: використовувати саме ці картинки, а не намальовані SVG).
 * Для метро окремої іконки-фото нема (є лише великий sprite sheet вагона),
 * тому метро й далі малюється векторно.
 */
const KIND_PHOTO_ICONS: Partial<Record<TransportKind, string>> = {
  bus: assetUrl('sprites/iconsbus.png'),
  tram: assetUrl('sprites/iconstramvay.jpg'),
  trolleybus: assetUrl('sprites/iconstrolley.jpg')
};

/**
 * Векторна (SVG) піктограма виду транспорту — метро / трамвай / тролейбус / автобус.
 *
 * НА ВІДМІНУ від <TransportSprite /> (яка малює РУХОМИЙ маркер на карті і
 * підвантажує PNG Sprite Sheet з /public/sprites, з геометричним фолбеком),
 * ця іконка НІКОЛИ не рухається і не залежить від зовнішніх файлів — вона
 * потрібна лише щоб користувач з першого погляду бачив, з яким видом
 * транспорту він має справу: на картці маршруту (<RouteCard />), картці
 * зупинки (<StopCard />) і в панелі керування шарами карти
 * (<TransportLayersPanel />).
 */
function TransportKindIconComponent({ kind, size = 20, className }: TransportKindIconProps) {
  const color = TRANSPORT_COLORS[kind] ?? '#2B2F31';

  const photoSrc = KIND_PHOTO_ICONS[kind];
  if (photoSrc) {
    return (
      <img
        src={photoSrc}
        alt={KIND_LABELS_UK[kind]}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ring-1 ring-black/5 ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    className,
    'aria-hidden': true as const
  };

  switch (kind) {
    case 'metro':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="14" rx="6" fill={color} />
          <circle cx="8" cy="14" r="1.4" fill="white" />
          <circle cx="16" cy="14" r="1.4" fill="white" />
          <rect x="6.5" y="6" width="4.5" height="5" rx="1" fill="white" fillOpacity="0.9" />
          <rect x="13" y="6" width="4.5" height="5" rx="1" fill="white" fillOpacity="0.9" />
          <path d="M8 20l1.6-2.4h4.8L16 20" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'tram':
      return (
        <svg {...common}>
          <path d="M12 2.2c-4.4 0-6.6 1-6.6 1v11.3c0 1.4 1.1 2.5 2.5 2.5h8.2c1.4 0 2.5-1.1 2.5-2.5V3.2s-2.2-1-6.6-1z" fill={color} />
          <rect x="6.6" y="5" width="4.4" height="4.6" rx="0.8" fill="white" fillOpacity="0.9" />
          <rect x="13" y="5" width="4.4" height="4.6" rx="0.8" fill="white" fillOpacity="0.9" />
          <circle cx="8.2" cy="14.6" r="1.3" fill="white" />
          <circle cx="15.8" cy="14.6" r="1.3" fill="white" />
          <rect x="3.4" y="9.6" width="2.2" height="1.6" rx="0.4" fill={color} />
          <rect x="18.4" y="9.6" width="2.2" height="1.6" rx="0.4" fill={color} />
          <path d="M9 20.5l1.4-2h3.2l1.4 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'trolleybus':
      return (
        <svg {...common}>
          <path d="M6 20V8.5A3.5 3.5 0 0 1 9.5 5h5A3.5 3.5 0 0 1 18 8.5V20" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <rect x="4.6" y="7.5" width="14.8" height="10" rx="2.4" fill={color} />
          <rect x="6.6" y="9.6" width="4.4" height="4.2" rx="0.8" fill="white" fillOpacity="0.9" />
          <rect x="13" y="9.6" width="4.4" height="4.2" rx="0.8" fill="white" fillOpacity="0.9" />
          <circle cx="8.2" cy="18.6" r="1.3" fill={color} stroke="white" strokeWidth="1" />
          <circle cx="15.8" cy="18.6" r="1.3" fill={color} stroke="white" strokeWidth="1" />
          <path d="M9.5 5L7.5 2.2M14.5 5l2-2.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'bus':
    default:
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="11.5" rx="2.5" fill={color} />
          <rect x="6" y="7" width="4.2" height="4" rx="0.8" fill="white" fillOpacity="0.9" />
          <rect x="13.8" y="7" width="4.2" height="4" rx="0.8" fill="white" fillOpacity="0.9" />
          <circle cx="8" cy="18.2" r="1.5" fill="white" stroke={color} strokeWidth="1.2" />
          <circle cx="16" cy="18.2" r="1.5" fill="white" stroke={color} strokeWidth="1.2" />
          <rect x="4" y="12.5" width="16" height="1.4" fill="white" fillOpacity="0.5" />
        </svg>
      );
  }
}

export const TransportKindIcon = memo(TransportKindIconComponent);

export const KIND_LABELS_UK: Record<TransportKind, string> = {
  metro: 'Метро',
  tram: 'Трамвай',
  trolleybus: 'Тролейбус',
  bus: 'Автобус'
};
