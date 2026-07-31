import { useEffect, useMemo, useState } from 'react';
import { localRoutes, localStops } from '@/data/localData';
import { MetroRenderer } from '@/metro/MetroRenderer';
import { MetroSimulationEngine } from '@/metro/MetroSimulationEngine';
import type { MetroRenderFrame } from '@/metro/MetroRenderer';

/**
 * React-хук над MetroSimulationEngine + MetroRenderer.
 *
 * - Рушій (MetroSimulationEngine) будується ОДИН РАЗ (useMemo) з локальних
 *   даних localData.ts (routeGeometries.json) — жодних мережевих запитів.
 * - Рендерер (MetroRenderer) керує власним requestAnimationFrame-циклом і
 *   на кожному кадрі перераховує точні позиції потягів аналітично (без
 *   GPS, без випадковості) — хук лише підписується на готові кадри й
 *   кладе їх у React-стан.
 * - Цикл анімації живий, лише поки є хоча б один підписник (компонент
 *   змонтований) — MetroRenderer.subscribe/unsubscribe самостійно
 *   запускає/зупиняє rAF.
 *
 * Повертає готовий до рендеру масив кадрів (MetroRenderFrame[]) —
 * <MetroLayer /> лише проєктує їх на екран, нічого не обчислюючи заново.
 */
export function useMetroSimulation(): MetroRenderFrame[] {
  const engine = useMemo(
    () =>
      new MetroSimulationEngine({
        routes: localRoutes.all(),
        stationLookup: (stopId) => localStops.getById(stopId)
      }),
    []
  );

  const renderer = useMemo(() => new MetroRenderer(engine), [engine]);

  const [frames, setFrames] = useState<MetroRenderFrame[]>(() => renderer.getLastFrames());

  useEffect(() => {
    const unsubscribe = renderer.subscribe(setFrames);
    return unsubscribe;
  }, [renderer]);

  return frames;
}
