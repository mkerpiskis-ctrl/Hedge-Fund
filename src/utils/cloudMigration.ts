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

        // Mark migration as done locally
        localStorage.setItem(MIGRATION_KEY, 'true');
        console.log('Cloud migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    }
};
