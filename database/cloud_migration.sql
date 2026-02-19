-- Cloud Migration for FIRE, IBKR, and All Weather Trackers

-- ==========================================
-- FIRE TRACKER
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
-- IBKR TRACKER
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
-- ALL WEATHER CALCULATOR
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
