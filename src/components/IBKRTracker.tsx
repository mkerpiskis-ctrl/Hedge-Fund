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
    system: 'NDX' | 'RUI';
    quantity: number;
    avgCost: number;
    currentPrice: number | null;
    marketValue: number | null;
    pnl: number | null;
    pnlPercent: number | null;
}

const STORAGE_KEY = 'ibkr_tracker_v1';

export default function IBKRTracker() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [cashBalance, setCashBalance] = useState<number>(0);
    const [systemFilter, setSystemFilter] = useState<'ALL' | 'NDX' | 'RUI'>('ALL');
    const [isLoading, setIsLoading] = useState(false);
    const [csvPreview, setCsvPreview] = useState<Trade[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load data from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                setTrades(data.trades || []);
                setPositions(data.positions || []);
                setCashBalance(data.cashBalance || 0);
            }
        } catch (e) {
            console.error('Failed to load IBKR data:', e);
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

    // Parse CSV file
    const parseCSV = (content: string): Trade[] => {
        const lines = content.trim().split('\n');
        const trades: Trade[] = [];

        // Skip header row if present
        const startIndex = lines[0].toLowerCase().includes('symbol') ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 5) continue;

            // Try to parse RealTest format
            // Typical format: Date, Symbol, Action, Quantity, Price
            const trade: Trade = {
                id: `${Date.now()}_${i}`,
                date: cols[0] || new Date().toISOString().split('T')[0],
                symbol: cols[1] || '',
                action: cols[2]?.toUpperCase().includes('BUY') ? 'BUY' : 'SELL',
                quantity: Math.abs(parseFloat(cols[3]) || 0),
                price: parseFloat(cols[4]) || 0,
                totalValue: 0,
                system: detectSystem(cols[1] || ''),
                importedAt: new Date().toISOString()
            };
            trade.totalValue = trade.quantity * trade.price;

            if (trade.symbol && trade.quantity > 0) {
                trades.push(trade);
            }
        }

        return trades;
    };

    // Detect system based on symbol (can be enhanced)
    const detectSystem = (symbol: string): 'NDX' | 'RUI' => {
        // This is a placeholder - user can adjust mapping
        // For now, alternate or use first letter
        return symbol.charCodeAt(0) % 2 === 0 ? 'NDX' : 'RUI';
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
                const parsed = parseCSV(content);
                if (parsed.length === 0) {
                    setError('No valid trades found in CSV');
                    return;
                }
                setCsvPreview(parsed);
            } catch (e) {
                setError('Failed to parse CSV file');
            }
        };
        reader.readAsText(file);
    };

    // Import previewed trades
    const importTrades = () => {
        if (!csvPreview) return;

        const newTrades = [...trades, ...csvPreview];
        setTrades(newTrades);

        // Update positions based on new trades
        const newPositions = calculatePositions(newTrades);
        setPositions(newPositions);

        saveData(newTrades, newPositions, cashBalance);
        setCsvPreview(null);
    };

    // Calculate positions from all trades
    const calculatePositions = (allTrades: Trade[]): Position[] => {
        const posMap = new Map<string, Position>();

        for (const trade of allTrades) {
            const key = `${trade.symbol}_${trade.system}`;
            const existing = posMap.get(key);

            if (trade.action === 'BUY') {
                if (existing) {
                    const newQty = existing.quantity + trade.quantity;
                    const newCost = ((existing.avgCost * existing.quantity) + trade.totalValue) / newQty;
                    existing.quantity = newQty;
                    existing.avgCost = newCost;
                } else {
                    posMap.set(key, {
                        symbol: trade.symbol,
                        system: trade.system,
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
        : positions.filter(p => p.system === systemFilter);

    // Calculate totals
    const totalMarketValue = filteredPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalPnL = filteredPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const totalEquity = cashBalance + totalMarketValue;

    return (
        <div className="space-y-6">
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
            <div className="bg-slate-800/30 rounded-lg p-6 border border-dashed border-slate-600 text-center">
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csvUpload"
                />
                <label
                    htmlFor="csvUpload"
                    className="cursor-pointer block"
                >
                    <div className="text-4xl mb-2">📁</div>
                    <p className="text-slate-300 font-medium">Upload RealTest CSV</p>
                    <p className="text-xs text-slate-500 mt-1">Click to select or drag & drop</p>
                </label>
                {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}
            </div>

            {/* CSV Preview Modal */}
            {csvPreview && (
                <div className="bg-slate-800 rounded-lg p-4 border border-amber-500/50">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-amber-400 font-semibold">Preview: {csvPreview.length} trades found</h4>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setCsvPreview(null)}
                                className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={importTrades}
                                className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-500"
                            >
                                Import All
                            </button>
                        </div>
                    </div>
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
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {filteredPositions.map(p => (
                                    <tr key={`${p.symbol}_${p.system}`} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                        <td className="py-2 font-mono font-bold">{p.symbol}</td>
                                        <td className="py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.system === 'NDX' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                                                }`}>{p.system}</span>
                                        </td>
                                        <td className="py-2 text-right">{p.quantity}</td>
                                        <td className="py-2 text-right">${p.avgCost.toFixed(2)}</td>
                                        <td className="py-2 text-right">{p.currentPrice ? `$${p.currentPrice.toFixed(2)}` : '—'}</td>
                                        <td className="py-2 text-right">{p.marketValue ? `$${p.marketValue.toLocaleString()}` : '—'}</td>
                                        <td className={`py-2 text-right font-bold ${(p.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {p.pnl !== null ? `${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(0)}` : '—'}
                                            {p.pnlPercent !== null && (
                                                <span className="text-slate-500 ml-1">({p.pnlPercent >= 0 ? '+' : ''}{p.pnlPercent.toFixed(1)}%)</span>
                                            )}
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
                        <span className="text-xs text-slate-500">{filteredTrades.length} trades</span>
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
                                        <td className="py-2 text-right">{t.quantity}</td>
                                        <td className="py-2 text-right">${t.price.toFixed(2)}</td>
                                        <td className="py-2 text-right">${t.totalValue.toLocaleString()}</td>
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
