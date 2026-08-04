import { useEffect, useMemo, useRef } from 'react';
import { useToastStore } from '@/store/useToastStore';
import {
  type ActiveTrip,
  type TripCheckpoint,
  buildTripCheckpoints,
  advanceTripProgress,
  isTripComplete,
  currentTripTarget,
  describeTarget,
  describeReached,
  saveActiveTrip
} from '@/lib/activeTrip';

interface Options {
  activeTrip: ActiveTrip | null;
  position: { lat: number; lng: number } | null;
  onUpdate: (trip: ActiveTrip) => void;
  onArrived: () => void;
}

export interface ActiveTripProgress {
  checkpoints: TripCheckpoint[];
  target: TripCheckpoint | null;
  instruction: string;
  progress: number;
}

/**
 * Живе стеження за поїздкою: на кожну зміну геопозиції перевіряє, чи
 * користувач наблизився до наступної точки маршруту (посадка/вихід/
 * пересадка/пункт призначення), просуває прогрес і показує тост-підказку
 * в момент проходження кожної точки. Коли пройдено все — повідомляє про
 * прибуття і завершує поїздку.
 */
export function useActiveTripProgress({ activeTrip, position, onUpdate, onArrived }: Options): ActiveTripProgress | null {
  const showToast = useToastStore((s) => s.show);
  const arrivedFiredRef = useRef(false);

  useEffect(() => {
    arrivedFiredRef.current = false;
  }, [activeTrip?.startedAt]);

  useEffect(() => {
    if (!activeTrip || !position) return;
    const checkpoints = buildTripCheckpoints(activeTrip.plan, activeTrip.toPoint);
    const { trip: updated, justReached } = advanceTripProgress(activeTrip, checkpoints, position);

    justReached.forEach((cp) => {
      const message = describeReached(activeTrip, cp);
      if (message) showToast(message, 'info');
    });

    if (updated !== activeTrip) {
      saveActiveTrip(updated);
      onUpdate(updated);
    }

    if (isTripComplete(updated, checkpoints) && !arrivedFiredRef.current) {
      arrivedFiredRef.current = true;
      showToast('Ви прибули до пункту призначення 🎉', 'success');
      saveActiveTrip(null);
      onArrived();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrip, position]);

  return useMemo(() => {
    if (!activeTrip) return null;
    const checkpoints = buildTripCheckpoints(activeTrip.plan, activeTrip.toPoint);
    const target = currentTripTarget(activeTrip, checkpoints);
    return {
      checkpoints,
      target,
      instruction: target ? describeTarget(activeTrip, target) : 'Ви прибули',
      progress: checkpoints.length > 0 ? Math.min(1, activeTrip.nextCheckpointIndex / checkpoints.length) : 0
    };
  }, [activeTrip]);
}
