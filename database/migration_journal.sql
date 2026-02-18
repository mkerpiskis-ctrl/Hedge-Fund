-- Trading Journal Migration for Supabase

-- 1. Enable RLS (Row Level Security)
-- This ensures users can only see their own data

-- ==========================================
-- Table: trade_setups
-- Stores user-defined setups (e.g. "Pullback", "Breakout")
-- ==========================================
CREATE TABLE IF NOT EXISTS trade_setups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    criteria JSONB DEFAULT '{}'::jsonb, -- { htf: [], ltf: [], etf: [] }
    checklist JSONB DEFAULT '[]'::jsonb, -- ["Rule 1", "Rule 2"]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE trade_setups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own setups" ON trade_setups
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own setups" ON trade_setups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own setups" ON trade_setups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own setups" ON trade_setups
    FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- Table: trade_journal
-- Stores individual trade executions
-- ==========================================
CREATE TABLE IF NOT EXISTS trade_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    entry_time TIME NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('Long', 'Short')),
    result TEXT NOT NULL CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN')),
    pnl DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    r_multiple DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Structure Data Columns
    entry_price DECIMAL(20, 5),
    exit_price DECIMAL(20, 5),
    stop_loss DECIMAL(20, 5),
    take_profit DECIMAL(20, 5),
    quantity DECIMAL(15, 5),
    
    setup_id UUID REFERENCES trade_setups(id) ON DELETE SET NULL,
    
    -- JSONB Columns for flexibility & complex objects
    criteria_used JSONB DEFAULT '{}'::jsonb, -- Snapshot of criteria at time of trade
    images JSONB DEFAULT '{}'::jsonb,        -- { htf: "base64...", ltf: "..." }
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE trade_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal entries" ON trade_journal
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own journal entries" ON trade_journal
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries" ON trade_journal
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries" ON trade_journal
    FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- Table: user_settings
-- Stores singular user preferences (Achievements, Criteria Library)
-- One row per user_id
-- ==========================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    criteria_library JSONB DEFAULT '{}'::jsonb, -- Global list of available criteria
    achievements JSONB DEFAULT '[]'::jsonb,     -- User's unlocked achievements
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Trigger to create empty settings row on user creation (Optional, handling in app for now)
