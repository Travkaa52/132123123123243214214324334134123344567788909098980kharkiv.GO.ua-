# Kharkiv GO — Supabase-бекенд (Edge Functions)

Читайте також **`SECURITY_NOTICE.md`** у корені репозиторію — там знайдено
й видалено файл з відкритим `service_role` ключем.

## Що тут є

- `schema.sql` — наявні `route_alerts` / `delay_reports` (без змін).
- `migrations/0002_user_backend.sql` — нові таблиці: `profiles`, `favorites`,
  `history`, `notification_reads`, `rate_limits` + RPC `rate_limit_hit`,
  `trim_history`.
- `functions/` — Edge Functions (Deno):
  - `profile` — `GET` перевіряє Telegram initData, upsert профілю.
  - `favorites` — `GET/POST/DELETE`.
  - `history` — `GET/POST/DELETE`, автообрізка до 50 записів.
  - `notifications` — `GET` активні `route_alerts` (+ read-стан),
    `POST /notifications/read`.
  - `_shared/` — CORS, HTTP-хелпери й валідація, перевірка Telegram initData
    (HMAC-SHA256), Supabase-клієнт на `service_role`, rate-limit.

## Модель авторизації

Немає окремих сесій/JWT. Кожен запит фронтенда несе заголовок
`X-Telegram-Init-Data` (те, що Telegram Mini App SDK видає в
`window.Telegram.WebApp.initData`) — кожна функція сама перевіряє HMAC-підпис
цього рядка секретом бота (`BOT_TOKEN`) і дістає `user.id` як ідентифікатор.
Це узгоджено з тим, як вже влаштований `frontend/src/api/client.ts`.

Усі функції ходять у Postgres через `service_role` (як і `bot/supabase_sync.py`
раніше) — RLS на нових таблицях увімкнено, але без public-policy: доступ
контролюється кодом функції (фільтр `.eq('user_id', user.id)`), а не Postgres.

## Деплой

```bash
supabase login
supabase link --project-ref <project-ref>

# Застосувати нову міграцію (schema.sql уже мав бути виконаний раніше)
supabase db push

# Secrets для Edge Functions (НІКОЛИ не в .env фронтенда, не в git)
supabase secrets set BOT_TOKEN=xxxxx
supabase secrets set ALLOWED_ORIGIN=https://<your-user>.github.io
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY зазвичай проставлені автоматично
# для функцій у зв'язаному проєкті; якщо ні — задайте їх так само:
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxxxx

supabase functions deploy profile
supabase functions deploy favorites
supabase functions deploy history
supabase functions deploy notifications
```

У фронтенді (`.env` / GitHub Pages build secrets):

```
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1
```

## Захист від зловживань

- **Валідація**: `_shared/http.ts` — ручні перевірки типу/довжини/enum на
  вхід (без зовнішніх залежностей типу zod).
- **Rate limiting**: fixed-window лічильник у Postgres (`rate_limit_hit`) —
  спільний для всіх інстансів функції, на відміну від in-memory-мапи, яка
  скидалась би на кожен холодний старт. Ліміти: 30–60 запитів/хв на
  користувача залежно від функції, 30/хв на IP для анонімного перегляду
  `/notifications`.
- **Кешування**: `GET /notifications` — `Cache-Control: public, max-age=20,
  stale-while-revalidate=40` (дані й так короткоживучі — route_alerts).
  `GET /favorites`, `GET /history` — `private, max-age=15` (персональні,
  але дешево кешуються на клієнті між сусідніми рендерами).
- **Обробка помилок**: усі функції повертають структурований
  `{ error, message }` з правильним HTTP-статусом (`ApiError` у
  `_shared/http.ts`), ніколи не «протікають» сирі помилки БД клієнту.
- **CORS**: обмежений `ALLOWED_ORIGIN`, а не `*`.

## Що свідомо НЕ зроблено

- **Push-підписки** лишаються у Firestore (`pushSubscriptions/{uid}`,
  `frontend/src/lib/pushSubscription.ts`, `bot/fcm_notify.py`) — дублювати
  їх у Supabase означало б два джерела правди для одного й того самого без
  потреби.
- **Транспортні дані** (зупинки/маршрути/геометрія) лишаються локальними
  (`frontend/src/data/`, офлайн-first) — Edge Function для них не додана,
  бо змінювати цю частину архітектури явно не просили, а й сенсу немає:
  дані статичні й уже вбудовані у білд.
- Немає окремого `auth`/`login` ендпоінту — `GET /profile` і є "логіном"
  (verify + upsert за один виклик).
