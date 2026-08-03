import { useCallback, useRef, type PointerEvent, type RefObject } from 'react';

interface UseDragToCloseOptions {
  /** Викликається, коли жест перевищив поріг закриття (дистанція або швидкість). */
  onDismiss: () => void;
  /** Мінімальна дистанція перетягування (px), після якої картка закривається. */
  threshold?: number;
  /** Мінімальна швидкість жесту (px/мс) — швидкий змах закриває картку навіть на короткій дистанції. */
  velocityThreshold?: number;
}

/**
 * Плавний drag-to-close без "смикань": рух пальця пишеться в буфер і
 * застосовується до DOM рівно раз на кадр через requestAnimationFrame
 * (замість синхронного style-запису на кожен pointermove, який на слабких
 * пристроях спричиняв просідання FPS і ривки). При відпусканні:
 *  - якщо жест недостатній — картка "доїжджає" назад тим самим transform,
 *    з якого стартувала (без стрибка в 0 і повторної анімації);
 *  - якщо достатній — анімація закриття продовжується ПРЯМО з поточної
 *    позиції пальця (а не обнуляється й запускається заново), тому переходу
 *    з drag у закриття візуально непомітний.
 * Враховує швидкість жесту (fling): різкий короткий змах закриває картку,
 * навіть якщо не пройдено повну дистанцію threshold.
 */
export function useDragToClose(
  ref: RefObject<HTMLElement>,
  { onDismiss, threshold = 80, velocityThreshold = 0.6 }: UseDragToCloseOptions
) {
  const drag = useRef({
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    dy: 0,
    dragging: false,
    rafId: null as number | null,
  });

  const flushTransform = useCallback(() => {
    const el = ref.current;
    const d = drag.current;
    d.rafId = null;
    if (!el) return;
    el.style.transform = `translate3d(0, ${d.dy}px, 0)`;
  }, [ref]);

  const scheduleFlush = useCallback(() => {
    const d = drag.current;
    if (d.rafId != null) return;
    d.rafId = requestAnimationFrame(flushTransform);
  }, [flushTransform]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const el = ref.current;
      drag.current = {
        startY: e.clientY,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
        dy: 0,
        dragging: true,
        rafId: null,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (el) {
        // Прибираємо CSS-transition на час активного drag — реальний рух
        // пальця має йти напряму, без "запізнення" через easing-криву,
        // саме це і сприймається як смикання під час свайпу.
        el.style.transition = 'none';
        el.style.willChange = 'transform';
      }
    },
    [ref]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d.dragging) return;
      const now = performance.now();
      const dt = now - d.lastT;
      // Легкий rubber-band на рух вгору — картка не "прилипає" миттєво до 0,
      // а трохи пружинить, що відчувається природніше за жорсткий clamp.
      const rawDy = e.clientY - d.startY;
      d.dy = rawDy > 0 ? rawDy : rawDy / 3;
      if (dt > 0) {
        d.velocity = (e.clientY - d.lastY) / dt;
      }
      d.lastY = e.clientY;
      d.lastT = now;
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const endDrag = useCallback(() => {
    const d = drag.current;
    if (!d.dragging) return;
    d.dragging = false;
    if (d.rafId != null) {
      cancelAnimationFrame(d.rafId);
      d.rafId = null;
    }
    const el = ref.current;
    const shouldClose = d.dy > threshold || (d.dy > 24 && d.velocity > velocityThreshold);

    if (el) {
      el.style.willChange = '';
      // Єдина плавна крива для обох сценаріїв — узгоджена з тривалістю
      // closeAnimated (220ms), щоб drag і programmatic-закриття виглядали
      // однаково плавними, без візуального "зашморгу" між ними.
      el.style.transition = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)';
      if (shouldClose) {
        const height = el.getBoundingClientRect().height || window.innerHeight;
        el.style.transform = `translate3d(0, ${Math.max(d.dy, height)}px, 0)`;
        onDismiss();
      } else {
        el.style.transform = 'translate3d(0, 0, 0)';
      }
    } else if (shouldClose) {
      onDismiss();
    }
  }, [onDismiss, ref, threshold, velocityThreshold]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}
