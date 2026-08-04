import type { SpriteSheetConfig } from '@/types/sprite';

/** Обирає індекс найближчого напрямкового кадру для заданого курсу (градуси, 0=північ). */
export function pickFrameIndex(headingDeg: number, config: SpriteSheetConfig): number {
  if (config.rotationMode === 'continuous' || config.directions <= 1) return 0;
  const relative = ((headingDeg - config.baseHeadingDeg) % 360 + 360) % 360;
  const bucketSize = 360 / config.directions;
  return Math.round(relative / bucketSize) % config.directions;
}

export interface SpriteCssGeometry {
  /** Розмір видимого блоку на екрані (CSS px). */
  displayWidth: number;
  displayHeight: number;
  backgroundSize: string;
  backgroundPosition: string;
  /** Кут CSS-повороту для continuous-режиму (0 для frames-режиму, бо кут уже "запечений" у кадрі). */
  cssRotationDeg: number;
}

export function computeSpriteGeometry(config: SpriteSheetConfig, frameIndex: number, headingDeg: number): SpriteCssGeometry {
  const rows = Math.max(1, Math.ceil(config.directions / config.columns));
  const aspect = config.frameHeight / config.frameWidth;
  const displayWidth = config.displaySize;
  const displayHeight = Math.round(config.displaySize * aspect);

  const scale = displayWidth / config.frameWidth;
  const sheetWidth = config.frameWidth * config.columns * scale;
  const sheetHeight = config.frameHeight * rows * scale;

  const col = frameIndex % config.columns;
  const row = Math.floor(frameIndex / config.columns);
  const offsetX = -(col * config.frameWidth * scale);
  const offsetY = -(row * config.frameHeight * scale);

  const cssRotationDeg = config.rotationMode === 'continuous' ? headingDeg - config.baseHeadingDeg : 0;

  return {
    displayWidth,
    displayHeight,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
    cssRotationDeg
  };
}
