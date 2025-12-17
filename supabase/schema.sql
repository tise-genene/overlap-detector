-- Enable extensions
create extension if not exists "pgcrypto";

-- Profiles (nickname only)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

-- Partner hashes
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,
  created_at timestamptz not null default now()
);

-- Declarations of who is linked to which partner
create table if not exists public.declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  intent text,
  created_at timestamptz not null default now(),
  unique (user_id, partner_id)
);

-- Alerts generated when a partner has 2+ declarations
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  unique (user_id, partner_id)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.declarations enable row level security;
alter table public.alerts enable row level security;
alter table public.partners enable row level security;

-- Profiles: users only see/update their row
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles upsert own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Declarations: user can insert/select their own (service role typically writes)
create policy "declarations insert own" on public.declarations
  for insert with check (auth.uid() = user_id);
create policy "declarations select own" on public.declarations
  for select using (auth.uid() = user_id);

-- Alerts: user can read and mark their own
create policy "alerts select own" on public.alerts
  for select using (auth.uid() = user_id);
create policy "alerts update own" on public.alerts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Partners: no policies, only service role should touch
-- (RLS enabled but no policies means anon cannot read/write; service role bypasses)

-- Indexes to keep things snappy
create index if not exists idx_declarations_partner on public.declarations (partner_id);
create index if not exists idx_declarations_user on public.declarations (user_id);
create index if not exists idx_alerts_user on public.alerts (user_id);
create index if not exists idx_alerts_partner on public.alerts (partner_id);
