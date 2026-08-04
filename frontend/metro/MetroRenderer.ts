import { clamp01 } from '@/metro/geometry';
import { MetroSimulationEngine } from '@/metro/MetroSimulationEngine';
import type { MetroTrainSnapshot } from '@/metro/types';

/** Готовий до рендеру кадр одного потяга — знімок симуляції + візуальні параметри (opacity/scale), якими опікується саме рендерер, а не движок. */
export interface MetroRenderFrame {
  snapshot: MetroTrainSnapshot;
  /** 0..1 — плавна поява/зникнення потяга на межах його рейсу (перші/останні секунди), щоб він не "телепортувався" різко. */
  opacity: number;
}

export type MetroFrameListener = (frames: MetroRenderFrame[]) => void;

/** Тривалість плавної появи/зникнення потяга на межах рейсу, секунд. Суто візуальний ефект рендерера — не впливає на кінематику з MetroRoute. */
const FADE_DURATION_SEC = 2.5;

/**
 * MetroRenderer відповідає за "живий" цикл оновлення: щокадру (через
 * requestAnimationFrame) бере ПОТОЧНИЙ реальний час (Date), просить у
 * MetroSimulationEngine точний аналітичний знімок усіх потягів на цю мить,
 * і сповіщає підписників (React-хук useMetroSimulation) готовим масивом
 * кадрів для рендеру.
 *
 * Через те, що MetroSimulationEngine — чиста аналітична функція часу
 * (не накопичує стан між викликами), рух виходить абсолютно плавним на
 * будь-якій частоті кадрів без додаткової lerp-інтерполяції між "тіками" —
 * достатньо просто рахувати позицію в кожному кадрі на актуальний момент.
 */
export class MetroRenderer {
  private readonly engine: MetroSimulationEngine;
  private rafHandle: number | null = null;
  private listeners: Set<MetroFrameListener> = new Set();
  private lastFrames: MetroRenderFrame[] = [];

  constructor(engine: MetroSimulationEngine) {
    this.engine = engine;
  }

  subscribe(listener: MetroFrameListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    listener(this.lastFrames);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  getLastFrames(): MetroRenderFrame[] {
    return this.lastFrames;
  }

  private start() {
    if (this.rafHandle !== null) return;
    const loop = () => {
      this.tick();
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private stop() {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private tick() {
    const now = new Date();
    const snapshots = this.engine.getSnapshotAt(now);
    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;

    this.lastFrames = snapshots.map((snapshot) => ({
      snapshot,
      opacity: computeFadeOpacity(snapshot, nowSec)
    }));

    for (const listener of this.listeners) listener(this.lastFrames);
  }
}

/** Плавна поява одразу після відправлення та зникнення перед кінцем стоянки на кінцевій станції. */
function computeFadeOpacity(snapshot: MetroTrainSnapshot, nowSec: number): number {
  const elapsedSinceDeparture = nowSec - snapshot.departureAtSec;
  const fadeIn = clamp01(elapsedSinceDeparture / FADE_DURATION_SEC);

  const elapsedSinceTerminus = nowSec - snapshot.etaTerminusSec;
  // Поки потяг ще в русі (до прибуття на кінцеву) — fadeOut завжди 1 (без затухання).
  const fadeOut = elapsedSinceTerminus <= 0 ? 1 : 1 - clamp01(elapsedSinceTerminus / FADE_DURATION_SEC);

  return Math.min(fadeIn, fadeOut);
}
