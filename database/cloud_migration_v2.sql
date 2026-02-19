-- Phase 2 Migration: Trading Journal, Dashboard, Rebalancing

-- 1. Journal Setups
create table if not exists journal_setups (
  id text not null, -- 'pullback', 'setup_123'
  user_id uuid references auth.users not null,
  name text not null,
  criteria jsonb default '{}'::jsonb, -- { htf: [], ltf: [], etf: [] }
  checklist jsonb default '[]'::jsonb, -- text array
  color text default 'blue',
  created_at timestamptz default now(),
  primary key (user_id, id)
);

alter table journal_setups enable row level security;

create policy "Users can view own setups"
  on journal_setups for select
  using (auth.uid() = user_id);

create policy "Users can insert own setups"
  on journal_setups for insert
  with check (auth.uid() = user_id);

create policy "Users can update own setups"
  on journal_setups for update
  using (auth.uid() = user_id);

create policy "Users can delete own setups"
  on journal_setups for delete
  using (auth.uid() = user_id);


-- 2. Journal Entries
create table if not exists journal_entries (
  id text not null, -- 'entry_123...'
  user_id uuid references auth.users not null,
  date text not null, -- YYYY-MM-DD
  time text not null, -- HH:MM
  symbol text not null,
  direction text not null, -- 'Long' | 'Short'
  tick_value numeric not null,
  tick_size numeric not null,
  setup_id text, -- Can be null if setup deleted? Or link to setups table? Keeping loose for now to avoid FK issues with custom IDs.
  criteria_used jsonb default '{}'::jsonb,
  entry_price numeric not null,
  exit_price numeric not null,
  stop_loss numeric not null,
  take_profit numeric not null,
  mfe_price numeric default 0,
  max_move_points numeric default 0,
  quantity numeric not null,
  commissions numeric default 0,
  pnl numeric not null,
  pnl_percent numeric default 0,
  r_multiple numeric default 0,
  result text not null, -- 'WIN', 'LOSS', 'BREAKEVEN'
  images jsonb default '{"htf":null,"ltf":null,"etf":null}'::jsonb, -- Store base64 or storage URLs? Base64 for now as per current app, but storage is better long term. Migration will just dump base64.
  notes text,
  created_at timestamptz default now(),
  primary key (user_id, id)
);

alter table journal_entries enable row level security;

create policy "Users can view own entries"
  on journal_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own entries"
  on journal_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entries"
  on journal_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own entries"
  on journal_entries for delete
  using (auth.uid() = user_id);


-- 3. Journal Achievements
create table if not exists journal_achievements (
  id text not null, -- 'first_blood'
  user_id uuid references auth.users not null,
  unlocked boolean default false,
  unlocked_at timestamptz,
  primary key (user_id, id)
);

alter table journal_achievements enable row level security;

create policy "Users can view own achievements"
  on journal_achievements for select
  using (auth.uid() = user_id);

create policy "Users can insert own achievements"
  on journal_achievements for insert
  with check (auth.uid() = user_id);

create policy "Users can update own achievements"
  on journal_achievements for update
  using (auth.uid() = user_id);


-- 4. Business Metrics (Empire Dashboard)
create table if not exists business_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  month text not null, -- YYYY-MM-DD (unique per user usually)
  c2_subs numeric default 0,
  etoro_copiers numeric default 0,
  auc numeric default 0,
  net_income numeric default 0,
  created_at timestamptz default now(),
  unique (user_id, month)
);

alter table business_metrics enable row level security;

create policy "Users can view own business metrics"
  on business_metrics for select
  using (auth.uid() = user_id);

create policy "Users can insert own business metrics"
  on business_metrics for insert
  with check (auth.uid() = user_id);

create policy "Users can update own business metrics"
  on business_metrics for update
  using (auth.uid() = user_id);

create policy "Users can delete own business metrics"
  on business_metrics for delete
  using (auth.uid() = user_id);


-- 5. Rebalancing State
create table if not exists rebalancing_state (
  user_id uuid references auth.users primary key,
  breakout_val numeric default 0,
  all_weather_val numeric default 0,
  updated_at timestamptz default now()
);

alter table rebalancing_state enable row level security;

create policy "Users can view own rebalancing state"
  on rebalancing_state for select
  using (auth.uid() = user_id);

create policy "Users can insert own rebalancing state"
  on rebalancing_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update own rebalancing state"
  on rebalancing_state for update
  using (auth.uid() = user_id);
