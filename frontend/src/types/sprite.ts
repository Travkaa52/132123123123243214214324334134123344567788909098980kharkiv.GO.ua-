import type { TransportKind } from '@/types/transport';

/**
 * Опис одного PNG Sprite Sheet для моделі транспорту.
 * Один спрайт-лист на КОЖЕН ВИД транспорту (metro/tram/trolleybus/bus) —
 * не на кожен маршрут. Номер маршруту та кінцева зупинка малюються поверх
 * окремим компонентом <RouteDisplay />, а не запікаються в PNG.
 *
 * Підтримуються два режими орієнтації:
 *  - "frames": лист містить N кадрів транспорту, знятих під різними кутами
 *    (типово для боковракурсних спрайтів трамвая/тролейбуса/автобуса).
 *    Компонент сам вибирає найближчий кадр за напрямком руху, без CSS-повороту.
 *  - "continuous": лист містить один кадр (вигляд згори), який плавно
 *    обертається через CSS transform: rotate() відповідно до курсу.
 */
export type SpriteRotationMode = 'frames' | 'continuous';

export interface SpriteSheetConfig {
  kind: TransportKind;
  /** Шлях до PNG відносно /public, напр. "/sprites/tram.png". */
  src: string;
  /** Розмір одного кадру в пікселях у вихідному файлі. */
  frameWidth: number;
  frameHeight: number;
  /** Кількість кадрів у рядку листа. */
  columns: number;
  /** Скільки напрямкових кадрів усього (ігнорується для continuous, там завжди 1). */
  directions: number;
  rotationMode: SpriteRotationMode;
  /** Кут (градуси, 0=північ) на який "дивиться" перший кадр (index=0) або єдиний кадр continuous-режиму. */
  baseHeadingDeg: number;
  /** Розмір відображення на карті при zoom=15, CSS px по довшій стороні кадру. */
  displaySize: number;
  /** Точка прив'язки в частках кадру (0..1), де 0.5/0.5 = центр. */
  anchor: { x: number; y: number };
}

export const DEFAULT_SPRITE_ANCHOR = { x: 0.5, y: 0.5 };
