import { useEffect, useState } from 'react';

type LoadState = 'loading' | 'loaded' | 'error';

const cache = new Map<string, LoadState>();
const listeners = new Map<string, Set<(state: LoadState) => void>>();

function setState(src: string, state: LoadState) {
  cache.set(src, state);
  listeners.get(src)?.forEach((cb) => cb(state));
}

function ensurePreload(src: string) {
  if (cache.has(src)) return;
  cache.set(src, 'loading');
  const img = new Image();
  img.onload = () => setState(src, 'loaded');
  img.onerror = () => setState(src, 'error');
  img.src = src;
}

/**
 * Перевіряє доступність PNG Sprite Sheet без блокування рендеру карти.
 * Поки файл не додано власником проєкту в /public/sprites — повертає
 * 'error', і <TransportSprite /> малює геометричний фолбек замість <img>.
 */
export function useSpriteImage(src: string): LoadState {
  const [state, setLocalState] = useState<LoadState>(() => cache.get(src) ?? 'loading');

  useEffect(() => {
    ensurePreload(src);
    setLocalState(cache.get(src) ?? 'loading');

    const cb = (s: LoadState) => setLocalState(s);
    if (!listeners.has(src)) listeners.set(src, new Set());
    listeners.get(src)!.add(cb);

    return () => {
      listeners.get(src)?.delete(cb);
    };
  }, [src]);

  return state;
}
