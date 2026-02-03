import { useState, useEffect, useCallback, useMemo } from 'react';

// Types
interface Trade {
    id: string;
    date: string;
    system: 'NDX' | 'RUI' | 'PF';
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    totalValue: number;
    importedAt: string;
    account?: string; // Track which account this trade belongs to
}

interface Position {
    symbol: string;
    systems: string[]; // Track which systems this position belongs to (e.g., ['NDX', 'RUI'])
    quantity: number;
    avgCost: number;
    currentPrice: number | null;
    marketValue: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    account?: string; // Track which account this position belongs to
}

// TWS Bridge Types
interface TWSAccountSummary {
    netLiquidation: number;
    totalCashValue: number;
    availableFunds: number;
    buyingPower: number;
    grossPositionValue: number;
    unrealizedPnL: number;
    realizedPnL: number;
    currency: string;
}

interface TWSPosition {
    account: string;
    symbol: string;
    secType: string;
    exchange: string;
    currency: string;
    position: number;
    avgCost: number;
}

interface TWSStatus {
    connected: boolean;
    twsPort: number;
    accounts: string[];
    positionCount: number;
    lastError: { message: string; code: number } | null;
}

// RealTest Types
interface RealTestTrade {
    tradeId: string;
    strategy: string;
    symbol: string;
    side: string;
    dateIn: string;
    timeIn: string;
    qtyIn: number;
    priceIn: number;
    dateOut: string;
    timeOut: string;
    qtyOut: number;
    priceOut: number;
    reason: string;
    profit: number;
    size: number;
    dividends: number;
    isOpen: boolean; // true if Reason = "end of test"
}

interface RealTestSyncAnalysis {
    rtBalance: number;       // RealTest theoretical balance
    twsBalance: number;      // TWS actual balance
    rtCash: number;          // RealTest theoretical cash
    twsCash: number;         // TWS actual cash
    drift: number;           // TWS - RT difference
    positionComparison: {
        symbol: string;
        rtQty: number;
        rtCost: number;
        twsQty: number;
        twsCost: number;
        qtyDelta: number;
        valueDelta: number;
    }[];
    recommendedAdjustment: number; // Positive = Deposit, Negative = Withdrawal
    adjustmentType: 'DEPOSIT' | 'WITHDRAWAL' | 'NONE';
}

const STORAGE_KEY = 'ibkr_tracker_v1';
const TWS_BRIDGE_URL = 'http://localhost:3001';

export default function IBKRTracker() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [cashBalance, setCashBalance] = useState<number>(0);
    const [systemFilter, setSystemFilter] = useState<'ALL' | 'NDX' | 'RUI'>('ALL');
    const [isLoading, setIsLoading] = useState(false);
    const [csvPreview, setCsvPreview] = useState<Trade[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
    const [editingTradePriceId, setEditingTradePriceId] = useState<string | null>(null);
    const [editingPositionSymbol, setEditingPositionSymbol] = useState<string | null>(null);

    // TWS Bridge state
    const [twsConnected, setTwsConnected] = useState(false);
    const [twsAccounts, setTwsAccounts] = useState<Record<string, TWSAccountSummary>>({});
    const [twsPositions, setTwsPositions] = useState<TWSPosition[]>([]);
    const [twsTotals, setTwsTotals] = useState<{ netLiquidation: number; totalCashValue: number; unrealizedPnL: number } | null>(null);
    const [twsError, setTwsError] = useState<string | null>(null);
    const [twsExecutions, setTwsExecutions] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('ALL'); // 'ALL' or specific account ID
    const [isRebalanceMode, setIsRebalanceMode] = useState(false);
    const [rebalancePreview, setRebalancePreview] = useState<{
        symbol: string;
        system: string;
        targetValue: number;
        targetQty: number;
        currentQty: number;
        delta: number;
        action: 'BUY' | 'SELL' | 'HOLD';
        price: number;
    }[] | null>(null);
    const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});

    // RealTest Sync State
    const [realTestTrades, setRealTestTrades] = useState<RealTestTrade[]>([]);
    const [realTestSyncAnalysis, setRealTestSyncAnalysis] = useState<RealTestSyncAnalysis | null>(null);
    const [showRealTestSync, setShowRealTestSync] = useState(false);

    // Load data from localStorage with migration for old format
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                setTrades(data.trades || []);

                // Migrate old positions with 'system' (string) to 'systems' (array)
                const migratedPositions = (data.positions || []).map((p: any) => {
                    if (p.systems) {
                        return p; // Already new format
                    } else if (p.system) {
                        // Old format - convert to new
                        return { ...p, systems: [p.system] };
                    }
                    return p;
                });
                setPositions(migratedPositions);
                setCashBalance(data.cashBalance || 0);
            }
        } catch (e) {
            console.error('Failed to load IBKR data:', e);
            // Clear corrupted data
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    // Save to localStorage
    const saveData = useCallback((newTrades: Trade[], newPositions: Position[], newCash: number) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                trades: newTrades,
                positions: newPositions,
                cashBalance: newCash,
                lastUpdated: new Date().toISOString()
            }));
        } catch (e) {
            console.error('Failed to save IBKR data:', e);
        }
    }, []);

    // Fetch data from TWS Bridge
    const fetchTwsData = useCallback(async () => {
        try {
            // Check status first
            const statusRes = await fetch(`${TWS_BRIDGE_URL}/api/status`);
            if (!statusRes.ok) throw new Error('Bridge server not running');

            const status: TWSStatus = await statusRes.json();
            setTwsConnected(status.connected);

            if (!status.connected) {
                setTwsError('Not connected to TWS');
                return;
            }

            // Fetch account data
            const accountRes = await fetch(`${TWS_BRIDGE_URL}/api/account`);
            if (accountRes.ok) {
                const accountData = await accountRes.json();
                if (accountData._totals) {
                    setTwsTotals(accountData._totals);
                    delete accountData._totals;
                }
                // User requested to hide these accounts
                delete accountData['U20791125'];
                delete accountData['U15799319'];

                setTwsAccounts(accountData);
            }

            // Fetch positions
            const posRes = await fetch(`${TWS_BRIDGE_URL}/api/positions`);
            if (posRes.ok) {
                const posData = await posRes.json();
                setTwsPositions(posData);
            }

            // Fetch executions
            const execRes = await fetch(`${TWS_BRIDGE_URL}/api/executions`);
            if (execRes.ok) {
                const execData = await execRes.json();
                setTwsExecutions(execData);
            }

            setTwsError(null);
        } catch (err) {
            setTwsError(err instanceof Error ? err.message : 'Failed to connect to TWS Bridge');
            setTwsConnected(false);
        }
    }, []);

    // Manual Refresh Trigger
    const handleTwsRefresh = useCallback(async () => {
        setIsLoading(true);
        try {
            // Trigger TWS upate
            const res = await fetch(`${TWS_BRIDGE_URL}/api/refresh`, { method: 'POST' });
            if (res.ok) {
                // Wait for TWS to process updates
                await new Promise(resolve => setTimeout(resolve, 1500));
                await fetchTwsData();
            }
        } catch (e) {
            console.error('Refresh failed:', e);
        } finally {
            setIsLoading(false);
        }
    }, [fetchTwsData]);

    // Derived totals based on selection
    const displayedTotals = selectedAccount === 'ALL'
        ? twsTotals
        : (twsAccounts[selectedAccount] ? {
            netLiquidation: twsAccounts[selectedAccount].netLiquidation,
            totalCashValue: twsAccounts[selectedAccount].totalCashValue,
            unrealizedPnL: twsAccounts[selectedAccount].unrealizedPnL
        } : null);

    // Derived positions based on selection - CONSOLIDATED by symbol
    const displayedTwsPositions = useMemo(() => {
        const filtered = selectedAccount === 'ALL'
            ? twsPositions
            : twsPositions.filter(p => p.account === selectedAccount);

        // Consolidate by symbol to prevent duplicates
        const consolidated = new Map<string, TWSPosition>();
        for (const pos of filtered) {
            const existing = consolidated.get(pos.symbol);
            if (existing) {
                // Merge: sum position, weighted avgCost
                const totalQty = existing.position + pos.position;
                const weightedCost = ((existing.avgCost * existing.position) + (pos.avgCost * pos.position)) / totalQty;
                existing.position = totalQty;
                existing.avgCost = weightedCost;
            } else {
                consolidated.set(pos.symbol, { ...pos });
            }
        }
        return Array.from(consolidated.values());
    }, [twsPositions, selectedAccount]);

    // Merge Trades Logic
    const finalTrades = useMemo(() => {
        // If TWS connected and account selected, show TWS Executions merged with manual trades?
        // OR just simple merge. User asked "trade history too".

        // Let's create Trade objects from executions
        const executionTrades = twsExecutions.map(e => {
            // Determine system from existing positions or manual trades
            const knownTrade = trades.find(t => t.symbol === e.symbol);
            const knownPos = positions.find(p => p.symbol === e.symbol);
            const system = knownTrade ? knownTrade.system : (knownPos && knownPos.systems ? knownPos.systems[0] : 'TWS');

            const dateStr = e.time.substring(0, 8); // YYYYMMDD
            const formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;

            const price = e.price || e.avgPrice || 0;

            return {
                id: `exec_${e.execId}`,
                date: formattedDate,
                system: system as 'NDX' | 'RUI',
                symbol: e.symbol,
                action: e.side === 'BOT' ? 'BUY' : 'SELL' as 'BUY' | 'SELL',
                quantity: e.shares,
                price: price,
                totalValue: e.shares * price,
                importedAt: new Date().toISOString(),
                isExecution: true, // Flag to identify TWS data
                account: e.acctNumber
            };
        });

        // Filter by account if selected
        const visibleExecutions = selectedAccount === 'ALL'
            ? executionTrades
            : executionTrades.filter(t => t.account === selectedAccount);

        const visibleManualTrades = selectedAccount === 'ALL'
            ? trades
            : trades.filter(t => t.account === selectedAccount);

        // Combine
        return [...visibleExecutions, ...visibleManualTrades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [trades, twsExecutions, positions, selectedAccount]);

    // Auto-fetch TWS data on mount and every 30 seconds
    useEffect(() => {
        fetchTwsData();
        const interval = setInterval(fetchTwsData, 30000);
        return () => clearInterval(interval);
    }, [fetchTwsData]);

    // Fetch live prices for positions (Manual AND TWS)
    const fetchLivePrices = useCallback(async () => {
        // Collect unique symbols from both manual positions and Live TWS positions
        const manualSymbols = positions.map(p => p.symbol);
        const twsSymbols = twsPositions.map(p => p.symbol);
        const uniqueSymbols = Array.from(new Set([...manualSymbols, ...twsSymbols]));

        if (uniqueSymbols.length === 0) return;

        setIsLoading(true);
        const newPrices: Record<string, number> = {};

        let symbolsToFetch = [...uniqueSymbols];

        // 1. Try TWS Bridge if connected (Batch fetch)
        if (twsConnected) {
            try {
                const res = await fetch(`${TWS_BRIDGE_URL}/api/market-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols: uniqueSymbols })
                });

                if (res.ok) {
                    const twsData = await res.json();

                    Object.entries(twsData).forEach(([sym, price]) => {
                        // Validate price (must be number > 0)
                        if (typeof price === 'number' && price > 0) {
                            newPrices[sym] = price;
                        }
                    });

                    // Identify symbols that failed to resolve in TWS
                    symbolsToFetch = uniqueSymbols.filter(s => !newPrices[s]);
                }
            } catch (e) {
                console.error('TWS Market Data fetch failed:', e);
            }
        }

        // 2. Fallback to Yahoo for missing symbols
        const updatedPositions = [...positions];

        // Process known prices immediately to update UI faster? 
        // No, let's wait for full batch or partial updates.

        for (const symbol of symbolsToFetch) {
            try {
                const apiUrl = `/api/yahoo?symbol=${encodeURIComponent(symbol)}&range=1d&interval=1d`;
                const res = await fetch(apiUrl);
                if (res.ok) {
                    const data = await res.json();
                    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
                    if (price) {
                        newPrices[symbol] = price;
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch Yahoo price for ${symbol}:`, e);
            }
        }

        // Update State
        setLatestPrices(prev => ({ ...prev, ...newPrices }));

        // Update Manual Positions with new prices
        updatedPositions.forEach(pos => {
            const price = newPrices[pos.symbol];
            if (price) {
                pos.currentPrice = price;
                pos.marketValue = price * pos.quantity;
                pos.pnl = pos.marketValue - (pos.avgCost * pos.quantity);
                pos.pnlPercent = ((price - pos.avgCost) / pos.avgCost) * 100;
            }
        });

        setPositions(updatedPositions);
        saveData(trades, updatedPositions, cashBalance);
        setIsLoading(false);
    }, [positions, twsPositions, trades, cashBalance, saveData, twsConnected]);

    // Parse IBKR Basket Trader CSV file
    // Format: Action,Quantity,Symbol,SecType,Exchange,Currency,TimeInForce,GoodTilDate,GoodAfterTime,OrderType,LmtPrice,AuxPrice,OcaGroup,OrderId,ParentOrderId,BasketTag,Account
    const parseCSV = (content: string, filename?: string): Trade[] => {
        const lines = content.trim().split('\n');
        const trades: Trade[] = [];

        // Extract date from filename like "(Live) NDX_RUI_20260101.csv" or use today
        let tradeDate = new Date().toISOString().split('T')[0];
        if (filename) {
            const dateMatch = filename.match(/(\d{8})/);
            if (dateMatch) {
                const d = dateMatch[1];
                tradeDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
            }
        }

        // Skip header row (first line contains "Action")
        const headerLine = lines[0].toLowerCase();
        const hasHeader = headerLine.includes('action');
        const startIndex = hasHeader ? 1 : 0;

        // Dynamic Column Mapping
        let basketTagIdx = 15; // Default TWS
        let accountIdx = 16;   // Default TWS
        let priceIdx = 10;     // Default LmtPrice

        if (hasHeader) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());

            const btIndex = headers.findIndex(h => h.includes('basket') || h.includes('tag'));
            if (btIndex !== -1) basketTagIdx = btIndex;

            const accIndex = headers.findIndex(h => h.includes('account'));
            if (accIndex !== -1) accountIdx = accIndex;

            const lmtIndex = headers.findIndex(h => h.includes('lmtprice') || h.includes('limit') || h.includes('price'));
            if (lmtIndex !== -1) priceIdx = lmtIndex;
        }

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines

            const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 3) continue;

            // IBKR Basket Trader format (Dynamic Indices):
            const action = cols[0]?.toUpperCase();
            const quantity = parseFloat(cols[1]) || 0;
            const symbol = cols[2] || '';

            // Use dynamic indices
            let price = parseFloat(cols[priceIdx]) || 0;
            const basketTag = cols[basketTagIdx] || '';
            let account = cols[accountIdx] || '';

            // Fallback: Use selected account if CSV doesn't specify
            if (!account && selectedAccount !== 'ALL') {
                account = selectedAccount;
            }

            // Fallback: If price is 0, try to find AvgCost from Live Positions
            if (price === 0) {
                // Find matching position in TWS data (live)
                // We search in all live positions, effectively matching symbol
                const livePos = twsPositions.find(p => p.symbol === symbol && (!account || p.account === account));
                if (livePos && livePos.avgCost > 0) {
                    price = livePos.avgCost; // Use live average cost as best estimate
                }
            }

            // Determine system from BasketTag or Filename or Account
            // Note: We use the just-extracted account variable
            const system = detectSystem(basketTag, filename, account);

            const trade: Trade = {
                id: `${Date.now()}_${i}`,
                date: tradeDate,
                symbol: symbol,
                action: action === 'BUY' ? 'BUY' : 'SELL',
                quantity: Math.abs(quantity),
                price: price, // Use parsed price or AvgCost fallback
                totalValue: Math.abs(quantity) * price,
                system: system,
                importedAt: new Date().toISOString(),
                account: account
            };

            if (trade.symbol && trade.quantity > 0) {
                trades.push(trade);
            }
        }

        return trades;
    };

    // Detect system from BasketTag OR Filename OR Account
    const detectSystem = (basketTag: string, filename?: string, account?: string): 'NDX' | 'RUI' | 'PF' => {
        // 1. Check Account Special Cases
        if (account === 'U15971587') return 'PF';

        const tag = basketTag.toUpperCase();
        // 2. Check BasketTag
        if (tag.includes('NDX') || tag.includes('NASDAQ')) return 'NDX';
        if (tag.includes('RUI') || tag.includes('RUSSELL') || tag.includes('R1000')) return 'RUI';

        // 3. Fallback to Filename
        if (filename) {
            const fname = filename.toUpperCase();
            if (fname.includes('NDX')) return 'NDX';
            if (fname.includes('RUI')) return 'RUI';
        }

        // Default
        return 'RUI';
    };

    // Parse RealTest CSV
    const parseRealTestCSV = (csvContent: string): RealTestTrade[] => {
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const trades: RealTestTrade[] = [];

        // Skip header row (index 0)
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 21) continue;

            // Parse profit - handle parentheses for negative values
            let profitStr = cols[15]?.replace(/[^0-9.-]/g, '') || '0';
            if (cols[15]?.includes('(')) {
                profitStr = '-' + profitStr.replace('-', '');
            }

            const trade: RealTestTrade = {
                tradeId: cols[0]?.trim() || '',
                strategy: cols[1]?.trim() || '',
                symbol: cols[2]?.trim().replace(/-\d+$/, '') || '', // Remove suffix like -202312
                side: cols[3]?.trim() || '',
                dateIn: cols[4]?.trim() || '',
                timeIn: cols[5]?.trim() || '',
                qtyIn: parseFloat(cols[6]) || 0,
                priceIn: parseFloat(cols[7]) || 0,
                dateOut: cols[8]?.trim() || '',
                timeOut: cols[9]?.trim() || '',
                qtyOut: parseFloat(cols[10]) || 0,
                priceOut: parseFloat(cols[11]) || 0,
                reason: cols[12]?.trim() || '',
                profit: parseFloat(profitStr) || 0,
                size: parseFloat(cols[19]?.replace(/[^0-9.-]/g, '')) || 0,
                dividends: parseFloat(cols[20]?.replace(/[^0-9.-]/g, '')) || 0,
                isOpen: cols[12]?.trim().toLowerCase() === 'end of test'
            };

            // Skip BUYandHope strategy - it's just a benchmark (SPY), not actual portfolio
            if (trade.symbol && trade.qtyIn > 0 && trade.strategy !== 'BUYandHope') {
                trades.push(trade);
            }
        }

        return trades;
    };

    // Calculate RealTest Sync Analysis
    const calculateRealTestSync = useCallback((rtTrades: RealTestTrade[]) => {
        // Get Pension Fund TWS data
        const pfAccount = twsAccounts['U15971587'];
        const pfPositions = twsPositions.filter(p => p.account === 'U15971587');

        if (!pfAccount) {
            setError('Pension Fund account (U15971587) not found. Connect to TWS first.');
            return null;
        }

        // Get open positions from RealTest
        const rtOpenPositions = rtTrades.filter(t => t.isOpen);

        // Calculate RT theoretical balance
        // Sum of all profits + starting capital (approximate from first trade size)
        const totalProfit = rtTrades.reduce((sum, t) => sum + t.profit + t.dividends, 0);
        const latestPositionValues = rtOpenPositions.reduce((sum, t) => sum + (t.qtyIn * t.priceIn), 0);
        // Approximate starting capital from pattern
        const rtBalance = latestPositionValues + totalProfit;

        // Calculate RT theoretical cash (balance - open position costs)
        const rtCash = totalProfit; // Simplified: cash = cumulative profits

        // TWS actuals
        const twsBalance = pfAccount.netLiquidation;
        const twsCash = pfAccount.totalCashValue;

        // Position comparison
        const positionComparison = rtOpenPositions.map(rt => {
            const twsMatch = pfPositions.find(p => p.symbol === rt.symbol);
            return {
                symbol: rt.symbol,
                rtQty: rt.qtyIn,
                rtCost: rt.priceIn,
                twsQty: twsMatch?.position || 0,
                twsCost: twsMatch?.avgCost || 0,
                qtyDelta: (twsMatch?.position || 0) - rt.qtyIn,
                valueDelta: twsMatch
                    ? (twsMatch.position * twsMatch.avgCost) - (rt.qtyIn * rt.priceIn)
                    : -(rt.qtyIn * rt.priceIn)
            };
        });

        // Add TWS positions not in RealTest
        pfPositions.forEach(twsPos => {
            if (!rtOpenPositions.find(rt => rt.symbol === twsPos.symbol)) {
                positionComparison.push({
                    symbol: twsPos.symbol,
                    rtQty: 0,
                    rtCost: 0,
                    twsQty: twsPos.position,
                    twsCost: twsPos.avgCost,
                    qtyDelta: twsPos.position,
                    valueDelta: twsPos.position * twsPos.avgCost
                });
            }
        });

        // Calculate drift
        const drift = twsBalance - rtBalance;

        // Calculate recommended adjustment
        // We need: enough cash to cover upcoming buys + buffer
        // Required in RT = RT balance should match TWS balance
        // If TWS > RT: user deposited more IRL than in RealTest → Add Deposit to RT
        // If TWS < RT: user is behind IRL → Add Withdrawal to RT (or deposit IRL)
        const adjustment = drift; // Positive = add deposit to RT, Negative = add withdrawal

        const analysis: RealTestSyncAnalysis = {
            rtBalance,
            twsBalance,
            rtCash,
            twsCash,
            drift,
            positionComparison,
            recommendedAdjustment: Math.abs(adjustment),
            adjustmentType: adjustment > 100 ? 'DEPOSIT' : adjustment < -100 ? 'WITHDRAWAL' : 'NONE'
        };

        setRealTestSyncAnalysis(analysis);
        return analysis;
    }, [twsAccounts, twsPositions]);

    // Handle RealTest CSV Upload
    const handleRealTestUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const trades = parseRealTestCSV(content);
            setRealTestTrades(trades);
            setShowRealTestSync(true);

            // Auto-calculate sync if TWS connected
            if (twsConnected) {
                calculateRealTestSync(trades);
            }
        };
        reader.readAsText(file);
    };

    // Parse IBKR Flex Query CSV for Trade History
    const parseFlexQueryCSV = (csvContent: string): Trade[] => {
        const lines = csvContent.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];

        const trades: Trade[] = [];

        // Skip header row (index 0)
        for (let i = 1; i < lines.length; i++) {
            // Parse CSV with quotes
            const cols = lines[i].match(/("([^"]*)"|[^,]*)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || [];
            if (cols.length < 8) continue;

            const account = cols[0] || '';
            const symbol = cols[1] || '';
            const tradeDateRaw = cols[2] || '';
            const buySell = cols[3] || '';
            const quantity = parseFloat(cols[4]) || 0;
            const price = parseFloat(cols[5]) || 0;

            // Skip MULTI (aggregate) rows and forex pairs
            if (tradeDateRaw === 'MULTI') continue;
            if (symbol.includes('.')) continue; // Skip EUR.USD, GBP.USD etc.

            // Parse date from YYYYMMDD format
            let tradeDate = '';
            if (tradeDateRaw.length === 8) {
                const year = tradeDateRaw.substring(0, 4);
                const month = tradeDateRaw.substring(4, 6);
                const day = tradeDateRaw.substring(6, 8);
                tradeDate = `${year}-${month}-${day}`;
            }

            // Determine action
            const action: 'BUY' | 'SELL' = buySell.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';

            // Determine system based on account
            const system: 'NDX' | 'RUI' | 'PF' = account === 'U15971587' ? 'PF' :
                account === 'U15771225' ? 'NDX' : 'RUI';

            const trade: Trade = {
                id: `flex_${account}_${symbol}_${tradeDateRaw}_${i}`,
                date: tradeDate,
                system: system,
                symbol: symbol,
                action: action,
                quantity: Math.abs(quantity),
                price: price,
                totalValue: Math.abs(quantity) * price,
                importedAt: new Date().toISOString(),
                account: account
            };

            if (trade.symbol && trade.quantity > 0 && trade.date) {
                trades.push(trade);
            }
        }

        return trades;
    };

    // Handle Flex Query CSV Upload
    const handleFlexQueryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        console.log('handleFlexQueryUpload called');
        const file = e.target.files?.[0];
        if (!file) {
            console.log('No file selected');
            return;
        }
        console.log('File selected:', file.name, 'Size:', file.size);

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            console.log('File content loaded, length:', content.length);
            console.log('First 300 chars:', content.substring(0, 300));

            const flexTrades = parseFlexQueryCSV(content);
            console.log('Parsed trades count:', flexTrades.length);
            console.log('Sample trades:', flexTrades.slice(0, 3));

            if (flexTrades.length === 0) {
                alert('No valid trades found in Flex Query CSV.\n\nCheck browser console (F12) for details.');
                return;
            }

            // Merge with existing trades, avoiding duplicates by ID
            const existingIds = new Set(trades.map(t => t.id));
            const newTrades = flexTrades.filter(t => !existingIds.has(t.id));
            console.log('New trades (not duplicates):', newTrades.length);

            if (newTrades.length === 0) {
                alert('All trades from this Flex Query are already imported.');
                return;
            }

            setTrades(prev => [...prev, ...newTrades]);
            alert(`✅ Imported ${newTrades.length} trades from Flex Query!\n\nTotal trades: ${trades.length + newTrades.length}`);
        };
        reader.onerror = (err) => {
            console.error('FileReader error:', err);
            alert('Error reading file');
        };
        reader.readAsText(file);

        // Reset input so same file can be selected again
        e.target.value = '';
    };

    // Smart Rebalancing Calculation
    const calculateSmartRebalance = (csvTrades: Trade[]) => {
        if (!displayedTotals || selectedAccount === 'ALL') {
            alert('Please select a specific account (e.g., U15771225) to use Smart Rebalancing.');
            return null;
        }

        // Safety: If Pension Fund, disable Rebalance for now
        if (selectedAccount === 'U15971587') {
            alert('Smart Rebalancing is not configured for Pension Fund (PF) yet.');
            return null;
        }

        const equity = displayedTotals.netLiquidation;
        const ndxTargetPerPos = (equity * 0.5) / 5;  // $3,000 if equity is $30k
        const ruiTargetPerPos = (equity * 0.5) / 10; // $1,500 if equity is $30k

        // 1. Identify unique symbols from CSV and their systems
        const symbolMap = new Map<string, { systems: Set<string>, price: number }>();

        csvTrades.forEach(t => {
            if (!symbolMap.has(t.symbol)) {
                symbolMap.set(t.symbol, { systems: new Set(), price: t.price });
            }
            symbolMap.get(t.symbol)?.systems.add(t.system);
        });

        const previewData = [];

        // 2. Calculate targets for each symbol
        for (const [symbol, data] of symbolMap.entries()) {
            let targetValue = 0;
            if (data.systems.has('NDX')) targetValue += ndxTargetPerPos;
            if (data.systems.has('RUI')) targetValue += ruiTargetPerPos;

            const price = data.price || 1; // Avoid division by zero
            // Fractional shares support: Round to 2 decimals (User request)
            const targetQty = Number((targetValue / price).toFixed(2));

            // 3. Get current position for THIS account only
            const currentPos = displayedTwsPositions.filter(p => p.account === selectedAccount).find(p => p.symbol === symbol);
            const currentQty = currentPos ? currentPos.position : 0;

            // 4. Calculate Delta
            const delta = targetQty - currentQty;
            let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
            if (delta > 0) action = 'BUY';
            if (delta < 0) action = 'SELL';

            previewData.push({
                symbol,
                system: Array.from(data.systems).join('+'),
                targetValue,
                targetQty,
                currentQty,
                delta,
                action,
                price
            });
        }

        return previewData;
    };

    // Handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const parsedTrades = parseCSV(content, file.name);
                if (parsedTrades.length === 0) {
                    setError('No valid trades found in CSV');
                    return;
                }

                if (isRebalanceMode) {
                    const rebalanceData = calculateSmartRebalance(parsedTrades);
                    if (rebalanceData) {
                        setRebalancePreview(rebalanceData);
                        setCsvPreview(null); // Clear normal preview
                    } else {
                        // If calculation failed (e.g. no account selected), reset file input
                        // Note: event.target here is FileReader, not the input element.
                        // A ref to the input element would be needed for a robust reset.
                        // For now, we'll leave the user's provided line.
                        (e.target as HTMLInputElement).value = '';
                    }
                } else {
                    setCsvPreview(parsedTrades);
                    setRebalancePreview(null);
                }
            } catch (e) {
                setError('Failed to parse CSV file');
            }
        };
        reader.readAsText(file);
    };

    const confirmImport = () => {
        if (rebalancePreview) {
            // Convert Rebalance Preview to Trades
            const newTrades: Trade[] = rebalancePreview
                .filter(p => p.action !== 'HOLD')
                .map(p => ({
                    id: crypto.randomUUID(),
                    date: new Date().toISOString().split('T')[0],
                    system: p.system.includes('NDX') ? 'NDX' : 'RUI', // Simplification for mixed
                    symbol: p.symbol,
                    action: p.action === 'SELL' ? 'SELL' : 'BUY', // Explicitly map action
                    quantity: Math.abs(p.delta),
                    price: p.price,
                    totalValue: Math.abs(p.delta) * p.price,
                    importedAt: new Date().toISOString()
                }));

            const updatedTrades = [...trades, ...newTrades];
            setTrades(updatedTrades);

            // Recalculate positions
            const newPositions = calculatePositions(updatedTrades);
            setPositions(newPositions);

            saveData(updatedTrades, newPositions, cashBalance);
            setRebalancePreview(null);
        } else if (csvPreview) {
            const newTrades = [...trades, ...csvPreview];
            setTrades(newTrades);

            // Recalculate positions
            const newPositions = calculatePositions(newTrades);
            setPositions(newPositions);

            // Update cash balance (optional: logic to deduce cost)
            // For now, just save
            saveData(newTrades, newPositions, cashBalance);
            setCsvPreview(null);
        }
    };

    const cancelImport = () => {
        setCsvPreview(null);
        setRebalancePreview(null);
    };
    // Delete a single trade
    const deleteTrade = (tradeId: string) => {
        const newTrades = trades.filter(t => t.id !== tradeId);
        setTrades(newTrades);
        const newPositions = calculatePositions(newTrades);
        setPositions(newPositions);
        saveData(newTrades, newPositions, cashBalance);
    };

    // Update a trade (quantity, price)
    const updateTrade = (tradeId: string, updates: Partial<Trade>) => {
        const newTrades = trades.map(t => {
            if (t.id === tradeId) {
                const updated = { ...t, ...updates };
                updated.totalValue = updated.quantity * updated.price;
                return updated;
            }
            return t;
        });
        setTrades(newTrades);
        const newPositions = calculatePositions(newTrades);
        setPositions(newPositions);
        saveData(newTrades, newPositions, cashBalance);
        setEditingTradeId(null);
    };

    // Delete a position (removes all trades for that symbol)
    const deletePosition = (symbol: string) => {
        const newTrades = trades.filter(t => t.symbol !== symbol);
        setTrades(newTrades);
        const newPositions = calculatePositions(newTrades);
        setPositions(newPositions);
        saveData(newTrades, newPositions, cashBalance);
    };

    // Update a position (updates avgCost which affects display)
    const updatePosition = (symbol: string, updates: Partial<Position>) => {
        const newPositions = positions.map(p => {
            if (p.symbol === symbol) {
                return { ...p, ...updates };
            }
            return p;
        });
        setPositions(newPositions);
        saveData(trades, newPositions, cashBalance);
        setEditingPositionSymbol(null);
    };

    // Clear all data
    const clearAllData = () => {
        if (confirm('Are you sure you want to delete ALL trades and positions?')) {
            setTrades([]);
            setPositions([]);
            setCashBalance(0);
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    // Calculate positions from all trades - SEPARATE by Symbol + Account
    const calculatePositions = (allTrades: Trade[]): Position[] => {
        const posMap = new Map<string, Position>();

        for (const trade of allTrades) {
            // Use Symbol + Account as key to separate positions
            const key = `${trade.symbol}_${trade.account || 'UNKNOWN'}`;
            const existing = posMap.get(key);

            if (trade.action === 'BUY') {
                if (existing) {
                    const newQty = existing.quantity + trade.quantity;
                    const newCost = ((existing.avgCost * existing.quantity) + trade.totalValue) / newQty;
                    existing.quantity = newQty;
                    existing.avgCost = newCost;
                    // Add system if not already tracked
                    if (!existing.systems.includes(trade.system)) {
                        existing.systems.push(trade.system);
                    }
                } else {
                    posMap.set(key, {
                        symbol: trade.symbol,
                        systems: [trade.system],
                        quantity: trade.quantity,
                        avgCost: trade.price,
                        currentPrice: null,
                        marketValue: null,
                        pnl: null,
                        pnlPercent: null,
                        account: trade.account
                    });
                }
            } else {
                // SELL
                if (existing) {
                    existing.quantity -= trade.quantity;
                    if (existing.quantity <= 0) {
                        posMap.delete(key);
                    }
                }
            }
        }

        return Array.from(posMap.values());
    };



    const filteredPositions = positions.filter(p =>
        (systemFilter === 'ALL' || p.systems.includes(systemFilter)) &&
        (selectedAccount === 'ALL' || p.account === selectedAccount || !p.account)
    );

    // Consolidate filtered positions by symbol (for ALL view where same symbol may appear from multiple accounts)
    const consolidatedFilteredPositions = useMemo(() => {
        const consolidated = new Map<string, Position>();
        for (const pos of filteredPositions) {
            const existing = consolidated.get(pos.symbol);
            if (existing) {
                // Merge: sum quantity, weighted avgCost, combine systems
                const totalQty = existing.quantity + pos.quantity;
                const weightedCost = ((existing.avgCost * existing.quantity) + (pos.avgCost * pos.quantity)) / totalQty;
                existing.quantity = totalQty;
                existing.avgCost = weightedCost;
                // Merge systems
                for (const sys of pos.systems) {
                    if (!existing.systems.includes(sys)) {
                        existing.systems.push(sys);
                    }
                }
                // Update P&L
                if (pos.currentPrice) existing.currentPrice = pos.currentPrice;
                existing.marketValue = existing.currentPrice ? existing.currentPrice * existing.quantity : null;
                existing.pnl = existing.marketValue ? existing.marketValue - (existing.avgCost * existing.quantity) : null;
                existing.pnlPercent = (existing.currentPrice && existing.avgCost)
                    ? ((existing.currentPrice - existing.avgCost) / existing.avgCost) * 100
                    : null;
            } else {
                consolidated.set(pos.symbol, { ...pos, systems: [...pos.systems] });
            }
        }
        return Array.from(consolidated.values());
    }, [filteredPositions]);

    // MERGE LOGIC: Combine TWS Live Data with Manual System Tags
    const finalPositions = (twsConnected && selectedAccount !== 'ALL')
        ? displayedTwsPositions.map(twsPos => {
            // Find matching manual position to get System tags (NDX/RUI) - Match by Symbol AND Account
            const manualMatch = positions.find(p => p.symbol === twsPos.symbol && (p.account === twsPos.account || !p.account));
            const systems = manualMatch ? manualMatch.systems : ['TWS']; // Default to TWS if unknown

            // Reuse price from manual fetch if available, OR use latest fetched price for TWS symbol
            const currentPrice = manualMatch?.currentPrice || latestPrices[twsPos.symbol] || null;
            const marketValue = currentPrice ? (currentPrice * twsPos.position) : null;
            const pnl = (currentPrice && marketValue) ? (marketValue - (twsPos.avgCost * twsPos.position)) : null;
            const pnlPercent = (currentPrice && twsPos.avgCost) ? ((currentPrice - twsPos.avgCost) / twsPos.avgCost) * 100 : null;

            return {
                symbol: twsPos.symbol,
                systems,
                quantity: twsPos.position,
                avgCost: twsPos.avgCost,
                currentPrice,
                marketValue,
                pnl,
                pnlPercent
            };
        }).filter(p => systemFilter === 'ALL' || p.systems.includes(systemFilter))
        : consolidatedFilteredPositions;

    // Calculate totals based on FINAL positions (Live or Manual)
    const totalMarketValue = finalPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalPnL = finalPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const totalEquity = cashBalance + totalMarketValue;

    return (
        <div className="space-y-6">
            {/* TWS Live Dashboard */}
            <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl p-4 border border-blue-500/30">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <span className={`w-3 h-3 rounded-full ${twsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                        <h3 className="text-lg font-bold text-white">IBKR Live</h3>
                        {twsConnected && <span className="text-xs text-emerald-400">Connected</span>}
                    </div>
                    <div className="flex items-center space-x-3">
                        {/* Account Selector */}
                        <select
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                            className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-slate-600 focus:outline-none focus:border-blue-500"
                        >
                            <option value="ALL">All Accounts</option>
                            {Object.keys(twsAccounts).map(acc => (
                                <option key={acc} value={acc}>
                                    {acc === 'U15971587' ? 'Pensijos fondas' : acc === 'U15771225' ? 'MK NDX+RUI' : acc} ({acc})
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={handleTwsRefresh}
                            disabled={isLoading}
                            className={`px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-all flex items-center gap-1 ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            {isLoading ? '⏳...' : '🔄 Refresh'}
                        </button>
                    </div>
                </div>

                {twsError && (
                    <div className="bg-rose-900/30 border border-rose-500/50 rounded-lg p-3 mb-4 text-sm text-rose-300">
                        ⚠️ {twsError}
                        <p className="text-xs mt-1 text-rose-400">Make sure TWS Bridge server is running: <code>cd tws-bridge && npm start</code></p>
                    </div>
                )}

                {displayedTotals && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <div className="text-xs text-slate-400 uppercase">Total Equity</div>
                            <div className="text-2xl font-bold text-white">${displayedTotals.netLiquidation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <div className="text-xs text-slate-400 uppercase">Cash</div>
                            <div className="text-2xl font-bold text-emerald-400">${displayedTotals.totalCashValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                            <div className="text-xs text-slate-400 uppercase">Unrealized P&L</div>
                            <div className={`text-2xl font-bold ${displayedTotals.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {displayedTotals.unrealizedPnL >= 0 ? '+' : ''}${displayedTotals.unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Account breakdown */}


                {/* TWS Positions */}
                {displayedTwsPositions.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs text-slate-400 uppercase mb-2">Live Positions ({displayedTwsPositions.length})</div>
                        <div className="max-h-40 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="text-slate-500 sticky top-0 bg-slate-900/80">
                                    <tr>
                                        <th className="text-left py-1">Symbol</th>
                                        <th className="text-left py-1">Account</th>
                                        <th className="text-right py-1">Qty</th>
                                        <th className="text-right py-1">Avg Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-300">
                                    {displayedTwsPositions.map((p, idx) => (
                                        <tr key={`${p.account}_${p.symbol}_${idx}`} className="border-t border-slate-700/30">
                                            <td className="py-1 font-mono font-bold text-amber-400">{p.symbol}</td>
                                            <td className="py-1 text-slate-500">{p.account}</td>
                                            <td className="py-1 text-right">{p.position.toFixed(2)}</td>
                                            <td className="py-1 text-right">${p.avgCost.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Header with Filter */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <h3 className="text-lg font-semibold text-slate-200">Trade Tracker</h3>
                    <div className="flex bg-slate-800 rounded-lg p-1">
                        {(['ALL', 'NDX', 'RUI'] as const).map(sys => (
                            <button
                                key={sys}
                                onClick={() => setSystemFilter(sys)}
                                className={`px-3 py-1 text-xs font-bold rounded transition-all ${systemFilter === sys
                                    ? 'bg-amber-500 text-black'
                                    : 'text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                {sys}
                            </button>
                        ))}
                    </div>
                </div>
                <button
                    onClick={async () => {
                        await handleTwsRefresh();
                        await fetchLivePrices();
                    }}
                    disabled={isLoading || (positions.length === 0 && !twsConnected)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                >
                    {isLoading ? <span className="animate-spin">⏳</span> : '🔄'}
                    {twsConnected ? 'REFRESH ALL' : 'REFRESH PRICES'}
                </button>
            </div>

            {/* Account Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Cash Balance</p>
                    <p className="text-2xl font-bold text-slate-100 mt-1">
                        ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals
                            ? displayedTotals.totalCashValue
                            : cashBalance
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Positions Value</p>
                    <p className="text-2xl font-bold text-slate-100 mt-1">
                        ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals
                            ? (displayedTotals.netLiquidation - displayedTotals.totalCashValue)
                            : totalMarketValue
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Equity</p>
                    <p className={`text-2xl font-bold mt-1 ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals ? displayedTotals.netLiquidation : totalEquity) >= 100000 ? 'text-amber-400' : 'text-amber-400'}`}>
                        ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals
                            ? displayedTotals.netLiquidation
                            : totalEquity
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Unrealized P&L</p>
                    <p className={`text-2xl font-bold mt-1 ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals ? displayedTotals.unrealizedPnL : totalPnL) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(twsConnected && selectedAccount !== 'ALL' && displayedTotals ? displayedTotals.unrealizedPnL : totalPnL) >= 0 ? '+' : ''}
                        ${(twsConnected && selectedAccount !== 'ALL' && displayedTotals
                            ? displayedTotals.unrealizedPnL
                            : totalPnL
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
            </div>

            {/* Cash Balance Input (Manual Mode Only) */}
            {(!twsConnected || selectedAccount === 'ALL') && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                    <label className="block text-xs text-slate-500 uppercase tracking-wide mb-2">Set Cash Balance</label>
                    <div className="flex items-center space-x-2">
                        <span className="text-slate-400">$</span>
                        <input
                            type="number"
                            value={cashBalance}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setCashBalance(val);
                                saveData(trades, positions, val);
                            }}
                            className="bg-slate-700 text-slate-100 px-3 py-2 rounded-lg w-48 text-right"
                        />
                    </div>
                </div>
            )}

            {/* CSV Upload */}
            <div className="bg-slate-800/30 rounded-lg p-6 border border-dashed border-slate-600 text-center relative">
                {/* Rebalance Mode Toggle */}
                <div className="absolute top-2 right-2 flex items-center space-x-2 bg-slate-800/80 p-2 rounded border border-slate-700">
                    <input
                        type="checkbox"
                        id="rebalanceMode"
                        checked={isRebalanceMode}
                        onChange={(e) => setIsRebalanceMode(e.target.checked)}
                        className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                    />
                    <label htmlFor="rebalanceMode" className="text-xs text-slate-300 font-bold cursor-pointer">
                        Smart Rebalance Mode 🧠
                    </label>
                </div>

                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csvUpload"
                />
                <label
                    htmlFor="csvUpload"
                    className="cursor-pointer block pt-6"
                >
                    <div className="text-4xl mb-2">📁</div>
                    <p className="text-slate-300 font-medium">Upload RealTest CSV</p>
                    <p className="text-xs text-slate-500 mt-1">Click to select or drag & drop</p>
                </label>
                {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}
            </div>

            {/* CSV/Rebalance Preview Modal */}
            {(csvPreview || rebalancePreview) && (
                <div className="bg-slate-800 rounded-lg p-4 border border-amber-500/50">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-amber-400 font-semibold">
                            {rebalancePreview ? 'Smart Rebalance Plan 🧠' : `Preview: ${csvPreview?.length} trades found`}
                        </h4>
                        <div className="flex space-x-2">
                            <button
                                onClick={cancelImport}
                                className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmImport}
                                className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-500"
                            >
                                {rebalancePreview ? 'Execute Rebalance' : 'Import All'}
                            </button>
                        </div>
                    </div>

                    {/* Rebalance Preview Table */}
                    {rebalancePreview && (
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="text-slate-500 uppercase sticky top-0 bg-slate-800">
                                    <tr>
                                        <th className="text-left py-1">Symbol</th>
                                        <th className="text-left py-1">System</th>
                                        <th className="text-right py-1">Target $</th>
                                        <th className="text-right py-1">Target Qty</th>
                                        <th className="text-right py-1">Current (TWS)</th>
                                        <th className="text-right py-1">Delta</th>
                                        <th className="text-center py-1">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-300">
                                    {rebalancePreview.map(p => (
                                        <tr key={p.symbol} className="border-t border-slate-700 hover:bg-slate-700/30">
                                            <td className="py-2 font-mono font-bold text-amber-400">{p.symbol}</td>
                                            <td className="py-2">{p.system}</td>
                                            <td className="py-2 text-right text-blue-300">${p.targetValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                            <td className="py-2 text-right font-bold">{p.targetQty}</td>
                                            <td className="py-2 text-right text-slate-400">{p.currentQty}</td>
                                            <td className={`py-2 text-right font-bold ${p.delta > 0 ? 'text-emerald-400' : p.delta < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                                                {p.delta > 0 ? '+' : ''}{p.delta}
                                            </td>
                                            <td className="py-2 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                                                    p.action === 'SELL' ? 'bg-rose-500/20 text-rose-400' :
                                                        'bg-slate-600/20 text-slate-500'
                                                    }`}>
                                                    {p.action}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Standard CSV Preview Table */}
                    {csvPreview && !rebalancePreview && (
                        <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="text-slate-500 uppercase">
                                    <tr>
                                        <th className="text-left py-1">Date</th>
                                        <th className="text-left py-1">System</th>
                                        <th className="text-left py-1">Symbol</th>
                                        <th className="text-left py-1">Action</th>
                                        <th className="text-right py-1">Qty</th>
                                        <th className="text-right py-1">Price</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-300">
                                    {csvPreview.slice(0, 10).map(t => (
                                        <tr key={t.id} className="border-t border-slate-700">
                                            <td className="py-1">{t.date}</td>
                                            <td className="py-1">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.system === 'NDX' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                                                    }`}>{t.system}</span>
                                            </td>
                                            <td className="py-1 font-mono">{t.symbol}</td>
                                            <td className={`py-1 ${t.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.action}</td>
                                            <td className="py-1 text-right">{t.quantity}</td>
                                            <td className="py-1 text-right">${t.price.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {csvPreview.length > 10 && (
                                <p className="text-slate-500 text-center mt-2">...and {csvPreview.length - 10} more</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Current Positions */}
            {finalPositions.length > 0 && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                    <h4 className="text-slate-300 font-semibold mb-3">
                        {twsConnected && selectedAccount !== 'ALL' ? 'Live TWS Positions 🟢' : 'Current Positions'}
                    </h4>
                    <div>
                        <table className="w-full text-xs">
                            <thead className="text-slate-500 uppercase">
                                <tr>
                                    <th className="text-left py-2">Symbol</th>
                                    <th className="text-left py-2">System</th>
                                    <th className="text-right py-2">Qty</th>
                                    <th className="text-right py-2">Avg Cost</th>
                                    <th className="text-right py-2">Cost Basis</th>
                                    <th className="text-right py-2">Current</th>
                                    <th className="text-right py-2">P&L</th>
                                    {!(twsConnected && selectedAccount !== 'ALL') && (
                                        <th className="text-center py-2">Actions</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {finalPositions.map(p => (
                                    <tr key={p.symbol} className={`border-t border-slate-700/50 hover:bg-slate-700/20 ${twsConnected && selectedAccount !== 'ALL' ? 'bg-slate-800/40' : ''}`}>
                                        <td className="py-2 font-mono font-bold">{p.symbol}</td>
                                        <td className="py-2">
                                            {p.systems.length > 1 ? (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                                                    {p.systems.join(' + ')}
                                                </span>
                                            ) : (
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.systems[0] === 'NDX' ? 'bg-blue-500/20 text-blue-400' :
                                                    p.systems[0] === 'RUI' ? 'bg-purple-500/20 text-purple-400' :
                                                        p.systems[0] === 'PF' ? 'bg-teal-500/20 text-teal-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {p.systems[0]}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {twsConnected && selectedAccount !== 'ALL' ? (
                                                <span className="font-bold text-slate-200">{p.quantity.toFixed(2)}</span>
                                            ) : (
                                                editingPositionSymbol === p.symbol ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={p.quantity}
                                                        className="w-16 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                        onBlur={(e) => updatePosition(p.symbol, { quantity: parseFloat(e.target.value) || 0 })}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span onClick={() => setEditingPositionSymbol(p.symbol)} className="cursor-pointer hover:text-amber-400">{p.quantity.toFixed(2)}</span>
                                                )
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {twsConnected && selectedAccount !== 'ALL' ? (
                                                <span>${p.avgCost.toFixed(2)}</span>
                                            ) : (
                                                editingPositionSymbol === p.symbol ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={p.avgCost}
                                                        className="w-16 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                        onBlur={(e) => updatePosition(p.symbol, { avgCost: parseFloat(e.target.value) || 0 })}
                                                    />
                                                ) : (
                                                    <span onClick={() => setEditingPositionSymbol(p.symbol)} className="cursor-pointer hover:text-amber-400">${p.avgCost.toFixed(2)}</span>
                                                )
                                            )}
                                        </td>
                                        <td className="py-2 text-right font-medium text-slate-400">
                                            ${(p.quantity * p.avgCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="py-2 text-right">
                                            ${p.currentPrice ? p.currentPrice.toFixed(2) : '-'}
                                        </td>
                                        <td className={`py-2 text-right font-bold ${(p.pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                            }`}>
                                            {(p.pnl || 0) >= 0 ? '+' : ''}${p.pnl ? p.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                                            <span className="text-[10px] ml-1 opacity-70">
                                                ({(p.pnlPercent || 0) >= 0 ? '+' : ''}{p.pnlPercent ? p.pnlPercent.toFixed(1) : '-'}%)
                                            </span>
                                        </td>
                                        {!(twsConnected && selectedAccount !== 'ALL') && (
                                            <td className="py-2 text-center text-slate-600">
                                                <button
                                                    onClick={() => deletePosition(p.symbol)}
                                                    className="hover:text-rose-400 transition-colors"
                                                    title="Delete Position"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Trade History - Always visible for Import */}
            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-slate-300 font-semibold">Trade History (Live & Manual)</h4>
                    <div className="flex items-center space-x-3">
                        <span className="text-xs text-slate-500">{finalTrades.length} trades</span>
                        <label className="px-2 py-1 text-[10px] bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 border border-blue-600/30 cursor-pointer">
                            📥 Import Flex Query
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleFlexQueryUpload}
                            />
                        </label>
                        {!twsConnected && trades.length > 0 && (
                            <button
                                onClick={clearAllData}
                                className="px-2 py-1 text-[10px] bg-rose-600/20 text-rose-400 rounded hover:bg-rose-600/30 border border-rose-600/30"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                {finalTrades.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <div className="text-2xl mb-2">📋</div>
                        <p className="text-sm">No trades recorded yet</p>
                        <p className="text-xs mt-1">Import from IBKR Flex Query or add trades manually</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-slate-500 uppercase sticky top-0 bg-slate-800">
                                <tr>
                                    <th className="text-left py-2">Date</th>
                                    <th className="text-left py-2">System</th>
                                    <th className="text-left py-2">Symbol</th>
                                    <th className="text-left py-2">Action</th>
                                    <th className="text-right py-2">Qty</th>
                                    <th className="text-right py-2">Price</th>
                                    <th className="text-right py-2">Total</th>
                                    <th className="text-center py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {finalTrades.map((t: any) => (
                                    <tr key={t.id} className={`border-t border-slate-700/50 hover:bg-slate-700/20 ${t.isExecution ? 'bg-slate-800/40' : ''}`}>
                                        <td className="py-2">
                                            {t.date}
                                            {t.isExecution && <span className="ml-1 text-[10px] text-blue-400">⚡</span>}
                                        </td>
                                        <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.system === 'NDX' ? 'bg-blue-500/20 text-blue-400' : t.system === 'RUI' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-500/20 text-slate-400'
                                                }`}>{t.system}</span>
                                        </td>
                                        <td className="py-2 font-mono">{t.symbol}</td>
                                        <td className={`py-2 font-bold ${t.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {t.action}
                                        </td>
                                        <td className="py-2 text-right">
                                            {t.isExecution ? (
                                                <span className="text-slate-400">{t.quantity.toFixed(2)}</span>
                                            ) : (
                                                editingTradeId === t.id ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={t.quantity}
                                                        className="w-16 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                        onBlur={(e) => updateTrade(t.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span onClick={() => setEditingTradeId(t.id)} className="cursor-pointer hover:text-amber-400">{t.quantity.toFixed(2)}</span>
                                                )
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {t.isExecution ? (
                                                <span className="text-slate-400">${t.price.toFixed(2)}</span>
                                            ) : (
                                                editingTradePriceId === t.id ? (
                                                    <input
                                                        type="number"
                                                        defaultValue={t.price}
                                                        className="w-20 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                        onBlur={(e) => {
                                                            updateTrade(t.id, { price: parseFloat(e.target.value) || 0 });
                                                            setEditingTradePriceId(null);
                                                        }}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span onClick={() => setEditingTradePriceId(t.id)} className="cursor-pointer hover:text-amber-400">${t.price.toFixed(2)}</span>
                                                )
                                            )}
                                        </td>
                                        <td className="py-2 text-right">${t.totalValue.toLocaleString()}</td>
                                        <td className="py-2 text-center">
                                            {t.isExecution ? (
                                                <span className="text-slate-600 cursor-not-allowed" title="TWS Execution (Read-only)">🔒</span>
                                            ) : (
                                                <button
                                                    onClick={() => deleteTrade(t.id)}
                                                    className="text-slate-500 hover:text-rose-400"
                                                    title="Delete trade"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* RealTest Sync Tool */}
            <div className="bg-gradient-to-r from-teal-900/30 to-cyan-900/30 rounded-xl p-4 border border-teal-500/30">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <span className="text-2xl">🔄</span>
                        <h3 className="text-lg font-bold text-white">RealTest ↔ TWS Sync</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">PENSIJA</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <label className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded cursor-pointer transition-all flex items-center gap-1">
                            📁 Upload RealTest CSV
                            <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                onChange={handleRealTestUpload}
                            />
                        </label>
                        {showRealTestSync && (
                            <button
                                onClick={() => setShowRealTestSync(false)}
                                className="text-slate-400 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {showRealTestSync && realTestTrades.length > 0 && (
                    <div className="space-y-4">
                        {/* Account Comparison Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                                <div className="text-xs text-slate-500 uppercase mb-1">RealTest (Theoretical)</div>
                                <div className="text-2xl font-bold text-white">
                                    ${realTestSyncAnalysis?.rtBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {realTestTrades.filter(t => t.isOpen).length} open positions
                                </div>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                                <div className="text-xs text-slate-500 uppercase mb-1">IBKR TWS (Actual)</div>
                                <div className="text-2xl font-bold text-white">
                                    ${realTestSyncAnalysis?.twsBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Cash: ${realTestSyncAnalysis?.twsCash.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '-'}
                                </div>
                            </div>
                            <div className={`rounded-lg p-4 border ${(realTestSyncAnalysis?.drift || 0) >= 0
                                ? 'bg-emerald-900/30 border-emerald-500/30'
                                : 'bg-rose-900/30 border-rose-500/30'
                                }`}>
                                <div className="text-xs text-slate-500 uppercase mb-1">Drift (TWS - RT)</div>
                                <div className={`text-2xl font-bold ${(realTestSyncAnalysis?.drift || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}>
                                    {(realTestSyncAnalysis?.drift || 0) >= 0 ? '+' : ''}
                                    ${realTestSyncAnalysis?.drift.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    {(realTestSyncAnalysis?.drift || 0) >= 0 ? '▲ Outperforming' : '▼ Underperforming'}
                                </div>
                            </div>
                        </div>

                        {/* Recommendation Banner */}
                        {realTestSyncAnalysis && realTestSyncAnalysis.adjustmentType !== 'NONE' && (
                            <div className={`rounded-lg p-4 border ${realTestSyncAnalysis.adjustmentType === 'DEPOSIT'
                                ? 'bg-emerald-900/20 border-emerald-500/30'
                                : 'bg-amber-900/20 border-amber-500/30'
                                }`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-3">
                                        <span className="text-2xl">💡</span>
                                        <div>
                                            <div className={`font-bold ${realTestSyncAnalysis.adjustmentType === 'DEPOSIT' ? 'text-emerald-400' : 'text-amber-400'
                                                }`}>
                                                Add a {realTestSyncAnalysis.adjustmentType} of ${realTestSyncAnalysis.recommendedAdjustment.toLocaleString(undefined, { maximumFractionDigits: 0 })} to RealTest
                                            </div>
                                            <div className="text-xs text-slate-400 mt-0.5">
                                                This syncs RealTest balance with IBKR so signals are sized correctly
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CSV Entry Generator */}
                                <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-600">
                                    <div className="text-xs text-slate-400 mb-2">
                                        📋 Copy this line to your RealTest deposit/withdrawal CSV file:
                                    </div>
                                    <div className="flex items-center justify-between bg-slate-900/50 rounded px-3 py-2 font-mono text-sm">
                                        <span className="text-teal-300">
                                            {(() => {
                                                const today = new Date();
                                                const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
                                                const amount = realTestSyncAnalysis.adjustmentType === 'DEPOSIT'
                                                    ? realTestSyncAnalysis.recommendedAdjustment
                                                    : -realTestSyncAnalysis.recommendedAdjustment;
                                                return `${dateStr},${amount.toFixed(0)}`;
                                            })()}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const today = new Date();
                                                const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
                                                const amount = realTestSyncAnalysis.adjustmentType === 'DEPOSIT'
                                                    ? realTestSyncAnalysis.recommendedAdjustment
                                                    : -realTestSyncAnalysis.recommendedAdjustment;
                                                const csvLine = `${dateStr},${amount.toFixed(0)}`;
                                                navigator.clipboard.writeText(csvLine);
                                                alert(`✅ Copied to clipboard!\n\nPaste this into your RealTest deposit/withdrawal CSV file:\n${csvLine}`);
                                            }}
                                            className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded"
                                        >
                                            📋 Copy CSV Line
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-2">
                                        Format: Date,Amount (positive = deposit, negative = withdrawal)
                                    </div>
                                </div>

                                {/* Why This Adjustment */}
                                <div className="mt-3 text-xs text-slate-500">
                                    <span className="font-semibold text-slate-400">Why?</span> TWS balance is ${realTestSyncAnalysis.twsBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    but RealTest thinks it's ${realTestSyncAnalysis.rtBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}.
                                    Adding this {realTestSyncAnalysis.adjustmentType.toLowerCase()} ensures RealTest generates signals
                                    based on your actual available capital.
                                </div>
                            </div>
                        )}

                        {/* Position Comparison Table */}
                        {realTestSyncAnalysis && realTestSyncAnalysis.positionComparison.length > 0 && (
                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                                <h4 className="text-slate-300 font-semibold mb-3">Position Comparison</h4>
                                <table className="w-full text-xs">
                                    <thead className="text-slate-500 uppercase">
                                        <tr>
                                            <th className="text-left py-2">Symbol</th>
                                            <th className="text-right py-2">RT Qty</th>
                                            <th className="text-right py-2">RT Cost</th>
                                            <th className="text-right py-2">TWS Qty</th>
                                            <th className="text-right py-2">TWS Cost</th>
                                            <th className="text-right py-2">Qty Δ</th>
                                            <th className="text-right py-2">Value Δ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-300">
                                        {realTestSyncAnalysis.positionComparison.map(p => (
                                            <tr key={p.symbol} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                                <td className="py-2 font-mono font-bold">{p.symbol}</td>
                                                <td className="py-2 text-right">{p.rtQty}</td>
                                                <td className="py-2 text-right">${p.rtCost.toFixed(2)}</td>
                                                <td className="py-2 text-right">{Math.round(p.twsQty * 100) / 100}</td>
                                                <td className="py-2 text-right">${p.twsCost.toFixed(2)}</td>
                                                <td className={`py-2 text-right font-bold ${Math.round(p.qtyDelta) === 0 ? 'text-slate-500' : p.qtyDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                    {Math.round(p.qtyDelta) === 0 ? '-' : (p.qtyDelta > 0 ? '+' : '') + Math.round(p.qtyDelta)}
                                                </td>
                                                <td className={`py-2 text-right font-bold ${Math.abs(p.valueDelta) < 10 ? 'text-slate-500' : p.valueDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                                    }`}>
                                                    {Math.abs(p.valueDelta) < 10 ? '-' : (p.valueDelta > 0 ? '+$' : '-$') + Math.abs(p.valueDelta).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Timing Warning */}
                        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-xs">
                            <span className="text-amber-400 font-semibold">⚠️ Timing Note:</span>
                            <span className="text-slate-400 ml-1">
                                RealTest CSV is EOD data. If you've already executed today's signals in TWS,
                                positions will mismatch until RealTest generates a new trade list.
                                Upload CSV <strong>before</strong> executing signals for accurate sync.
                            </span>
                        </div>

                        {/* Trade Summary */}
                        <div className="text-xs text-slate-500 text-center">
                            Loaded {realTestTrades.length} trades from RealTest • {realTestTrades.filter(t => t.isOpen).length} open positions
                        </div>
                    </div>
                )}

                {!showRealTestSync && (
                    <div className="text-center py-6 text-slate-500">
                        <p className="text-sm">Upload your RealTest trade list CSV to compare theoretical vs actual positions</p>
                        <p className="text-xs mt-1 opacity-70">Supports C:\RealTest\Scripts\MK\Pensija.csv format</p>
                    </div>
                )}
            </div>

            {/* Empty State */}
            {trades.length === 0 && !csvPreview && (
                <div className="text-center py-12 text-slate-500">
                    <div className="text-5xl mb-4">📊</div>
                    <p>No trades imported yet</p>
                    <p className="text-sm mt-1">Upload a RealTest CSV to get started</p>
                </div>
            )}
        </div>
    );
}
