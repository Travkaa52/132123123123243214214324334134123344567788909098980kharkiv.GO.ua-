-- ============================================================================
-- Kharkiv GO — розширення схеми: користувачі, обране, історія, push, rate-limit
-- ============================================================================
-- Виконати після supabase/schema.sql (у SQL Editor або через `supabase db push`).
--
-- Принцип лишається той самий, що й у schema.sql: усі write-операції йдуть
-- через service_role (тепер — з Edge Functions замість/поряд з ботом), тому
-- RLS-политики нижче стосуються ЛИШЕ прямого анонімного доступу з фронтенду
-- (яким ми свідомо не користуємось для приватних даних — фронтенд ходить
-- у Edge Functions, а не напряму в PostgREST, для profiles/favorites/history).
--
-- Ідентифікація користувача — telegram_id (bigint), без окремого Supabase
-- Auth: initData від Telegram WebApp вже є достатнім і перевіряється на
-- кожен запит у Edge Function (HMAC), тримати ще один шар сесій/JWT немає
-- сенсу і додало б стан, якого зараз architecture свідомо уникає.
-- ============================================================================

-- --- profiles -------------------------------------------------------------

create table if not exists public.profiles (
  telegram_id   bigint primary key,
  username      text,
  first_name    text,
  last_name     text,
  photo_url     text,
  language_code text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
-- Жодних public policy: profiles читає/пише лише service_role з Edge Function
-- (яка сама звіряє, що telegram_id належить викликачу за initData).

-- --- favorites --------------------------------------------------------------

create table if not exists public.favorites (
  id           bigserial primary key,
  user_id      bigint not null references public.profiles(telegram_id) on delete cascade,
  kind         text not null check (kind in ('stop', 'route')),
  item_id      text not null,
  label        text,
  created_at   timestamptz not null default now(),
  unique (user_id, kind, item_id)
);

create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

-- --- history ------------------------------------------------------------

create table if not exists public.history (
  id           bigserial primary key,
  user_id      bigint not null references public.profiles(telegram_id) on delete cascade,
  kind         text not null check (kind in ('stop', 'route', 'trip')),
  item_id      text not null,
  label        text,
  created_at   timestamptz not null default now()
);

create index if not exists history_user_idx on public.history (user_id, created_at desc);

alter table public.history enable row level security;

-- Тримаємо історію компактною: не більше 50 записів на користувача.
-- Викликається з Edge Function після кожного insert (дешевше, ніж trigger
-- на кожен рядок при масовому імпорті, і простіше дебажити).
create or replace function public.trim_history(p_user_id bigint, p_keep int default 50)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.history
  where user_id = p_user_id
    and id not in (
      select id from public.history
      where user_id = p_user_id
      order by created_at desc
      limit p_keep
    );
$$;

-- Push-підписки НЕ дублюються тут: вони вже живуть у Firestore
-- (pushSubscriptions/{uid}, див. frontend/lib/pushSubscription.ts і
-- bot/fcm_notify.py) — заводити другий, паралельний, спосіб зберігання
-- FCM-токенів у Supabase було б зайвою зміною наявної архітектури.

-- --- notification_reads (особистий read-стан для публічної стрічки) --------

create table if not exists public.notification_reads (
  user_id         bigint not null references public.profiles(telegram_id) on delete cascade,
  notification_id text not null,
  read_at         timestamptz not null default now(),
  primary key (user_id, notification_id)
);

alter table public.notification_reads enable row level security;

-- --- rate_limits (спільний лічильник для Edge Functions) --------------------
-- Простий fixed-window лічильник у Postgres: дешевше і надійніше за окремий
-- KV/Redis для теперішнього навантаження, і не додає нової залежності/сервісу.

create table if not exists public.rate_limits (
  bucket_key    text primary key,
  window_start  timestamptz not null,
  request_count int not null default 0
);

-- Атомарний "increment-or-reset-window", щоб не було гонок між конкурентними
-- викликами Edge Function (кожен інстанс — окремий процес, без спільної пам'яті).
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds int,
  p_max_requests int
)
returns table (allowed boolean, remaining int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  insert into public.rate_limits (bucket_key, window_start, request_count)
  values (p_key, v_now, 1)
  on conflict (bucket_key) do update
    set request_count = case
          when public.rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
            then 1
          else public.rate_limits.request_count + 1
        end,
        window_start = case
          when public.rate_limits.window_start <= v_now - make_interval(secs => p_window_seconds)
            then v_now
          else public.rate_limits.window_start
        end
  returning * into v_row;

  return query select v_row.request_count <= p_max_requests, greatest(p_max_requests - v_row.request_count, 0);
end;
$$;

-- Періодичне прибирання старих бакетів (не обов'язково, але тримає таблицю
-- малою; можна викликати з pg_cron або просто ігнорувати — рядків мало).
create or replace function public.rate_limits_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
