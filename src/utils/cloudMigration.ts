import { supabase } from '../supabaseClient';

export const migrateLocalDataToCloud = async (userId: string) => {
    const MIGRATION_KEY = `cloud_migration_done_${userId}`;
    if (localStorage.getItem(MIGRATION_KEY)) {
        console.log('Migration already performed for this user.');
        return;
    }

    console.log('Starting cloud migration for user:', userId);

    try {
        // ==========================================
        // 1. FIRE TRACKER MIGRATION
        // ==========================================
        const fireEntriesStr = localStorage.getItem('fire_entries');
        const fireSettingsStr = localStorage.getItem('fire_settings');

        if (fireEntriesStr) {
            const entries = JSON.parse(fireEntriesStr);
            if (entries.length > 0) {
                const { error } = await supabase.from('fire_entries').insert(
                    entries.map((e: any) => ({
                        user_id: userId,
                        date: e.date,
                        capital_euro: e.capitalEuro,
                        capital_usd: e.capitalUsd,
                        contribution_mk_usd: e.contributionMkUsd,
                        contribution_kj_usd: e.contributionKjUsd,
                        fx_rate: e.fxRate
                    }))
                );
                if (error) console.error('Error migrating fire_entries:', error);
                else console.log('Migrated fire_entries');
            }
        }

        if (fireSettingsStr) {
            const settings = JSON.parse(fireSettingsStr);
            console.log('Migrating FIRE settings:', settings);

            // Upsert settings
            const { error } = await supabase.from('fire_settings').upsert({
                user_id: userId,
                inflation_rate: settings.inflationRate,
                return_rate_bear: settings.returnRateBear,
                return_rate_base: settings.returnRateBase,
                return_rate_bull: settings.returnRateBull,
                milestones: settings.milestones || []
            });
            if (error) console.error('Error migrating fire_settings:', error);
            else console.log('Migrated fire_settings');
        }


        // ==========================================
        // 2. IBKR TRACKER MIGRATION
        // ==========================================
        const ibkrDataStr = localStorage.getItem('ibkr_tracker_v1');
        if (ibkrDataStr) {
            const data = JSON.parse(ibkrDataStr);

            // Cash Balance
            if (data.cashBalance !== undefined) {
                const { error } = await supabase.from('ibkr_settings').upsert({
                    user_id: userId,
                    cash_balance: data.cashBalance
                });
                if (error) console.error('Error migrating ibkr_settings:', error);
            }

            // Trades
            if (data.trades && data.trades.length > 0) {
                // Process in chunks if needed, but for now simple insert
                const { error } = await supabase.from('ibkr_trades').insert(
                    data.trades.map((t: any) => ({
                        user_id: userId,
                        external_id: t.id,
                        date: t.date,
                        system: t.system,
                        symbol: t.symbol,
                        action: t.action,
                        quantity: t.quantity,
                        price: t.price,
                        total_value: t.totalValue,
                        account_id: t.account,
                        imported_at: t.importedAt || new Date().toISOString()
                    }))
                );
                if (error) console.error('Error migrating ibkr_trades:', error);
                else console.log(`Migrated ${data.trades.length} IBKR trades`);
            }

            // Positions
            if (data.positions && data.positions.length > 0) {
                const { error } = await supabase.from('ibkr_positions').insert(
                    data.positions.map((p: any) => ({
                        user_id: userId,
                        symbol: p.symbol,
                        systems: p.systems || (p.system ? [p.system] : []),
                        quantity: p.quantity,
                        avg_cost: p.avgCost
                    }))
                );
                if (error) console.error('Error migrating ibkr_positions:', error);
            }
        }


        // ==========================================
        // 3. ALL WEATHER CALCULATOR MIGRATION
        // ==========================================
        const awAssetsStr = localStorage.getItem('aw_assets_v3');
        const awCashStr = localStorage.getItem('aw_cash');

        if (awCashStr) {
            const { error } = await supabase.from('aw_settings').upsert({
                user_id: userId,
                cash_balance: parseFloat(awCashStr) || 0
            });
            if (error) console.error('Error migrating aw_settings:', error);
        }

        if (awAssetsStr) {
            const assets = JSON.parse(awAssetsStr);
            if (assets.length > 0) {
                const { error } = await supabase.from('aw_assets').insert(
                    assets.map((a: any) => ({
                        user_id: userId,
                        asset_id: a.id,
                        name: a.name,
                        ticker: a.ticker,
                        target_weight: parseFloat(a.targetWeight) || 0,
                        input_price: parseFloat(a.price) || 0,
                        input_units: parseFloat(a.units) || 0,
                        average_price: parseFloat(a.averagePrice) || 0,
                        currency: a.currency,
                        is_locked: a.isLocked || false
                    }))
                );
                if (error) console.error('Error migrating aw_assets:', error);
                else console.log('Migrated aw_assets');
            }
        }

        // ==========================================
        // 4. TRADING JOURNAL MIGRATION
        // ==========================================
        const journalEntriesStr = localStorage.getItem('tradingJournalEntries');
        const journalSetupsStr = localStorage.getItem('tradingJournalSetups');
        const journalCriteriaStr = localStorage.getItem('tradingJournalCriteria');
        const journalAchStr = localStorage.getItem('tradingJournalAchievements');

        // Entries
        if (journalEntriesStr) {
            const entries = JSON.parse(journalEntriesStr);
            if (entries.length > 0) {
                const { error } = await supabase.from('journal_entries').insert(
                    entries.map((e: any) => ({
                        user_id: userId,
                        id: e.id,
                        date: e.date,
                        time: e.time,
                        symbol: e.symbol,
                        direction: e.direction,
                        tick_value: parseFloat(e.tickValue) || 0,
                        tick_size: parseFloat(e.tickSize) || 0,
                        setup_id: e.setupId,
                        criteria_used: e.criteriaUsed || {},
                        entry_price: parseFloat(e.entry) || 0,
                        exit_price: parseFloat(e.exit) || 0,
                        stop_loss: parseFloat(e.stopLoss) || 0,
                        take_profit: parseFloat(e.takeProfit) || 0,
                        mfe_price: parseFloat(e.mfePrice) || 0,
                        max_move_points: parseFloat(e.maxMovePoints) || 0,
                        quantity: parseFloat(e.quantity) || 0,
                        commissions: parseFloat(e.commissions) || 0,
                        pnl: e.pnl,
                        pnl_percent: e.pnlPercent,
                        r_multiple: e.rMultiple,
                        result: e.result,
                        images: e.images || {},
                        notes: e.notes || ''
                    }))
                );
                if (error) console.error('Error migrating journal_entries:', error);
                else console.log(`Migrated ${entries.length} journal entries`);
            }
        }

        // Setups
        if (journalSetupsStr) {
            const setups = JSON.parse(journalSetupsStr);
            if (setups.length > 0) {
                const { error } = await supabase.from('journal_setups').upsert(
                    setups.map((s: any) => ({
                        user_id: userId,
                        id: s.id,
                        name: s.name,
                        criteria: s.criteria || {},
                        checklist: s.checklist || [],
                        color: s.color
                    }))
                );
                if (error) console.error('Error migrating journal_setups:', error);
            }
        }

        // Global Criteria (Saved as a special setup 'global_criteria')
        if (journalCriteriaStr) {
            const criteria = JSON.parse(journalCriteriaStr);
            const { error } = await supabase.from('journal_setups').upsert({
                user_id: userId,
                id: 'global_criteria',
                name: 'Global Criteria Library',
                criteria: criteria,
                checklist: [],
                color: 'gray'
            });
            if (error) console.error('Error migrating journal_criteria:', error);
        }

        // Achievements
        if (journalAchStr) {
            const achs = JSON.parse(journalAchStr);
            if (achs.length > 0) {
                const { error } = await supabase.from('journal_achievements').upsert(
                    achs.map((a: any) => ({
                        user_id: userId,
                        id: a.id,
                        unlocked: a.unlocked,
                        unlocked_at: a.date ? new Date(a.date).toISOString() : null
                    }))
                );
                if (error) console.error('Error migrating journal_achievements:', error);
            }
        }

        // ==========================================
        // 5. BUSINESS METRICS (DASHBOARD)
        // ==========================================
        const bizDataStr = localStorage.getItem('empire_business_data');
        if (bizDataStr) {
            const bizData = JSON.parse(bizDataStr);
            if (bizData.length > 0) {
                const { error } = await supabase.from('business_metrics').upsert(
                    bizData.map((b: any) => ({
                        user_id: userId,
                        month: b.month,
                        c2_subs: b.c2Subs || 0,
                        etoro_copiers: b.etoroCopiers || 0,
                        auc: b.auc || 0,
                        net_income: b.netIncome || 0
                    })),
                    { onConflict: 'user_id, month' }
                );
                if (error) console.error('Error migrating business_metrics:', error);
            }
        }

        // ==========================================
        // 6. REBALANCING STATE
        // ==========================================
        const rebBreakout = localStorage.getItem('rebalance_breakout');
        const rebAllWeather = localStorage.getItem('rebalance_all_weather');

        if (rebBreakout || rebAllWeather) {
            const { error } = await supabase.from('rebalancing_state').upsert({
                user_id: userId,
                breakout_val: parseFloat(rebBreakout || '0'),
                all_weather_val: parseFloat(rebAllWeather || '0')
            });
            if (error) console.error('Error migrating rebalancing_state:', error);
        }

        // Mark migration as done locally
        localStorage.setItem(MIGRATION_KEY, 'true');
        console.log('Cloud migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    }
};
