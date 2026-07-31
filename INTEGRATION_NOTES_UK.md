# Бот підтримки + оголошення про затримки — єдина екосистема

Застосунок живе на **GitHub Pages** (тільки статичні файли, POST-запити не
приймає). Уся логіка бота зведена в одну узгоджену схему:

## Компоненти (де що лежить)

| Компонент | Шлях | Навіщо |
|---|---|---|
| Frontend (Vite/React) | `frontend/` | сам застосунок, деплоїться `deploy.yml` |
| Deep-link кнопки | `frontend/src/lib/reportDelay.ts`, `frontend/src/lib/support.ts` | відкривають чат з ботом у Telegram із заповненим текстом |
| Обробка апдейтів (безкоштовно, за розкладом) | `frontend/scripts/process-telegram-bot.mjs` + `.github/workflows/telegram-bot.yml` | раз на ~5 хв забирає нові повідомлення, шле адміну, рахує скарги, публікує оголошення |
| Обробка апдейтів (опційно, миттєво) | `bot/telegram_bot.py` | те саме, але постійним процесом на своєму сервері/VPS — див. `bot/README.md` |
| Публічні дані оголошень | `frontend/public/data/route-alerts.json` | читає фронтенд (`frontend/src/lib/routeAlerts.ts`), банер + бейдж у списку маршрутів |
| Технічний стан бота (не публічний) | `frontend/data-runtime/*.json` | offset для getUpdates, сирі скарги, мапа "повідомлення адміну → user id" |
| Стрічка новин каналів | `frontend/public/data/notifications.json` + `frontend/scripts/parse-telegram-channels.mjs` + `.github/workflows/telegram-notifications.yml` | окрема, вже існуюча функція — не чіпали, той самий підхід |

**Використовуйте АБО GitHub Actions (`telegram-bot.yml`), АБО Python-бота
(`bot/telegram_bot.py`) — не обов'язково обидва.** Конфлікту не буде (обидва
безпечно working з тим самим `offset`), але тримати обидва одночасно
зазвичай без сенсу. За замовчуванням увімкнено варіант з Actions (без
серверів, безкоштовно).

## Як це працює (потік даних)

1. Кнопки "Повідомити про затримку" / "Зв'язок з підтримкою" в застосунку
   **нічого не відправляють на сервер** — вони відкривають чат з ботом у
   Telegram (`t.me/<bot>?text=...`) із заздалегідь заповненим текстом.
   Користувач сам тисне "Надіслати" в самому Telegram.
2. Обробник (Actions або Python-бот) забирає нове повідомлення через
   `getUpdates`, пересилає його адміну (`ADMIN_CHAT_IDS`) в особисті.
3. Адмін відповідає звичайним **Reply** прямо в Telegram — обробник
   пересилає цю відповідь користувачу в приват. Ніякого окремого екрану
   "історія листування" в застосунку немає — усе відбувається нативно в
   Telegram-чаті з ботом (і це свідомо: немає бекенду, який міг би
   безпечно віддавати приватне листування конкретного користувача через
   статичний файл).
4. Скарги на затримку рахуються: якщо на **один маршрут** поскаржилось
   **≥5** різних користувачів за годину (`DELAY_REPORT_THRESHOLD` /
   `DELAY_REPORT_WINDOW_MINUTES`) — адміну приходить кнопка "Так,
   оголосити затримку". Після підтвердження (або команди
   `/alert 27 bus текст`) — запис потрапляє в
   `frontend/public/data/route-alerts.json` на 2 години
   (`DELAY_ALERT_DURATION_HOURS`) і комітиться в репозиторій.
5. GitHub Pages роздає цей JSON як звичайний статичний файл — фронтенд
   (`useRouteAlertsStore` + `RouteAlertBanner`) підтягує його раз на
   хвилину і показує банер/бейдж.

## Що виправлено в цій версії (якщо порівнюєте зі старою)

- **Головний баг:** `scripts/process-telegram-bot.mjs` і `data-runtime/`
  раніше лежали в КОРЕНІ репозиторію (окремо від `frontend/`) і писали
  `src/public/data/route-alerts.json` — шлях, який ніколи не потрапляв у
  зібраний сайт (Vite бере статику з `frontend/public/`, а не
  `frontend/src/public/`, і тим паче не з кореня репо). Тобто оголошення
  ніколи фізично не існувало там, де його читає фронтенд. Перенесено в
  `frontend/scripts/` і виправлено шлях на `frontend/public/data/route-alerts.json`.
- **Баг з базовим шляхом GitHub Pages:** `routeAlerts.ts` і `notifications.ts`
  фетчили абсолютний `/data/....json` — на проєктному сайті виду
  `<user>.github.io/<repo>/` це давало 404 (сайт живе не в корені домену).
  Перевели на вже наявний у проєкті хелпер `assetUrl()`
  (`frontend/src/lib/assetUrl.ts`), який враховує base path.
- Прибрано мертві дублікати в корені репозиторію (`App.tsx`, `main.tsx`,
  `index.css`, `data/`, `icons/`, старі `scripts/`/`data-runtime/`/`src/`) —
  залишились не в тому місці після реорганізації в `frontend/`, ніде не
  використовувались, лише плутали.
- Прибрано `frontend/src/public/` (такий самий дублікат-пастка — Vite його
  не бачить, реальний `public/` лежить поруч, на рівень вище).
- Прибрано `VITE_TELEGRAM_BOT_TOKEN` / `VITE_TELEGRAM_ADMIN_CHAT_ID` з
  `deploy.yml` і `vite-env.d.ts` — ніде не використовувались, а токен
  боту через `VITE_`-префікс потрапив би у публічний клієнтський бандл
  (видимий будь-кому в DevTools) — небезпечний мертвий код.
- Додано `bot/telegram_bot.py` — Python-версія того самого протоколу для
  тих, хто хоче постійний процес замість cron раз на 5 хв.

## Що налаштувати (Settings → Secrets and variables → Actions)

**Secrets:**
- `BOT_TOKEN` — токен від [@BotFather](https://t.me/BotFather)
- `ADMIN_CHAT_IDS` — ваш chat_id (можна кілька через кому). Дізнатись:
  напишіть боту `/start` — після найближчого запуску workflow (або вручну
  через Actions → Run workflow) бот відповість і покаже ваш `chat_id`.

**Variables** (необов'язково, є значення за замовчуванням):
- `DELAY_REPORT_THRESHOLD` (5), `DELAY_REPORT_WINDOW_MINUTES` (60),
  `DELAY_ALERT_DURATION_HOURS` (2)
- `TELEGRAM_BOT_USERNAME` — потрібен для збірки фронтенду (deep links),
  `TELEGRAM_APP_NAME` — назва Mini App з BotFather

Перший запуск обробника можна зробити вручну: **Actions → Telegram Bot
(support + затримки) → Run workflow**.

## Обмеження (чесно)

- Якщо працює лише `telegram-bot.yml` (без `bot/telegram_bot.py`) —
  затримка кілька хвилин, а не миттєво (мінімальний практичний інтервал
  cron у GitHub Actions — ~5 хв).
- Історії листування в самому застосунку немає навмисно (див. пункт 3 вище).
