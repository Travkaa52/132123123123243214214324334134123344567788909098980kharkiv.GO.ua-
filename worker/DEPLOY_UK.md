# Запуск KharkivGO на Cloudflare Worker

Структура: цей `worker/` кладеться поряд з існуючою папкою `frontend/`
(тобто в корені репозиторію має бути і `frontend/`, і `worker/`).

## 1. Зберіть фронтенд

```bash
cd frontend
npm install
npm run build   # створює frontend/dist
```

## 2. Встановіть залежності воркера

```bash
cd ../worker
npm install
```

## 3. Створіть KV namespace

```bash
npx wrangler kv namespace create KV
```

Команда виведе `id = "...."` — вставте це значення в `wrangler.jsonc`
замість `"REPLACE_ME"`.

## 4. Задайте секрети

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # вигадайте довгий випадковий рядок самі
npx wrangler secret put SUPABASE_URL              # напр. https://xxxx.supabase.co (без /rest/v1)
npx wrangler secret put SUPABASE_SERVICE_KEY      # service_role ключ, НЕ anon
```

## 5. Задеплойте

```bash
npx wrangler deploy
```

Wrangler виведе URL воркера, напр. `https://kharkiv-go.<ваш-акаунт>.workers.dev`
(або ваш кастомний домен, якщо підключили).

## 6. Підключіть Telegram webhook

Один раз виконайте (підставте свої значення):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<ваш-воркер>/webhook/telegram" \
  -d "secret_token=<той самий TELEGRAM_WEBHOOK_SECRET>"
```

Перевірити, що підключилось:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Якщо раніше бот працював через long-polling (GitHub Actions,
`.github/workflows/telegram-bot.yml`) — webhook і long-polling
одночасно НЕ працюють, Telegram дозволяє лише один спосіб отримання
апдейтів. Після `setWebhook` можна або вимкнути cron у тому workflow
(лишити тільки `workflow_dispatch` для адмінських дій вручну), або
розділити: адмінські команди приходять через окремого бота
(інший `BOT_TOKEN`), а цей — тільки для миттєвих скарг на затримку.

## Що робить воркер, а що ні

- **Обробляє миттєво** (той самий HTTP-запит від Telegram): кнопку
  "Повідомити про затримку" → вибір виду транспорту → номер маршруту →
  пише в `delay_reports` у Supabase → рахує поріг за вікно часу →
  за потреби одразу створює запис у `route_alerts`. Затримка від
  натискання кнопки до появи алерту в застосунку — секунди на бекенді
  плюс час до наступного опитування фронтенда (зараз кожні 60 с,
  див. `useRouteAlertsStore.ts`).
- **НЕ обробляє**: адмін-панель (створення довільних оголошень,
  розсилки, статистику) — це лишається на
  `frontend/scripts/process-telegram-bot.mjs` через GitHub Actions,
  бо та логіка завʼязана на файловий стан і не є критичною за часом.
