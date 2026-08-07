-- Выполните этот файл в Supabase: SQL Editor -> New query -> вставить -> Run

create table if not exists users (
  id bigint primary key,                 -- telegram user id
  username text,
  first_name text,
  created_at timestamptz default now(),
  free_used_today int default 0,
  free_reset_date date default current_date,
  is_premium boolean default false,
  premium_until timestamptz,
  packs_left int default 0,              -- разовые пакеты откликов
  referred_by bigint,
  referral_count int default 0,
  referral_code text unique
);

create table if not exists generations (
  id bigserial primary key,
  user_id bigint references users(id),
  resume_text text,
  vacancy_text text,
  result jsonb,
  created_at timestamptz default now()
);

create table if not exists payments (
  id bigserial primary key,
  user_id bigint references users(id),
  product text,                          -- 'pack_10' | 'week_unlimited'
  amount_stars int,
  telegram_charge_id text,
  created_at timestamptz default now()
);

create index if not exists idx_generations_user on generations(user_id);
create index if not exists idx_payments_user on payments(user_id);
