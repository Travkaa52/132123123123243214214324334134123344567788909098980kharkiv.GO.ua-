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
// ПРИМІТКА: у /public/sprites лежать одиночні фото (JPG/PNG), а НЕ
// нарізані по кадрах sprite sheet-и. Тому для всіх видів транспорту
// використовуємо rotationMode: 'continuous' — один кадр на весь файл,
// що плавно обертається CSS transform: rotate() за курсом.
export const TRANSPORT_SPRITES: Record<TransportKind, SpriteSheetConfig> = {
  metro: {
    kind: 'metro',
    src: '/sprites/metro.jpg',
    frameWidth: 1264,
    frameHeight: 843,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 38,
    anchor: { x: 0.5, y: 0.5 }
  },
  tram: {
    kind: 'tram',
    src: '/sprites/tramvay.jpg',
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 32,
    anchor: { x: 0.5, y: 0.5 }
  },
  trolleybus: {
    kind: 'trolleybus',
    src: '/sprites/trolley.jpg',
    frameWidth: 1280,
    frameHeight: 714,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 30,
    anchor: { x: 0.5, y: 0.5 }
  },
  bus: {
    kind: 'bus',
    src: '/sprites/bus.png',
    frameWidth: 1264,
    frameHeight: 843,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 30,
    anchor: { x: 0.5, y: 0.5 }
  }
};

/**
 * Окремі спрайти для кожної лінії метро (route-metro-1/2/3 — червона/синя/зелена),
 * замість єдиного /sprites/metro.jpg для всіх ліній. Ключ — id маршруту з routes.json.
 * Розміри кадру відповідають реальним файлам у /public/sprites (пропорції в них різні,
 * тому displayHeight рахуватиметься коректно лише з правильних frameWidth/frameHeight).
 */
export const METRO_LINE_SPRITES: Record<string, SpriteSheetConfig> = {
  'route-metro-1': {
    kind: 'metro',
    src: '/sprites/metro-red-line.jpg',
    frameWidth: 386,
    frameHeight: 257,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 38,
    anchor: { x: 0.5, y: 0.5 }
  },
  'route-metro-2': {
    kind: 'metro',
    src: '/sprites/metro-blue-line.jpg',
    frameWidth: 389,
    frameHeight: 217,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 38,
    anchor: { x: 0.5, y: 0.5 }
  },
  'route-metro-3': {
    kind: 'metro',
    src: '/sprites/metro-green-line.jpg',
    frameWidth: 370,
    frameHeight: 292,
    columns: 1,
    directions: 1,
    rotationMode: 'continuous',
    baseHeadingDeg: 0,
    displaySize: 38,
    anchor: { x: 0.5, y: 0.5 }
  }
};
