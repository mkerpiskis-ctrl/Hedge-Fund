-- ==========================================
-- SUPABASE FULL DATABASE SCHEMA
-- This script creates ALL necessary tables for the application.
-- Run this in the Supabase SQL Editor.
-- ==========================================

-- ==========================================
-- PART 1: FIRE TRACKER
-- ==========================================

-- 1. Fire Settings
CREATE TABLE IF NOT EXISTS fire_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    inflation_rate DECIMAL(5, 2) DEFAULT 2.5,
    return_rate_bear DECIMAL(5, 2) DEFAULT 5.0,
    return_rate_base DECIMAL(5, 2) DEFAULT 7.0,
    return_rate_bull DECIMAL(5, 2) DEFAULT 9.0,
    milestones JSONB DEFAULT '[]'::jsonb, -- Store milestone objects here
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE fire_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fire settings" ON fire_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fire settings" ON fire_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fire settings" ON fire_settings FOR UPDATE USING (auth.uid() = user_id);

-- 2. Fire Entries
CREATE TABLE IF NOT EXISTS fire_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    capital_euro DECIMAL(15, 2) NOT NULL,
    capital_usd DECIMAL(15, 2) NOT NULL,
    contribution_mk_usd DECIMAL(15, 2) DEFAULT 0,
    contribution_kj_usd DECIMAL(15, 2) DEFAULT 0,
    fx_rate DECIMAL(10, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE fire_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fire entries" ON fire_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fire entries" ON fire_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fire entries" ON fire_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fire entries" ON fire_entries FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- PART 2: IBKR TRACKER
-- ==========================================

-- 3. IBKR Settings (Cash Balance)
CREATE TABLE IF NOT EXISTS ibkr_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cash_balance DECIMAL(15, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ibkr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ibkr settings" ON ibkr_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ibkr settings" ON ibkr_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ibkr settings" ON ibkr_settings FOR UPDATE USING (auth.uid() = user_id);

-- 4. IBKR Trades
CREATE TABLE IF NOT EXISTS ibkr_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Our internal ID
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id TEXT, -- To map to imported CSV IDs or TWS execIds (optional unique constraint per user?)
    date DATE NOT NULL,
    system TEXT NOT NULL, -- 'NDX', 'RUI', 'PF'
    symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
    quantity DECIMAL(15, 5) NOT NULL,
    price DECIMAL(15, 5) NOT NULL,
    total_value DECIMAL(15, 2) NOT NULL,
    account_id TEXT, -- e.g. U12345
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ibkr_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ibkr trades" ON ibkr_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ibkr trades" ON ibkr_trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ibkr trades" ON ibkr_trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ibkr trades" ON ibkr_trades FOR DELETE USING (auth.uid() = user_id);

-- 5. IBKR Positions (Snapshot)
CREATE TABLE IF NOT EXISTS ibkr_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    systems TEXT[], -- Array of systems e.g. ['NDX', 'RUI']
    quantity DECIMAL(15, 5) NOT NULL,
    avg_cost DECIMAL(15, 5) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ibkr_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ibkr positions" ON ibkr_positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ibkr positions" ON ibkr_positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ibkr positions" ON ibkr_positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ibkr positions" ON ibkr_positions FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- PART 3: ALL WEATHER CALCULATOR
-- ==========================================

-- 6. AW Settings (Cash)
CREATE TABLE IF NOT EXISTS aw_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cash_balance DECIMAL(15, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE aw_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own aw settings" ON aw_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own aw settings" ON aw_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own aw settings" ON aw_settings FOR UPDATE USING (auth.uid() = user_id);

-- 7. AW Assets
CREATE TABLE IF NOT EXISTS aw_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL, -- internal string id like 'nasdaq'
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    target_weight DECIMAL(5, 2) NOT NULL DEFAULT 0,
    input_price DECIMAL(15, 5), -- Last manually entered price or fetched
    input_units DECIMAL(15, 5), -- Last manually entered units
    average_price DECIMAL(15, 5),
    currency TEXT,
    is_locked BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE aw_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own aw assets" ON aw_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own aw assets" ON aw_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own aw assets" ON aw_assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own aw assets" ON aw_assets FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- PART 4: TRADING JOURNAL
-- ==========================================

-- 8. Journal Setups
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


-- 9. Journal Entries
create table if not exists journal_entries (
  id text not null, -- 'entry_123...'
  user_id uuid references auth.users not null,
  date text not null, -- YYYY-MM-DD
  time text not null, -- HH:MM
  symbol text not null,
  direction text not null, -- 'Long' | 'Short'
  tick_value numeric not null,
  tick_size numeric not null,
  setup_id text,
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
  images jsonb default '{"htf":null,"ltf":null,"etf":null}'::jsonb,
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


-- 10. Journal Achievements
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


-- ==========================================
-- PART 5: BUSINESS METRICS (DASHBOARD)
-- ==========================================

-- 11. Business Metrics
create table if not exists business_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  month text not null, -- YYYY-MM-DD
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


-- ==========================================
-- PART 6: REBALANCING STATE
-- ==========================================

-- 12. Rebalancing State
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
