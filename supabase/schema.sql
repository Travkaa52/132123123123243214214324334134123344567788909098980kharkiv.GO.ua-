-- ============================================================================
-- Kharkiv GO — схема Supabase для затримок транспорту
-- ============================================================================
-- Виконати один раз у SQL Editor вашого проєкту Supabase
-- (https://supabase.com/dashboard/project/_/sql/new).
--
-- Дві таблиці:
--   route_alerts  — публічні активні оголошення про затримку. Саме їх читає
--                   застосунок (анонімний ключ, лише SELECT).
--   delay_reports — сирі скарги користувачів з Telegram-бота (лог подій,
--                   пише лише бот через service_role, публічно недоступні).
--
-- Бот (Python-версія і GitHub Actions-версія) пише в обидві таблиці за
-- допомогою SUPABASE_SERVICE_KEY (service_role) — цей ключ обходить RLS,
-- тож нижченаведені policy стосуються лише анонімного/публічного доступу
-- з фронтенду.
-- ============================================================================

create table if not exists public.route_alerts (
  id           bigint primary key,          -- unix ms, генерується ботом
  kind         text,                        -- bus / tram / trolleybus / metro / null (будь-який)
  route_number text not null,                -- номер маршруту або "all"
  message      text not null,
  created_at   double precision not null,   -- unix seconds
  expires_at   double precision not null,   -- unix seconds
  source       text not null default 'manual' -- 'manual' | 'auto'
);

create index if not exists route_alerts_expires_at_idx on public.route_alerts (expires_at);

create table if not exists public.delay_reports (
  id           bigserial primary key,
  user_id      bigint,
  username     text,
  kind         text,
  route_number text not null,
  comment      text,
  created_at   double precision not null    -- unix seconds
);

create index if not exists delay_reports_created_at_idx on public.delay_reports (created_at);
create index if not exists delay_reports_route_idx on public.delay_reports (route_number, kind);

-- --- Row Level Security -------------------------------------------------

alter table public.route_alerts  enable row level security;
alter table public.delay_reports enable row level security;

-- Застосунок (анонімний ключ) може лише читати активні оголошення.
-- Ніяких policy на insert/update/delete для anon/authenticated немає —
-- писати може тільки service_role (бот), який RLS не стосується.
drop policy if exists "Public read active route alerts" on public.route_alerts;
create policy "Public read active route alerts"
  on public.route_alerts
  for select
  to anon, authenticated
  using (true);

-- delay_reports — повністю приватна таблиця, жодних public policy.
-- (RLS увімкнено без жодної policy для anon/authenticated = доступу немає.)
