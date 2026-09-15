import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/lib/assetUrl';

/**
 * СКЛАДИ ПОЇЗДІВ
 * ---------------------------------------------------------------------
 * Кожен елемент — окрема готова картинка цілого складу (як твій
 * sostavbazhan.png), з власним порожнім полотном транспаранту в кінці.
 * На кожен прогін випадково береться один зі складів.
 *
 * naturalWidth / naturalHeight — реальні пікселі файлу (потрібні, щоб
 * порахувати аспект і не спотворити картинку).
 *
 * bannerRect — координати порожнього полотна ВСЕРЕДИНІ конкретного
 * файлу, у відсотках від його ширини/висоти. Заміряй скриптом:
 *
 *   from PIL import Image
 *   import numpy as np
 *   from scipy import ndimage
 *   im = Image.open('train-N.png').convert('RGBA')
 *   w, h = im.size
 *   arr = np.array(im)
 *   r, g, b, a = arr[...,0], arr[...,1], arr[...,2], arr[...,3]
 *   mask = (a > 200) & (r > 235) & (g > 235) & (b > 235)
 *   labeled, n = ndimage.label(mask)
 *   sizes = ndimage.sum(mask, labeled, range(1, n + 1))
 *   biggest = np.argmax(sizes) + 1
 *   ys, xs = np.where(labeled == biggest)
 *   print('left%', xs.min()/w*100, 'width%', (xs.max()-xs.min())/w*100)
 *   print('top%', ys.min()/h*100, 'height%', (ys.max()-ys.min())/h*100)
 *
 * Щоб додати новий склад — просто додай новий об'єкт у масив TRAINS,
 * покласти файл у public/images/train/, більше нічого міняти не треба.
 */
interface TrainDef {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  bannerRect: { left: number; width: number; top: number; height: number };
}

const TRAINS: TrainDef[] = [
  {
    src: assetUrl('/images/train/train-1.png'),
    naturalWidth: 2172,
    naturalHeight: 724,
    bannerRect: { left: 81.95, width: 16.11, top: 42.68, height: 15.47 }
  }
  // Додавай наступні готові склади сюди, наприклад:
  // {
  //   src: assetUrl('/images/train/train-2.png'),
  //   naturalWidth: ...,
  //   naturalHeight: ...,
  //   bannerRect: { left: 81.95, width: 16.11, top: 42.68, height: 15.47 }
  // }
];

const WISHES: string[] = [
  'Гарного дня, Харків! 🌤️',
  'Хай усі поїздки будуть вчасними',
  'Мирного неба над головою 🕊️',
  'Легкої дороги і без заторів',
  'Успіху у всіх твоїх справах сьогодні',
  'Хай сьогодні щастить у всьому',
  'Теплого настрою в будь-яку погоду',
  'Нехай день буде добрим і спокійним',
  'До зустрічі на своїй зупинці 🚏',
  'Гарного тобі маршруту сьогодні',
  'Дякуємо, що їдеш з Kharkiv GO',
  'Хай транспорт завжди приходить вчасно',
  'Бережи себе в дорозі',
  'Усмішок тобі більше, ніж пересадок',
  'Нехай усе складеться якнайкраще',
  'Хорошого настрою на весь день',
  'Місто тримається — і ти тримайся',
  'Швидкої та безпечної дороги додому',
  'Нехай сьогодні щастить на зелене світло',
  'Тепла і затишку у твоєму дні',
  'Хай кожна поїздка буде приємною',
  'Слава Україні! Гарної дороги 🇺🇦',
  'Віримо, чекаємо, їдемо далі разом',
  'Нехай день буде продуктивним і легким'
];

const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 години
const MAX_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 години
const FIRST_RUN_DELAY_MS = 3000; // невелика пауза після завантаження сторінки
const ANIMATION_DURATION_MS = 13000; // час проїзду через екран
const SPRITE_HEIGHT_PX = 112; // висота складу на екрані
const STORAGE_KEY = 'kharkivgo_train_wish_last_shown_at';

function randomInterval(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

function pickWish(): string {
  return WISHES[Math.floor(Math.random() * WISHES.length)];
}

function pickTrain(): TrainDef {
  return TRAINS[Math.floor(Math.random() * TRAINS.length)];
}

function readLastShown(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

function writeLastShown(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // localStorage недоступний (приватний режим тощо) — ігноруємо
  }
}

/**
 * Потяг, що зрідка (раз на 2–3 години) проїжджає через головний екран
 * одразу після заходу. Кожен прогін — випадковий склад із TRAINS і нове
 * побажання на транспаранті. Без рамок і обрізань: картинка вільно
 * рухається поверх сторінки.
 */
export function TrainWishSprite() {
  const [visible, setVisible] = useState(false);
  const [wish, setWish] = useState('');
  const [train, setTrain] = useState<TrainDef | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scheduleTimeoutRef = useRef<number | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const scheduleNextRun = useCallback((delayMs: number) => {
    if (scheduleTimeoutRef.current) window.clearTimeout(scheduleTimeoutRef.current);
    scheduleTimeoutRef.current = window.setTimeout(runTrain, delayMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTrain = useCallback(() => {
    // Ширина батьківського елемента (рядка пошуку) — потяг біжить рівно
    // по його ширині, а не по всьому екрану.
    const parentWidth = wrapperRef.current?.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    setContainerWidth(parentWidth);
    setWish(pickWish());
    setTrain(pickTrain());
    setVisible(true);
    writeLastShown(Date.now());

    if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setVisible(false), ANIMATION_DURATION_MS);

    scheduleNextRun(randomInterval());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleNextRun]);

  useEffect(() => {
    const lastShown = readLastShown();
    const elapsed = Date.now() - lastShown;
    const interval = randomInterval();

    if (!lastShown || elapsed >= interval) {
      scheduleNextRun(FIRST_RUN_DELAY_MS);
    } else {
      scheduleNextRun(interval - elapsed);
    }

    return () => {
      if (scheduleTimeoutRef.current) window.clearTimeout(scheduleTimeoutRef.current);
      if (hideTimeoutRef.current) window.clearTimeout(hideTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || !train || containerWidth === 0) {
    // Порожній якір потрібен завжди — від нього runTrain() вимірює ширину
    // батьківського рядка пошуку (навіть коли потяг зараз не їде).
    return <div ref={wrapperRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />;
  }

  const aspectRatio = train.naturalWidth / train.naturalHeight;
  const trainWidthPx = SPRITE_HEIGHT_PX * aspectRatio;

  // Потяг рухається строго в межах ширини рядка пошуку: старт — повністю
  // за правим краєм (containerWidth), фініш — повністю за лівим
  // (-trainWidthPx). Плавна поява протягом перших ~10% шляху (щойно
  // з'явився з правого краю) і плавне зникнення в останні ~15% (під'їжджає
  // до лівого краю рядка).
  const startX = containerWidth;
  const endX = -trainWidthPx;
  const distance = startX - endX;
  const fadeInX = startX - distance * 0.1;
  const fadeOutX = startX - distance * 0.85;

  return (
    <div ref={wrapperRef} className="absolute inset-0 overflow-visible pointer-events-none z-30" aria-hidden="true">
      <style>{`
        @keyframes train-wish-move {
          0% { transform: translateX(${startX}px); opacity: 0; }
          10% { transform: translateX(${fadeInX}px); opacity: 1; }
          85% { transform: translateX(${fadeOutX}px); opacity: 1; }
          100% { transform: translateX(${endX}px); opacity: 0; }
        }
        .train-wish-track {
          animation: train-wish-move ${ANIMATION_DURATION_MS}ms linear forwards;
        }
      `}</style>

      <div
        className="absolute train-wish-track"
        style={{
          top: '50%',
          marginTop: -SPRITE_HEIGHT_PX / 2,
          height: SPRITE_HEIGHT_PX,
          width: trainWidthPx
        }}
      >
        <div className="relative h-full w-full">
          <img src={train.src} alt="" draggable={false} className="block h-full w-full select-none" />
          <div
            className="absolute flex items-center justify-center text-center px-1"
            style={{
              left: `${train.bannerRect.left}%`,
              width: `${train.bannerRect.width}%`,
              top: `${train.bannerRect.top}%`,
              height: `${train.bannerRect.height}%`
            }}
          >
            <span className="text-[7px] font-extrabold text-slate-800 leading-[1.15] line-clamp-3">
              {wish}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
