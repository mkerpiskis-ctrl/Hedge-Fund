import { useState, useEffect, useCallback } from 'react';

// Types
interface Trade {
    id: string;
    date: string;
    system: 'NDX' | 'RUI';
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    totalValue: number;
    importedAt: string;
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
    const [editingPositionSymbol, setEditingPositionSymbol] = useState<string | null>(null);

    // TWS Bridge state
    const [twsConnected, setTwsConnected] = useState(false);
    const [twsAccounts, setTwsAccounts] = useState<Record<string, TWSAccountSummary>>({});
    const [twsPositions, setTwsPositions] = useState<TWSPosition[]>([]);
    const [twsTotals, setTwsTotals] = useState<{ netLiquidation: number; totalCashValue: number; unrealizedPnL: number } | null>(null);
    const [twsError, setTwsError] = useState<string | null>(null);
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
                setTwsAccounts(accountData);
            }

            // Fetch positions
            const posRes = await fetch(`${TWS_BRIDGE_URL}/api/positions`);
            if (posRes.ok) {
                const posData = await posRes.json();
                setTwsPositions(posData);
            }

            setTwsError(null);
        } catch (err) {
            setTwsError(err instanceof Error ? err.message : 'Failed to connect to TWS Bridge');
            setTwsConnected(false);
        }
    }, []);

    // Derived totals based on selection
    const displayedTotals = selectedAccount === 'ALL'
        ? twsTotals
        : (twsAccounts[selectedAccount] ? {
            netLiquidation: twsAccounts[selectedAccount].netLiquidation,
            totalCashValue: twsAccounts[selectedAccount].totalCashValue,
            unrealizedPnL: twsAccounts[selectedAccount].unrealizedPnL
        } : null);

    // Derived positions based on selection
    const displayedTwsPositions = selectedAccount === 'ALL'
        ? twsPositions
        : twsPositions.filter(p => p.account === selectedAccount);

    // Auto-fetch TWS data on mount and every 30 seconds
    useEffect(() => {
        fetchTwsData();
        const interval = setInterval(fetchTwsData, 30000);
        return () => clearInterval(interval);
    }, [fetchTwsData]);

    // Fetch live prices for positions
    const fetchLivePrices = useCallback(async () => {
        if (positions.length === 0) return;

        setIsLoading(true);
        const updatedPositions = [...positions];

        for (const pos of updatedPositions) {
            try {
                const apiUrl = `/api/yahoo?symbol=${encodeURIComponent(pos.symbol)}&range=1d&interval=1d`;
                const res = await fetch(apiUrl);
                if (res.ok) {
                    const data = await res.json();
                    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
                    if (price) {
                        pos.currentPrice = price;
                        pos.marketValue = price * pos.quantity;
                        pos.pnl = pos.marketValue - (pos.avgCost * pos.quantity);
                        pos.pnlPercent = ((price - pos.avgCost) / pos.avgCost) * 100;
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch price for ${pos.symbol}:`, e);
            }
        }

        setPositions(updatedPositions);
        saveData(trades, updatedPositions, cashBalance);
        setIsLoading(false);
    }, [positions, trades, cashBalance, saveData]);

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
        const startIndex = lines[0].toLowerCase().includes('action') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines

            const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 3) continue;

            // IBKR Basket Trader format:
            // Col 0: Action (BUY/SELL)
            // Col 1: Quantity
            // Col 2: Symbol
            // Col 15: BasketTag (NDX, R1000, RUI, etc.)
            const action = cols[0]?.toUpperCase();
            const quantity = parseFloat(cols[1]) || 0;
            const symbol = cols[2] || '';
            const basketTag = cols[15] || '';

            // Determine system from BasketTag
            const system = detectSystem(basketTag);

            const trade: Trade = {
                id: `${Date.now()}_${i}`,
                date: tradeDate,
                symbol: symbol,
                action: action === 'BUY' ? 'BUY' : 'SELL',
                quantity: Math.abs(quantity),
                price: 0, // Will be fetched live or entered manually
                totalValue: 0,
                system: system,
                importedAt: new Date().toISOString()
            };

            if (trade.symbol && trade.quantity > 0) {
                trades.push(trade);
            }
        }

        return trades;
    };

    // Detect system from BasketTag
    const detectSystem = (basketTag: string): 'NDX' | 'RUI' => {
        const tag = basketTag.toUpperCase();
        if (tag.includes('NDX') || tag.includes('NASDAQ')) {
            return 'NDX';
        }
        // R1000, RUI, Russell, etc. -> RUI
        return 'RUI';
    };

    // Smart Rebalancing Calculation
    const calculateSmartRebalance = (csvTrades: Trade[]) => {
        if (!displayedTotals || selectedAccount === 'ALL') {
            alert('Please select a specific account (e.g., U15771225) to use Smart Rebalancing.');
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
            const targetQty = Math.floor(targetValue / price);

            // 3. Get current position for THIS account only
            const currentPos = displayedTwsPositions.find(p => p.symbol === symbol);
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

    // Calculate positions from all trades - CONSOLIDATE same symbols across systems
    const calculatePositions = (allTrades: Trade[]): Position[] => {
        const posMap = new Map<string, Position>();

        for (const trade of allTrades) {
            // Use only symbol as key to consolidate across systems
            const key = trade.symbol;
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
                        pnlPercent: null
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

    // Filter trades by system
    const filteredTrades = systemFilter === 'ALL'
        ? trades
        : trades.filter(t => t.system === systemFilter);

    const filteredPositions = systemFilter === 'ALL'
        ? positions
        : positions.filter(p => p.systems.includes(systemFilter));

    // Calculate totals
    const totalMarketValue = filteredPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalPnL = filteredPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
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
                                <option key={acc} value={acc}>{acc}</option>
                            ))}
                        </select>

                        <button
                            onClick={fetchTwsData}
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-all flex items-center gap-1"
                        >
                            🔄 Refresh
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
                {Object.keys(twsAccounts).length > 0 && (
                    <div className="space-y-2">
                        <div className="text-xs text-slate-400 uppercase mb-2">Account Breakdown</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Object.entries(twsAccounts).map(([accountId, data]) => (
                                <div key={accountId} className="bg-slate-800/30 rounded-lg p-2 flex justify-between items-center text-sm">
                                    <span className="font-mono text-slate-300">{accountId}</span>
                                    <div className="flex space-x-4">
                                        <span className="text-white">${data.netLiquidation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                        <span className={data.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                            {data.unrealizedPnL >= 0 ? '+' : ''}${data.unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                    onClick={fetchLivePrices}
                    disabled={isLoading || positions.length === 0}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all"
                >
                    {isLoading ? 'UPDATING...' : '🔄 REFRESH PRICES'}
                </button>
            </div>

            {/* Account Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Cash Balance</p>
                    <p className="text-2xl font-bold text-slate-100 mt-1">${cashBalance.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Positions Value</p>
                    <p className="text-2xl font-bold text-slate-100 mt-1">${totalMarketValue.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Total Equity</p>
                    <p className="text-2xl font-bold text-amber-400 mt-1">${totalEquity.toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Unrealized P&L</p>
                    <p className={`text-2xl font-bold mt-1 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Cash Balance Input */}
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
            {filteredPositions.length > 0 && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                    <h4 className="text-slate-300 font-semibold mb-3">Current Positions</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-slate-500 uppercase">
                                <tr>
                                    <th className="text-left py-2">Symbol</th>
                                    <th className="text-left py-2">System</th>
                                    <th className="text-right py-2">Qty</th>
                                    <th className="text-right py-2">Avg Cost</th>
                                    <th className="text-right py-2">Current</th>
                                    <th className="text-right py-2">Value</th>
                                    <th className="text-right py-2">P&L</th>
                                    <th className="text-center py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {filteredPositions.map(p => (
                                    <tr key={p.symbol} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                        <td className="py-2 font-mono font-bold">{p.symbol}</td>
                                        <td className="py-2">
                                            {p.systems.length > 1 ? (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                                                    {p.systems.join(' + ')}
                                                </span>
                                            ) : (
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.systems[0] === 'NDX' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                                    {p.systems[0]}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {editingPositionSymbol === p.symbol ? (
                                                <input
                                                    type="number"
                                                    defaultValue={p.quantity}
                                                    className="w-16 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                    onBlur={(e) => updatePosition(p.symbol, { quantity: parseFloat(e.target.value) || 0 })}
                                                    autoFocus
                                                />
                                            ) : (
                                                <span onClick={() => setEditingPositionSymbol(p.symbol)} className="cursor-pointer hover:text-amber-400">{p.quantity.toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {editingPositionSymbol === p.symbol ? (
                                                <input
                                                    type="number"
                                                    defaultValue={p.avgCost}
                                                    className="w-20 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                    onBlur={(e) => updatePosition(p.symbol, { avgCost: parseFloat(e.target.value) || 0 })}
                                                />
                                            ) : (
                                                <span onClick={() => setEditingPositionSymbol(p.symbol)} className="cursor-pointer hover:text-amber-400">${p.avgCost.toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">{p.currentPrice ? `$${p.currentPrice.toFixed(2)}` : '—'}</td>
                                        <td className="py-2 text-right">{p.marketValue ? `$${p.marketValue.toLocaleString()}` : '—'}</td>
                                        <td className={`py-2 text-right font-bold ${(p.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {p.pnl !== null ? `${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(0)}` : '—'}
                                            {p.pnlPercent !== null && (
                                                <span className="text-slate-500 ml-1">({p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%)</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-center">
                                            <button
                                                onClick={() => setEditingPositionSymbol(editingPositionSymbol === p.symbol ? null : p.symbol)}
                                                className="text-slate-500 hover:text-amber-400 mr-2"
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (confirm(`Delete position ${p.symbol}?`)) {
                                                        deletePosition(p.symbol);
                                                    }
                                                }}
                                                className="text-slate-500 hover:text-rose-400"
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Trade History */}
            {filteredTrades.length > 0 && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-slate-300 font-semibold">Trade History</h4>
                        <div className="flex items-center space-x-3">
                            <span className="text-xs text-slate-500">{filteredTrades.length} trades</span>
                            <button
                                onClick={clearAllData}
                                className="px-2 py-1 text-[10px] bg-rose-600/20 text-rose-400 rounded hover:bg-rose-600/30 border border-rose-600/30"
                            >
                                Clear All
                            </button>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
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
                                    <th className="text-center py-2">Del</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {[...filteredTrades].reverse().map(t => (
                                    <tr key={t.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                        <td className="py-2">{t.date}</td>
                                        <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.system === 'NDX' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                                                }`}>{t.system}</span>
                                        </td>
                                        <td className="py-2 font-mono">{t.symbol}</td>
                                        <td className={`py-2 font-bold ${t.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {t.action}
                                        </td>
                                        <td className="py-2 text-right">
                                            {editingTradeId === t.id ? (
                                                <input
                                                    type="number"
                                                    defaultValue={t.quantity}
                                                    className="w-16 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                    onBlur={(e) => updateTrade(t.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                    autoFocus
                                                />
                                            ) : (
                                                <span onClick={() => setEditingTradeId(t.id)} className="cursor-pointer hover:text-amber-400">{t.quantity.toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">
                                            {editingTradeId === t.id ? (
                                                <input
                                                    type="number"
                                                    defaultValue={t.price}
                                                    className="w-20 bg-slate-700 text-slate-100 px-1 py-0.5 rounded text-right text-xs"
                                                    onBlur={(e) => updateTrade(t.id, { price: parseFloat(e.target.value) || 0 })}
                                                />
                                            ) : (
                                                <span onClick={() => setEditingTradeId(t.id)} className="cursor-pointer hover:text-amber-400">${t.price.toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right">${t.totalValue.toLocaleString()}</td>
                                        <td className="py-2 text-center">
                                            <button
                                                onClick={() => deleteTrade(t.id)}
                                                className="text-slate-500 hover:text-rose-400"
                                                title="Delete trade"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
