import { useEffect } from 'react';
import { useGeolocationStore } from '@/store/useGeolocationStore';

export function useGeolocation() {
  const store = useGeolocationStore();

  useEffect(() => {
    store.ensureWatching();
  }, [store]);

  return {
    ...store,
    loading: store.isLocating && !store.hasFix,
    latitude: store.position?.lat ?? null,
    longitude: store.position?.lng ?? null,
    speed: store.speedMps,
    altitude: null,
    altitudeAccuracy: null,
    timestamp: null,
  };
}
