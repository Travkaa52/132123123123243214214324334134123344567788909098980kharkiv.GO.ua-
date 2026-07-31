import { useEffect, useRef, useState, useCallback } from 'react';
import { getActiveTrains, type LiveMetroTrain } from '@/liveMetro/liveMetroEngine';

export interface UseLiveMetroTrainsReturn {
  /** Активний список потягів для React UI (оновлюється раз на секунду) */
  trains: LiveMetroTrain[];
  /** Мутабельне посилання на актуальний список для rAF-петлі MapLibre / Canvas */
  trainsRef: React.RefObject<LiveMetroTrain[]>;
  /** Отримати миттєвий стан потягів без перерендеру React */
  getLatestTrains: () => LiveMetroTrain[];
}

/**
 * Хук підписки на стан потягів метро.
 * 
 * Відокремлює оновлення React-стану (для UI) від високочастотного розрахунку 
 * позицій (для 120 FPS анімацій на карті).
 */
export function useLiveMetroTrains(pollIntervalMs = 1000): UseLiveMetroTrainsReturn {
  const [trains, setTrains] = useState<LiveMetroTrain[]>(() => getActiveTrains(new Date()));
  const trainsRef = useRef<LiveMetroTrain[]>(trains);

  /**
   * Чистий розрахунок поточних координат без виклику setState.
   */
  const getLatestTrains = useCallback(() => {
    const latest = getActiveTrains(new Date());
    trainsRef.current = latest;
    return latest;
  }, []);

  useEffect(() => {
    // Початкова синхронізація
    getLatestTrains();

    // Оновлюємо React UI за розкладом (наприклад, щосекунди)
    const intervalId = window.setInterval(() => {
      const latest = getLatestTrains();
      setTrains(latest);
    }, pollIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [pollIntervalMs, getLatestTrains]);

  return {
    trains,
    trainsRef,
    getLatestTrains,
  };
}
