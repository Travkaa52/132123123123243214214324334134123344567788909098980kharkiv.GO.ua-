import type { TransportKind } from '@/types/transport';
import type { SpriteSheetConfig } from '@/types/sprite';

/**
 * Реєстр Sprite Sheet на кожен вид транспорту.
 *
 * Файли самі PNG у цьому репозиторії НЕ постачаються — їх додає власник
 * проєкту в /public/sprites/*.png (див. /public/sprites/README.md).
 * Поки файл відсутній або не завантажився, <TransportSprite /> автоматично
 * показує акуратний геометричний фолбек (кольоровий маркер видом транспорту),
 * тож застосунок лишається робочим і без спрайтів.
 *
 * Щоб підключити реальний спрайт-лист — просто відредагуйте значення тут,
 * без змін у компонентах.
 */
export const TRANSPORT_SPRITES: Record<TransportKind, SpriteSheetConfig> = {
  metro: {
    kind: 'metro',
    src: '/sprites/metro.png',
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    directions: 8,
    rotationMode: 'frames',
    baseHeadingDeg: 0,
    displaySize: 34,
    anchor: { x: 0.5, y: 0.5 }
  },
  tram: {
    kind: 'tram',
    src: '/sprites/tram.png',
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    directions: 8,
    rotationMode: 'frames',
    baseHeadingDeg: 0,
    displaySize: 32,
    anchor: { x: 0.5, y: 0.5 }
  },
  trolleybus: {
    kind: 'trolleybus',
    src: '/sprites/trolleybus.png',
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    directions: 8,
    rotationMode: 'frames',
    baseHeadingDeg: 0,
    displaySize: 30,
    anchor: { x: 0.5, y: 0.5 }
  },
  bus: {
    kind: 'bus',
    src: '/sprites/bus.png',
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    directions: 8,
    rotationMode: 'frames',
    baseHeadingDeg: 0,
    displaySize: 30,
    anchor: { x: 0.5, y: 0.5 }
  }
};
