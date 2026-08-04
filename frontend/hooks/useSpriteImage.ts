import { useEffect, useState } from 'react';
import { assetUrl } from '@/lib/assetUrl';

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
 *
 * `src` приймається як шлях відносно /public (напр. "/sprites/metro.jpg")
 * і завжди пропускається через assetUrl() тут-таки — щоб на GitHub Pages
 * (де застосунок живе не в корені домену, а за /<repo-name>/) не довелось
 * пам'ятати про це в кожному місці, що викликає useSpriteImage.
 */
export function useSpriteImage(src: string): LoadState {
  const resolvedSrc = assetUrl(src);
  const [state, setLocalState] = useState<LoadState>(() => cache.get(resolvedSrc) ?? 'loading');

  useEffect(() => {
    ensurePreload(resolvedSrc);
    setLocalState(cache.get(resolvedSrc) ?? 'loading');

    const cb = (s: LoadState) => setLocalState(s);
    if (!listeners.has(resolvedSrc)) listeners.set(resolvedSrc, new Set());
    listeners.get(resolvedSrc)!.add(cb);

    return () => {
      listeners.get(resolvedSrc)?.delete(cb);
    };
  }, [resolvedSrc]);

  return state;
}

/** Повертає той самий резолвлений URL, який useSpriteImage вантажить і кешує — щоб <img src> / backgroundImage завжди збігались з перевіреним шляхом. */
export function resolveSpriteSrc(src: string): string {
  return assetUrl(src);
}
