import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

interface Asset {
    id: string;
    name: string;
    ticker: string;
    targetWeight: number | string; // Percentage (e.g., 30 for 30%)
    price: number | string;
    averagePrice: number | string;
    units: number | string;
    currency?: string;
    isLocked?: boolean;
}

interface ResultRow {
    id: string;
    name: string;
    ticker: string;
    currentVal: number;
    currentWeight: number; // Percentage
    targetWeight: number;
    targetVal: number;
    deltaVal: number;
    actionUnits: number;
    actionType: 'BUY' | 'SELL' | 'HOLD' | '-';
}

const DEFAULT_ASSETS: Asset[] = [
    { id: 'nasdaq', name: 'NASDAQ 100 | CNDX.L', ticker: 'CNDX.L', targetWeight: 30, price: '', averagePrice: '', units: '', currency: '' },
    { id: 'world_ex_usa', name: 'All World - Ex USA | WEXU.DE', ticker: 'WEXU.DE', targetWeight: 20, price: '', averagePrice: '', units: '', currency: '' },
    { id: 'gold', name: 'Gold | IGLN.L', ticker: 'IGLN.L', targetWeight: 20, price: '', averagePrice: '', units: '', currency: '' },
    { id: 'treasuries', name: 'Treasuries | DTLA.L', ticker: 'DTLA.L', targetWeight: 10, price: '', averagePrice: '', units: '', currency: '' },
    { id: 'commodities', name: 'Commodities | ETL2.DE', ticker: 'ETL2.DE', targetWeight: 10, price: '', averagePrice: '', units: '', currency: '' },
    { id: 'bitcoin', name: 'Bitcoin | IBIT', ticker: 'BTC', targetWeight: 10, price: '', averagePrice: '', units: '', currency: '' },
];

const AllWeatherCalculator: React.FC = () => {
    // Supabase User
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });
    }, []);

    const [cash, setCash] = useState<number | string>('');
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [assets, setAssets] = useState<Asset[]>(DEFAULT_ASSETS);

    // DB Helpers
    const saveSettings = async (val: number | string) => {
        if (!user) return;
        const numVal = val === '' ? 0 : parseFloat(val.toString());
        await supabase.from('aw_settings').upsert({
            user_id: user.id,
            cash_balance: numVal
        });
    };

    // DB Load
    useEffect(() => {
        if (!user) return;

        const loadData = async () => {
            // 1. Cash
            const { data: settings } = await supabase.from('aw_settings').select('cash_balance').eq('user_id', user.id).single();
            if (settings) setCash(settings.cash_balance);

            // 2. Assets
            const { data: dbAssets } = await supabase.from('aw_assets').select('*').eq('user_id', user.id);

            if (dbAssets && dbAssets.length > 0) {
                // Deduplication Logic
                const uniqueAssets: Map<string, any> = new Map();
                const duplicatesToDelete: string[] = [];

                dbAssets.forEach((asset: any) => {
                    const existing = uniqueAssets.get(asset.asset_id);
                    if (existing) {
                        // Keep the one updated more recently
                        const existingDate = new Date(existing.updated_at).getTime();
                        const currentDate = new Date(asset.updated_at).getTime();
                        if (currentDate > existingDate) {
                            duplicatesToDelete.push(existing.id);
                            uniqueAssets.set(asset.asset_id, asset);
                        } else {
                            duplicatesToDelete.push(asset.id);
                        }
                    } else {
                        uniqueAssets.set(asset.asset_id, asset);
                    }
                });

                // Auto-cleanup duplicates
                if (duplicatesToDelete.length > 0) {
                    console.log('Cleaning up duplicate assets:', duplicatesToDelete);
                    await supabase.from('aw_assets').delete().in('id', duplicatesToDelete);
                }

                const finalAssets = Array.from(uniqueAssets.values());

                // Map DB to State
                const mapped: Asset[] = finalAssets.map((row: any) => ({
                    id: row.asset_id, // Use the string ID 'nasdaq'
                    name: row.name,
                    ticker: row.ticker,
                    targetWeight: row.target_weight,
                    price: row.input_price === 0 ? '' : row.input_price,
                    averagePrice: row.average_price === 0 ? '' : row.average_price,
                    units: row.input_units === 0 ? '' : row.input_units,
                    currency: row.currency,
                    isLocked: row.is_locked,
                }));

                // Sort to match default order
                const order = ['nasdaq', 'world_ex_usa', 'gold', 'treasuries', 'commodities', 'bitcoin'];
                mapped.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

                setAssets(mapped);
            } else {
                // First time: Insert Defaults
                const initialAssets = DEFAULT_ASSETS.map(a => ({
                    user_id: user.id,
                    asset_id: a.id,
                    name: a.name,
                    ticker: a.ticker,
                    target_weight: a.targetWeight,
                    input_price: 0,
                    input_units: 0,
                    average_price: 0,
                    currency: '',
                    is_locked: false
                }));

                await supabase.from('aw_assets').insert(initialAssets);
            }
        };
        loadData();
    }, [user]);

    // Save Helpers
    const saveAssetToDb = async (asset: Asset) => {
        if (!user) return;
        const payload = {
            target_weight: asset.targetWeight === '' ? 0 : asset.targetWeight,
            input_price: asset.price === '' ? 0 : asset.price,
            input_units: asset.units === '' ? 0 : asset.units,
            average_price: asset.averagePrice === '' ? 0 : asset.averagePrice,
            currency: asset.currency,
            is_locked: asset.isLocked,
            updated_at: new Date().toISOString()
        };

        // Update using asset_id AND user_id to ensure we target the specific asset
        await supabase.from('aw_assets').update(payload).eq('user_id', user.id).eq('asset_id', asset.id);
    };

    const saveAllAssets = async (newAssets: Asset[]) => {
        if (!user) return;
        for (const asset of newAssets) {
            await saveAssetToDb(asset);
        }
    };


    const [results, setResults] = useState<ResultRow[]>([]);
    const [totalValue, setTotalValue] = useState<number>(0);
    const [totalPnL, setTotalPnL] = useState<number>(0);

    const handleInputChange = (id: string, field: 'price' | 'units' | 'targetWeight' | 'averagePrice', value: string) => {
        setAssets(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    };

    const [executedOrders, setExecutedOrders] = useState<{ [key: string]: boolean }>({});

    const toggleExecuted = (id: string) => {
        setExecutedOrders(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const [isRefreshing, setIsRefreshing] = useState(false);

    // Cache configuration
    const CACHE_PREFIX = 'aw_price_cache_v2_';
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    const getCachedPrice = (ticker: string): { price: number, currency: string, source: string, timestamp: number } | null => {
        try {
            const saved = localStorage.getItem(CACHE_PREFIX + ticker);
            if (!saved) return null;
            const parsed = JSON.parse(saved);
            if (Date.now() - parsed.timestamp < CACHE_DURATION) {
                return parsed;
            }
        } catch (e) {
            return null;
        }
        return null;
    };

    const setCachedPrice = (ticker: string, data: any) => {
        try {
            localStorage.setItem(CACHE_PREFIX + ticker, JSON.stringify({ ...data, timestamp: Date.now() }));
        } catch (e) { }
    };

    const fetchYahooData = async (ticker: string) => {
        // Try Cache First (but SKIP for IGLN to ensure fresh data)
        if (!ticker.includes('IGLN')) {
            const cached = getCachedPrice(ticker);
            if (cached) {
                console.log(`[CACHE HIT] ${ticker}:`, cached.price);
                return { ...cached, fromCache: true };
            }
        } else {
            console.log(`[IGLN] Skipping cache, fetching fresh data...`);
        }

        // Fetch Live
        // v1.5.0: Using custom Vercel API for IGLN (bypasses allorigins cache issues)
        // For other tickers, still use allorigins as fallback
        let yahooData;

        if (ticker.includes('IGLN') || ticker === 'IGLN.L') {
            // Use our own proxy with enhanced browser headers
            // v1.8.0: Using daily data (5d) with improved headers for better Yahoo response
            const apiUrl = `/api/yahoo?symbol=${encodeURIComponent(ticker)}&range=5d&interval=1d&_=${Date.now()}`;
            console.log(`[IGLN v1.8.0] Calling API with enhanced headers: ${apiUrl}`);
            const res = await fetch(apiUrl);
            if (!res.ok) throw new Error(`API returned ${res.status}`);
            yahooData = await res.json();
            console.log(`[IGLN v1.5.1] API Response received, adjclose count:`, yahooData.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose?.length);
        } else {
            // Use allorigins for other tickers (works fine for them)
            const timestamp = Date.now();
            const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${timestamp}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const wrapper = await res.json();
            if (!wrapper.contents) throw new Error('No contents in proxy response');
            yahooData = JSON.parse(wrapper.contents);
        }

        const result = yahooData.chart?.result?.[0];
        const meta = result?.meta;

        let price = meta?.regularMarketPrice || meta?.chartPreviousClose || meta?.previousClose;
        let currency = meta?.currency;

        // CLEAN IGLN/Gold Logic (v3)
        if (ticker.includes('IGLN') || ticker === 'IGLN.L' || (result?.meta?.symbol === 'IGLN.L')) {
            const indicators = result?.indicators;
            let foundPrice = null;

            console.log('[IGLN DEBUG] indicators:', JSON.stringify(indicators, null, 2));

            // Priority 1: AdjClose
            const adjCloseArr = indicators?.adjclose?.[0]?.adjclose;
            console.log('[IGLN DEBUG] adjCloseArr:', adjCloseArr);
            if (Array.isArray(adjCloseArr)) {
                const valid = adjCloseArr.filter((n: any) => typeof n === 'number');
                if (valid.length > 0) foundPrice = valid[valid.length - 1];
            }

            // Priority 2: Quote Close
            if (!foundPrice) {
                const closeArr = indicators?.quote?.[0]?.close;
                console.log('[IGLN DEBUG] closeArr:', closeArr);
                if (Array.isArray(closeArr)) {
                    const valid = closeArr.filter((n: any) => typeof n === 'number');
                    if (valid.length > 0) foundPrice = valid[valid.length - 1];
                }
            }

            console.log('[IGLN DEBUG] foundPrice:', foundPrice, '| Original price:', price);

            if (foundPrice) {
                price = foundPrice;
            }
            // No fallback correction - we want pure source data
        }

        const data = { price, currency, source: 'yahoo' };
        setCachedPrice(ticker, data);
        return { ...data, fromCache: false };
    };

    const fetchPrices = async () => {
        console.log('[ALL WEATHER v1.3.7] fetchPrices() called');
        setIsRefreshing(true);
        const newAssets = [...assets];
        setDebugLogs([]);
        const logs: string[] = [];
        const log = (msg: string) => logs.push(msg);

        // Fetch FX (Sequential)
        let eurUsd = 1.083;
        let gbpUsd = 1.25;

        try {
            const fxEUR = await fetchYahooData('EURUSD=X');
            if (fxEUR?.price) eurUsd = fxEUR.price;

            const fxGBP = await fetchYahooData('GBPUSD=X');
            if (fxGBP?.price) gbpUsd = fxGBP.price;
        } catch (e) {
            log(`FX Error: ${e}`);
        }

        log(`FX: EUR=${eurUsd.toFixed(4)}, GBP=${gbpUsd.toFixed(4)}`);

        // Fetch Assets
        for (let i = 0; i < newAssets.length; i++) {
            const asset = newAssets[i];
            let ticker = asset.ticker.trim();
            if (ticker === 'BTC') ticker = 'BTC-USD';

            try {
                const data = await fetchYahooData(ticker);
                let price = data.price;
                const currency = data.currency;

                if (data.fromCache) {
                    // log(`Using Cache for ${ticker}`);
                }

                if (price) {
                    // IGLN Force USD Display
                    if (ticker.includes('IGLN') || asset.id === 'gold') {
                        newAssets[i].currency = 'USD';
                        newAssets[i].price = typeof price === 'number' ? price.toFixed(4) : price;
                        newAssets[i].isLocked = true;
                        continue;
                    }

                    newAssets[i].currency = currency;

                    // Currency Conversion
                    if (currency === 'EUR') {
                        price = price * eurUsd;
                    } else if (currency === 'GBP') {
                        price = price * gbpUsd;
                    } else if (currency === 'GBp') {
                        price = (price / 100) * gbpUsd;
                    }

                    newAssets[i].price = typeof price === 'number' ? price.toFixed(4) : price;
                }
            } catch (error) {
                console.error(`Error ${ticker}:`, error);
                log(`Failed ${ticker}: ${error}`);
            }
        }

        setAssets(newAssets);
        saveAllAssets(newAssets); // Save new prices to DB
        setIsRefreshing(false);
        setDebugLogs(logs);
    };

    const safeParse = (val: number | string): number => {
        if (val === '' || val === undefined || val === null) return 0;
        const parsed = parseFloat(val.toString());
        return isNaN(parsed) ? 0 : parsed;
    };

    useEffect(() => {
        // Calc total target weight
        calculate();
    }, [assets, cash]);

    const calculate = () => {
        let currentTotalAssets = 0;

        // 1. Calculate stats per asset
        const calculatedAssets = assets.map(a => {
            const p = safeParse(a.price);
            const u = safeParse(a.units);
            const val = p * u;
            currentTotalAssets += val;
            return { ...a, val };
        });

        const cashVal = safeParse(cash);
        const portfolioTotal = currentTotalAssets + cashVal;

        if (portfolioTotal === 0) {
            setResults([]);
            setTotalValue(0);
            return;
        }

        const costBasis = calculatedAssets.reduce((sum, a) => {
            const avg = safeParse(a.averagePrice);
            const u = safeParse(a.units);
            return sum + (avg * u);
        }, 0);

        setTotalValue(portfolioTotal);
        setTotalPnL(currentTotalAssets - costBasis);

        // 2. Calculate targets and deltas
        const rows: ResultRow[] = calculatedAssets.map(a => {
            const tWeight = safeParse(a.targetWeight);
            const targetVal = portfolioTotal * (tWeight / 100);
            const currentWeight = (a.val / portfolioTotal) * 100;

            const drift = Math.abs(currentWeight - tWeight);
            const isDrifting = drift >= 5;

            const deltaVal = targetVal - a.val;

            let actionUnits = 0;
            let actionType: 'BUY' | 'SELL' | 'HOLD' | '-' = '-';

            const price = safeParse(a.price);
            const effectivePrice = price > 0 ? price : 1;
            const units = safeParse(a.units);

            // Special Case: SELL ALL (Target is 0 and we have units)
            const isSellAll = tWeight === 0 && (units > 0);

            if (isSellAll) {
                actionUnits = units;
                actionType = 'SELL';
            } else if (Math.abs(deltaVal) > 1) { // Normal rebalance
                if (isDrifting) { // Apply 5% drift rule
                    actionUnits = Math.abs(deltaVal / effectivePrice);
                    actionType = deltaVal > 0 ? 'BUY' : 'SELL';
                } else {
                    actionType = 'HOLD';
                }
            } else {
                actionType = 'HOLD';
            }

            return {
                id: a.id,
                name: a.name,
                ticker: a.ticker,
                currentVal: a.val,
                currentWeight,
                targetWeight: tWeight,
                targetVal,
                deltaVal,
                actionUnits,
                actionType
            };
        });

        setResults(rows);
    };

    return (
        <div className="text-xs font-sans">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* LEFT: SETTINGS & TARGETS */}
                <div className="lg:col-span-4 space-y-4">


                    <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-900/80 text-[10px] uppercase text-slate-500 font-semibold">
                                <tr>
                                    <th className="p-2 pl-3">Asset</th>
                                    <th className="p-2 text-center">Tgt %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {assets.map((asset, idx) => (
                                    <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-2 pl-3">
                                            <div className="font-bold text-slate-200">{asset.ticker}</div>
                                            <div className="text-[9px] uppercase text-slate-500 font-semibold tracking-tight">
                                                {asset.name.split('(')[0].replace('#', '')}
                                            </div>
                                        </td>
                                        <td className="p-2 text-center">
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={asset.targetWeight}
                                                onChange={(e) => handleInputChange(asset.id, 'targetWeight', e.target.value)}
                                                onBlur={() => saveAssetToDb(asset)}
                                                className={`w-10 text-center py-0.5 rounded bg-slate-800/50 border focus:outline-none font-bold text-xs transition-all
                                                    ${safeParse(asset.targetWeight) === 0 ? 'text-rose-400 border-rose-900/30 focus:border-rose-500' : 'text-slate-200 border-slate-700 focus:border-amber-500'}
                                                `}
                                                tabIndex={idx * 3 + 1}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RIGHT: DATA ENTRY & EXECUTION */}
                <div className="lg:col-span-8 space-y-4">
                    {/* Price/Unit Inputs */}
                    <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-hidden">
                        <div className="p-2 bg-slate-900/80 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                            <span>Market Data Entry</span>
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <span className="text-slate-500">CASH:</span>
                                    <div className="relative w-24">
                                        <span className="absolute left-2 top-0.5 text-slate-500 text-[10px]">$</span>
                                        <input
                                            type="number"
                                            value={cash}
                                            onChange={(e) => setCash(e.target.value)}
                                            onBlur={() => saveSettings(cash)}
                                            className="glass-input w-full pl-4 py-0.5 text-xs font-medium text-white bg-slate-900/80 focus:ring-amber-500/30 text-right border-slate-700"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={fetchPrices}
                                    disabled={isRefreshing}
                                    className="flex items-center space-x-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20"
                                >
                                    <span className={isRefreshing ? "animate-spin" : ""}>⟳</span>
                                    <span>{isRefreshing ? 'UPDATING...' : 'UPDATE LIVE PRICES'}</span>
                                </button>
                                <button
                                    onClick={() => {
                                        // Reset logic? Now it's in DB. 
                                        // Maybe just clear local cache?
                                        if (confirm('Clear local price cache?')) {
                                            Object.keys(localStorage).forEach(key => {
                                                if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
                                            });
                                            window.location.reload();
                                        }
                                    }}
                                    className="text-[9px] text-slate-600 hover:text-rose-400 font-mono transition-colors"
                                    title="Force Reset Cached Data"
                                >
                                    v1.3 (RESET)
                                </button>
                            </div>
                        </div>
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-900/50 text-[10px] uppercase text-slate-500 font-semibold">
                                <tr>
                                    <th className="p-2 pl-3">Asset</th>
                                    <th className="p-2 text-right">Last Price (USD)</th>
                                    <th className="p-2 text-right">Avg Price</th>
                                    <th className="p-2 text-right">Units</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">

                                {assets.map((asset, idx) => (
                                    <tr key={asset.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="p-2 pl-3">
                                            <div className="font-bold text-slate-200">{asset.ticker}</div>
                                            <div className="text-[9px] uppercase text-slate-500 font-semibold tracking-tight">
                                                {asset.name.split('(')[0].replace('#', '')}
                                            </div>
                                        </td>
                                        <td className="p-2 text-right">
                                            <div className="flex justify-end items-center space-x-2">
                                                {asset.currency && <span className="text-[9px] text-slate-600 bg-slate-800/50 px-1 rounded">{asset.currency}</span>}
                                                {asset.isLocked && <span title="Price Locked (USD)" className="text-[10px] cursor-help">🔒</span>}
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={asset.price}
                                                    onChange={(e) => handleInputChange(asset.id, 'price', e.target.value)}
                                                    onBlur={() => saveAssetToDb(asset)}
                                                    className="glass-input w-20 text-right text-xs py-0.5"
                                                    tabIndex={idx * 3 + 2}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-2 text-right">
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={asset.averagePrice}
                                                onChange={(e) => handleInputChange(asset.id, 'averagePrice', e.target.value)}
                                                onBlur={() => saveAssetToDb(asset)}
                                                className="glass-input w-20 text-right text-xs py-0.5"
                                                tabIndex={idx * 3 + 3}
                                            />
                                        </td>
                                        <td className="p-2 text-right">
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={asset.units}
                                                onChange={(e) => handleInputChange(asset.id, 'units', e.target.value)}
                                                onBlur={() => saveAssetToDb(asset)}
                                                className="glass-input w-20 text-right text-xs py-0.5"
                                                tabIndex={idx * 3 + 4}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Execution Table */}
                    <div className="flex items-center justify-between mt-6 lg:mt-0 mb-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">Execution Matrix</h4>
                        <div className="text-right flex items-center space-x-4">
                            <div>
                                <div className="text-[9px] text-slate-500 uppercase font-semibold">Total P&L</div>
                                <div className={`font-bold text-sm ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString()}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] text-slate-500 uppercase font-semibold">Total NAV</div>
                                <div className="text-emerald-400 font-bold text-sm">${totalValue.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-800 shadow-lg">
                        <table className="w-full text-left border-collapse bg-slate-900/40">
                            <thead className="bg-slate-950/80 text-[10px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                                <tr>
                                    <th className="p-2 w-8 text-center">Stat</th>
                                    <th className="p-2">Ticker</th>
                                    <th className="p-2 text-right">Weight</th>
                                    <th className="p-2 text-center">Action</th>
                                    <th className="p-2 text-right">Units</th>
                                    <th className="p-2 text-right">Cost ($)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-xs">
                                {results.map((row) => {
                                    const action = row.actionType;
                                    const isSellAll = row.targetWeight === 0 && row.currentVal > 0;

                                    if (row.targetWeight === 0 && action === 'HOLD') {
                                        return null;
                                    }

                                    let rowClass = 'hover:bg-slate-800/40 transition-all duration-200';

                                    // Custom visual logic for Actions
                                    const isBuy = action === 'BUY';
                                    const isSell = action === 'SELL';
                                    const isHold = action === 'HOLD';

                                    return (
                                        <tr key={row.id} className={rowClass}>
                                            <td className="p-2 text-center">
                                                <button
                                                    onClick={() => toggleExecuted(row.id)}
                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${executedOrders[row.id]
                                                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                                        : 'border-slate-600 hover:border-emerald-400/50 text-transparent'
                                                        }`}
                                                >
                                                    {executedOrders[row.id] && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                                </button>
                                            </td>
                                            <td className={`p-2 ${executedOrders[row.id] ? 'opacity-30 grayscale' : ''}`}>
                                                <div className="font-bold text-slate-200">{row.ticker}</div>
                                                <div className="text-[9px] uppercase text-slate-500 font-semibold tracking-tight">
                                                    {row.name.split('(')[0].replace('#', '')}
                                                </div>
                                            </td>
                                            <td className={`p-2 text-right ${executedOrders[row.id] ? 'opacity-30' : ''}`}>
                                                <div className="text-slate-200 font-medium">{row.currentWeight.toFixed(1)}%</div>
                                                <div className="text-[9px] text-slate-600">Tgt: <span className="text-slate-500">{row.targetWeight}%</span></div>
                                            </td>
                                            <td className={`p-2 text-center ${executedOrders[row.id] ? 'opacity-30' : ''}`}>
                                                {isSellAll && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">SELL ALL</span>}
                                                {!isSellAll && isBuy && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.1)]">BUY</span>}
                                                {!isSellAll && isSell && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">SELL</span>}
                                                {!isSellAll && isHold && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-800 text-slate-500 border border-slate-700">HOLD</span>}
                                            </td>
                                            <td className={`p-2 text-right font-mono font-medium ${executedOrders[row.id] ? 'opacity-30' : 'text-slate-300'}`}>
                                                {row.actionUnits > 0 ? row.actionUnits.toFixed(4) : '-'}
                                            </td>
                                            <td className={`p-2 text-right font-mono ${executedOrders[row.id] ? 'opacity-30' : 'text-slate-400'}`}>
                                                {row.actionUnits > 0 ? `$${Math.abs(row.deltaVal).toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {results.some(r => Math.abs(r.currentWeight - r.targetWeight) > 5) && (
                        <div className="mt-4 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center space-x-2 text-rose-400 animate-pulse">
                            <span className="font-bold text-[10px] uppercase tracking-widest">Critical Allocation Drift Detected</span>
                        </div>
                    )}

                    {/* DEBUG LOG VIEW */}
                    {debugLogs.length > 0 && (
                        <div className="mt-8 p-4 bg-black/50 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-400">
                            <h5 className="font-bold text-slate-300 mb-2">DEBUG LOGS (Sending to Developer):</h5>
                            <div className="h-32 overflow-y-auto space-y-1">
                                {debugLogs.map((l, i) => (
                                    <div key={i} className="border-b border-slate-800/50 pb-1">{l}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AllWeatherCalculator;
