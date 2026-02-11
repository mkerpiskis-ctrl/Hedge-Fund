import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// ============= Types =============
interface SetupCategory {
    id: string;
    name: string;
    criteria: string[];
    color: string;
}

interface JournalEntry {
    id: string;
    date: string;
    time: string;
    symbol: string;
    tickValue: number; // Value per 1 point move (e.g. 5 for MES)
    setupId: string;
    criteriaUsed: string[];
    entry: number;
    exit: number;
    stopLoss: number;
    takeProfit: number;
    maxMove: number;
    quantity: number;
    commissions: number;
    pnl: number;
    pnlPercent: number;
    rMultiple: number;
    result: 'WIN' | 'LOSS' | 'BREAKEVEN';
    images: string[];
    notes: string;
}

// Default setup categories
const DEFAULT_SETUPS: SetupCategory[] = [
    { id: 'pullback', name: 'Pullback', criteria: ['HTF EMA20 Price', 'HTF Trend Direction'], color: 'blue' },
    { id: 'fakeout', name: 'Fakeout', criteria: ['HTF VWAP Price', 'LTF Volume Spike'], color: 'purple' },
    { id: 'breakout', name: 'Breakout', criteria: ['Key Level Break', 'Volume Confirmation'], color: 'emerald' },
];

// Default global criteria
const DEFAULT_CRITERIA = [
    'Trend Direction',
    'EMA 20 Context',
    'VWAP Context',
    'Volume Profile',
    'Opening Range',
    'Key Level Break',
    'CVD Divergence',
];

// Futures Config
const FUTURES_SYMBOLS: Record<string, { pointValue: number, commission: number }> = {
    'MES': { pointValue: 5, commission: 1.82 },
    'ES': { pointValue: 50, commission: 4.02 },
    'MNQ': { pointValue: 2, commission: 1.82 },
    'NQ': { pointValue: 20, commission: 4.02 },
    'MYM': { pointValue: 0.5, commission: 1.82 },
    'YM': { pointValue: 5, commission: 4.02 },
    'M2K': { pointValue: 5, commission: 1.82 },
    'RTY': { pointValue: 50, commission: 4.02 },
    'CL': { pointValue: 1000, commission: 4.02 },
    'MCL': { pointValue: 100, commission: 1.82 },
    'GC': { pointValue: 100, commission: 4.02 },
    'MGC': { pointValue: 10, commission: 1.82 },
};

const TradingJournal = () => {
    // ============= State =============
    const [entries, setEntries] = useState<JournalEntry[]>(() => {
        const saved = localStorage.getItem('tradingJournalEntries');
        return saved ? JSON.parse(saved) : [];
    });

    const [setups, setSetups] = useState<SetupCategory[]>(() => {
        const saved = localStorage.getItem('tradingJournalSetups');
        return saved ? JSON.parse(saved) : DEFAULT_SETUPS;
    });

    const [activeSubTab, setActiveSubTab] = useState<'history' | 'totalStats' | 'setupStats'>('history');

    const [criteriaLibrary, setCriteriaLibrary] = useState<string[]>(() => {
        const saved = localStorage.getItem('tradingJournalCriteria');
        return saved ? JSON.parse(saved) : DEFAULT_CRITERIA;
    });

    // Filters
    const [filterSetup, setFilterSetup] = useState<string>('all');
    const [filterCriteria, setFilterCriteria] = useState<string[]>([]);

    // UI State
    const [showNewEntry, setShowNewEntry] = useState(false);
    const [showSetupManager, setShowSetupManager] = useState(false);
    const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
    const [imageModal, setImageModal] = useState<{ src: string; zoom: number; x: number; y: number } | null>(null);
    const dragRef = useRef({ startX: 0, startY: 0, lastX: 0, lastY: 0, isDragging: false });

    // Setup Manager State
    const [newSetupName, setNewSetupName] = useState('');
    const [newCriteria, setNewCriteria] = useState('');
    const [selectedSetupForCriteria, setSelectedSetupForCriteria] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        symbol: 'MES',
        tickValue: '5',
        setupId: '',
        criteriaUsed: [] as string[],
        stopLoss: '',
        takeProfit: '',
        entry: '',
        exit: '',
        maxMove: '',
        quantity: '1',
        commissions: '',
        notes: '',
        images: [] as string[],
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ============= Effects =============
    useEffect(() => {
        localStorage.setItem('tradingJournalEntries', JSON.stringify(entries));
    }, [entries]);

    useEffect(() => {
        localStorage.setItem('tradingJournalSetups', JSON.stringify(setups));
    }, [setups]);

    useEffect(() => {
        localStorage.setItem('tradingJournalCriteria', JSON.stringify(criteriaLibrary));
    }, [criteriaLibrary]);

    // ============= Calculations =============
    const calculateStats = useCallback((entriesToCalc: JournalEntry[]) => {
        const totalTrades = entriesToCalc.length;
        const wins = entriesToCalc.filter(e => e.result === 'WIN').length;
        const losses = entriesToCalc.filter(e => e.result === 'LOSS').length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const totalPnl = entriesToCalc.reduce((sum, e) => sum + e.pnl, 0);
        const totalPnlPercent = entriesToCalc.reduce((sum, e) => sum + e.pnlPercent, 0); // Not strictly accurate summation but indicative
        const avgR = totalTrades > 0 ? entriesToCalc.reduce((sum, e) => sum + e.rMultiple, 0) / totalTrades : 0;
        const avgWinR = wins > 0 ? entriesToCalc.filter(e => e.result === 'WIN').reduce((sum, e) => sum + e.rMultiple, 0) / wins : 0;
        const avgLossR = losses > 0 ? entriesToCalc.filter(e => e.result === 'LOSS').reduce((sum, e) => sum + Math.abs(e.rMultiple), 0) / losses : 0;
        const profitFactor = Math.abs(entriesToCalc.filter(e => e.result === 'LOSS').reduce((sum, e) => sum + e.pnl, 0)) > 0
            ? entriesToCalc.filter(e => e.result === 'WIN').reduce((sum, e) => sum + e.pnl, 0) / Math.abs(entriesToCalc.filter(e => e.result === 'LOSS').reduce((sum, e) => sum + e.pnl, 0))
            : (wins > 0 ? 999 : 0);

        return { totalTrades, wins, losses, winRate, totalPnl, totalPnlPercent, avgR, avgWinR, avgLossR, profitFactor };
    }, []);

    // Filtered entries helper (Memoized)
    const filteredEntries = useMemo(() => {
        let filtered = entries;

        // 1. Filter by Setup
        if (filterSetup !== 'all') {
            filtered = filtered.filter(e => e.setupId === filterSetup);
        }

        // 2. Filter by Criteria
        if (filterCriteria.length > 0) {
            console.log('Filtering by criteria:', filterCriteria);
            filtered = filtered.filter(e => {
                const hasAll = filterCriteria.every(c =>
                    e.criteriaUsed?.some(ec => ec.trim().toLowerCase() === c.trim().toLowerCase())
                );
                // Debug individual entry check
                // if (!hasAll) console.log(`Entry ${e.id} excluded. Has: ${e.criteriaUsed}`);
                return hasAll;
            });
        }

        console.log(`Filtered count: ${filtered.length} (Setup: ${filterSetup}, Criteria: ${filterCriteria.length})`);
        return filtered;
    }, [entries, filterSetup, filterCriteria]);

    const currentStats = useMemo(() => calculateStats(filteredEntries), [filteredEntries, calculateStats]);

    // Analytics Data
    const equityCurveData = useMemo(() => {
        let cumulative = 0;
        return filteredEntries
            .sort((a, b) => new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime())
            .map(e => {
                cumulative += e.pnl;
                return {
                    date: e.date,
                    equity: cumulative,
                    pnl: e.pnl
                };
            });
    }, [filteredEntries]);

    const timeOfDayData = useMemo(() => {
        const hours: Record<string, { hour: string, pnl: number, wins: number, losses: number, total: number }> = {};
        filteredEntries.forEach(e => {
            const hour = e.time.split(':')[0] + ':00';
            if (!hours[hour]) hours[hour] = { hour, pnl: 0, wins: 0, losses: 0, total: 0 };
            hours[hour].pnl += e.pnl;
            hours[hour].total += 1;
            if (e.result === 'WIN') hours[hour].wins += 1;
            else hours[hour].losses += 1;
        });
        return Object.values(hours).sort((a, b) => a.hour.localeCompare(b.hour));
    }, [filteredEntries]);


    // ============= Handlers =============
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                setFormData(prev => ({
                    ...prev,
                    images: [...prev.images, base64]
                }));
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const handleSymbolChange = (val: string) => {
        const upperVal = val.toUpperCase();
        const config = FUTURES_SYMBOLS[upperVal];
        setFormData(prev => ({
            ...prev,
            symbol: upperVal,
            tickValue: config ? config.pointValue.toString() : prev.tickValue,
            commissions: config ? config.commission.toString() : prev.commissions
        }));
    };

    const handleSubmit = () => {
        const entry = parseFloat(formData.entry) || 0;
        const exit = parseFloat(formData.exit) || 0;
        const stopLoss = parseFloat(formData.stopLoss) || 0;
        const quantity = parseFloat(formData.quantity) || 1;
        const tickValue = parseFloat(formData.tickValue) || 1;

        // P&L Calculation for Futures: (Exit - Entry) * Quantity * TickValue (assuming Entry/Exit are raw prices)
        // For Long: (Exit - Entry)
        // For Short: (Entry - Exit) - Need to detect direction.
        // Usually journal entry implies direction by context. 
        // Let's assume Long if TP > Entry, Short if TP < Entry or based on SL.
        // Improved logic: compare Entry and StopLoss to detect direction.

        let direction = 1; // 1 for Long, -1 for Short
        if (stopLoss !== 0) {
            direction = stopLoss < entry ? 1 : -1;
        } else if (parseFloat(formData.takeProfit) !== 0) {
            direction = parseFloat(formData.takeProfit) > entry ? 1 : -1;
        }

        const rawPriceDiff = (exit - entry) * direction;
        const commissions = parseFloat(formData.commissions) || 0;
        const pnl = (rawPriceDiff * quantity * tickValue) - commissions;

        // PnL Percent is tricky for futures (margin based), so we use price % change
        const pnlPercent = entry > 0 ? (rawPriceDiff / entry) * 100 : 0;

        const riskPriceDiff = Math.abs(entry - stopLoss);
        const rMultiple = (riskPriceDiff > 0 && stopLoss !== 0) ? rawPriceDiff / riskPriceDiff : 0;

        let result: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
        if (pnl > 0) result = 'WIN';
        else if (pnl < 0) result = 'LOSS';

        const newEntry: JournalEntry = {
            id: editingEntry?.id || `entry_${Date.now()}`,
            date: formData.date,
            time: formData.time,
            symbol: formData.symbol.toUpperCase(),
            tickValue,
            setupId: formData.setupId,
            criteriaUsed: formData.criteriaUsed,
            entry,
            exit,
            stopLoss,
            takeProfit: parseFloat(formData.takeProfit) || 0,
            maxMove: parseFloat(formData.maxMove) || 0,
            quantity,
            commissions,
            pnl,
            pnlPercent,
            rMultiple,
            result,
            images: formData.images,
            notes: formData.notes,
        };

        if (editingEntry) {
            setEntries(prev => prev.map(e => e.id === editingEntry.id ? newEntry : e));
        } else {
            setEntries(prev => [newEntry, ...prev]);
        }

        resetForm();
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            time: new Date().toTimeString().slice(0, 5),
            symbol: 'MES',
            tickValue: '5',
            setupId: '',
            criteriaUsed: [],
            stopLoss: '',
            takeProfit: '',
            entry: '',
            exit: '',
            maxMove: '',
            quantity: '1',
            commissions: '',
            notes: '',
            images: [],
        });
        setShowNewEntry(false);
        setEditingEntry(null);
    };

    const editEntry = (entry: JournalEntry) => {
        setFormData({
            date: entry.date,
            time: entry.time,
            symbol: entry.symbol,
            tickValue: entry.tickValue?.toString() || '1',
            setupId: entry.setupId,
            criteriaUsed: entry.criteriaUsed,
            entry: entry.entry.toString(),
            exit: entry.exit.toString(),
            stopLoss: entry.stopLoss.toString(),
            takeProfit: entry.takeProfit.toString(),
            maxMove: entry.maxMove?.toString() || '',
            quantity: entry.quantity.toString(),
            commissions: entry.commissions?.toString() || '',
            notes: entry.notes,
            images: entry.images,
        });
        setEditingEntry(entry);
        setShowNewEntry(true);
    };

    const deleteEntry = (id: string) => {
        if (confirm('Delete this journal entry?')) {
            setEntries(prev => prev.filter(e => e.id !== id));
        }
    };

    const addSetup = () => {
        if (!newSetupName.trim()) return;
        const newSetup: SetupCategory = {
            id: `setup_${Date.now()} `,
            name: newSetupName.trim(),
            criteria: [],
            color: ['blue', 'purple', 'emerald', 'amber', 'rose', 'cyan'][Math.floor(Math.random() * 6)],
        };
        setSetups(prev => [...prev, newSetup]);
        setNewSetupName('');
    };

    const deleteSetup = (id: string) => {
        setSetups(prev => prev.filter(s => s.id !== id));
    };

    const addCriteriaToSetup = (setupId: string, criteria: string) => {
        if (!criteria.trim()) return;
        setSetups(prev => prev.map(s =>
            s.id === setupId && !s.criteria.includes(criteria)
                ? { ...s, criteria: [...s.criteria, criteria] }
                : s
        ));
        setNewCriteria('');
    };

    const removeCriteriaFromSetup = (setupId: string, criteria: string) => {
        setSetups(prev => prev.map(s =>
            s.id === setupId
                ? { ...s, criteria: s.criteria.filter(c => c !== criteria) }
                : s
        ));
    };

    const getSetupById = (id: string) => setups.find(s => s.id === id);

    const getSetupColor = (setupId: string) => {
        const setup = getSetupById(setupId);
        const colors: Record<string, string> = {
            blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
            emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            rose: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
            cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        };
        return colors[setup?.color || 'blue'] || colors.blue;
    };

    // Helper to render stat card
    const StatCard = ({ title, value, type = 'neutral', subtext = '' }: { title: string, value: string, type?: 'win' | 'loss' | 'neutral', subtext?: string }) => (
        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 text-center">
            <div className={`text-2xl font-bold ${type === 'win' ? 'text-emerald-400' : type === 'loss' ? 'text-rose-400' : 'text-white'}`}>
                {value}
            </div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{title}</div>
            {subtext && <div className="text-[10px] text-slate-600 mt-1">{subtext}</div>}
        </div>
    );

    // ============= Render =============
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <span className="text-3xl">📊</span>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Trading Journal</h2>
                        <p className="text-xs text-slate-500">Track executions, analyze setups, master your edge</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowSetupManager(!showSetupManager)}
                        className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600"
                    >
                        ⚙️ Setups
                    </button>
                    <button
                        onClick={() => setShowNewEntry(true)}
                        className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg shadow-lg shadow-amber-500/20"
                    >
                        + New Entry
                    </button>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex space-x-1 border-b border-slate-700/50">
                <button
                    onClick={() => setActiveSubTab('history')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSubTab === 'history'
                        ? 'bg-slate-800 text-amber-400 border-t border-x border-slate-700'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                >
                    📜 History
                </button>
                <button
                    onClick={() => setActiveSubTab('totalStats')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSubTab === 'totalStats'
                        ? 'bg-slate-800 text-amber-400 border-t border-x border-slate-700'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                >
                    📈 Total Stats
                </button>
                <button
                    onClick={() => setActiveSubTab('setupStats')}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSubTab === 'setupStats'
                        ? 'bg-slate-800 text-amber-400 border-t border-x border-slate-700'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                        }`}
                >
                    🎯 By Setup
                </button>
            </div>

            {/* TAB CONTENT: HISTORY */}
            {activeSubTab === 'history' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-4 bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500">Setup Filter:</span>
                            <select
                                value={filterSetup}
                                onChange={(e) => setFilterSetup(e.target.value)}
                                className="bg-slate-700 text-slate-200 text-sm px-3 py-1.5 rounded border border-slate-600 outline-none focus:border-amber-500/50"
                            >
                                <option value="all">All Setups</option>
                                {setups.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500">Criteria Filter:</span>
                            <div className="flex flex-wrap gap-1">
                                {filterSetup !== 'all' ? getSetupById(filterSetup)?.criteria.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setFilterCriteria(prev =>
                                            prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                        )}
                                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${filterCriteria.includes(c)
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                            : 'bg-slate-700 text-slate-400 border-slate-600 hover:border-slate-500'
                                            }`}
                                    >
                                        {c}
                                    </button>
                                )) : (
                                    <span className="text-xs text-slate-600 italic">Select a setup to filter by criteria</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Entries List */}
                    <div className="bg-slate-800/30 rounded-lg border border-slate-700 overflow-hidden">
                        {filteredEntries.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                <div className="text-5xl mb-4 opacity-30">📓</div>
                                <h3 className="text-lg font-medium text-slate-400">No entries found</h3>
                                <p className="text-sm">Add a new trade or adjust filters.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-slate-500 uppercase text-xs bg-slate-800/80">
                                        <tr>
                                            <th className="text-left p-3 font-medium">Date</th>
                                            <th className="text-left p-3 font-medium">Symbol</th>
                                            <th className="text-left p-3 font-medium">Setup</th>
                                            <th className="text-right p-3 font-medium">Entry</th>
                                            <th className="text-right p-3 font-medium">Exits</th>
                                            <th className="text-right p-3 font-medium">R</th>
                                            <th className="text-right p-3 font-medium">P&L</th>
                                            <th className="text-center p-3 font-medium">Img</th>
                                            <th className="text-center p-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-300 divide-y divide-slate-700/50">
                                        {filteredEntries.map(entry => (
                                            <tr key={entry.id} className="hover:bg-slate-700/20 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-mono">{entry.date}</div>
                                                    <div className="text-[10px] text-slate-500">{entry.time}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-bold text-slate-200">{entry.symbol}</div>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getSetupColor(entry.setupId)}`}>
                                                        {getSetupById(entry.setupId)?.name || 'Unknown'}
                                                    </span>
                                                    {entry.criteriaUsed.length > 0 && (
                                                        <div className="flex flex-wrap gap-0.5 mt-1">
                                                            {entry.criteriaUsed.slice(0, 2).map(c => (
                                                                <span key={c} className="text-[9px] px-1 bg-slate-800 rounded text-slate-500">{c}</span>
                                                            ))}
                                                            {entry.criteriaUsed.length > 2 && (
                                                                <span className="text-[9px] px-1 bg-slate-800 rounded text-slate-500">+{entry.criteriaUsed.length - 2}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right font-mono text-xs">${entry.entry.toFixed(2)}</td>
                                                <td className="p-3 text-right font-mono text-xs">${entry.exit.toFixed(2)}</td>
                                                <td className={`p-3 text-right font-bold font-mono ${entry.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {entry.rMultiple >= 0 ? '+' : ''}{entry.rMultiple.toFixed(2)}R
                                                </td>
                                                <td className={`p-3 text-right font-bold font-mono ${entry.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toLocaleString()}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {entry.images.length > 0 ? (
                                                        <button
                                                            onClick={() => setImageModal({ src: entry.images[0], zoom: 1, x: 0, y: 0 })}
                                                            className="text-amber-400 hover:text-amber-300 transition-colors"
                                                        >
                                                            🖼️
                                                        </button>
                                                    ) : <span className="text-slate-700">-</span>}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        <button
                                                            onClick={() => editEntry(entry)}
                                                            className="text-slate-500 hover:text-amber-400 transition-colors"
                                                            title="Edit"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => deleteEntry(entry.id)}
                                                            className="text-slate-500 hover:text-rose-400 transition-colors"
                                                            title="Delete"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: TOTAL STATS */}
            {activeSubTab === 'totalStats' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard title="Win Rate" value={`${currentStats.winRate.toFixed(1)}%`} type={currentStats.winRate >= 50 ? 'win' : 'loss'} />
                        <StatCard title="Profit Factor" value={currentStats.profitFactor.toFixed(2)} type={currentStats.profitFactor >= 1.5 ? 'win' : 'neutral'} />
                        <StatCard title="Total P&L" value={`$${currentStats.totalPnl.toLocaleString()}`} type={currentStats.totalPnl >= 0 ? 'win' : 'loss'} />
                        <StatCard title="Avg R Check" value={`${currentStats.avgR.toFixed(2)} R`} type={currentStats.avgR > 0 ? 'win' : 'loss'} />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard title="Total Trades" value={currentStats.totalTrades.toString()} />
                        <StatCard title="Wins" value={currentStats.wins.toString()} type="win" />
                        <StatCard title="Losses" value={currentStats.losses.toString()} type="loss" />
                        <StatCard title="Risk/Reward Ratio" value={`1 : ${(currentStats.avgWinR / (Math.abs(currentStats.avgLossR) || 1)).toFixed(2)}`} />
                    </div>

                    <div className="bg-slate-800/30 p-6 rounded-lg border border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-4">Performance Insights</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h4 className="text-xs uppercase text-slate-500 mb-2">P&L Distribution</h4>
                                <div className="h-4 bg-slate-700/50 rounded-full overflow-hidden flex">
                                    <div style={{ width: `${currentStats.winRate}%` }} className="bg-emerald-500/50 h-full"></div>
                                    <div style={{ width: `${100 - currentStats.winRate}%` }} className="bg-rose-500/50 h-full"></div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 mt-1">
                                    <span>{currentStats.wins} Wins</span>
                                    <span>{currentStats.losses} Losses</span>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-xs uppercase text-slate-500 mb-2">Averages</h4>
                                <div className="flex items-center space-x-4">
                                    <div className="flex-1">
                                        <div className="text-3xl font-light text-emerald-400">+{currentStats.avgWinR.toFixed(2)}R</div>
                                        <div className="text-[10px] text-slate-500 uppercase">Avg Win</div>
                                    </div>
                                    <div className="w-px h-10 bg-slate-700"></div>
                                    <div className="flex-1">
                                        <div className="text-3xl font-light text-rose-400">-{Math.abs(currentStats.avgLossR).toFixed(2)}R</div>
                                        <div className="text-[10px] text-slate-500 uppercase">Avg Loss</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: BY SETUP */}
            {activeSubTab === 'setupStats' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Sidebar: Select Setup */}
                        <div className="w-full md:w-64 space-y-2">
                            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Select Setup</h3>
                            {setups.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setFilterSetup(s.id);
                                        setFilterCriteria([]); // Reset criteria when switching setup
                                    }}
                                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${filterSetup === s.id
                                        ? `bg-slate-800 border-${getSetupColor(s.id).split(' ')[2].replace('border-', '')} shadow-lg ring-1 ring-white/10`
                                        : 'bg-slate-800/30 border-transparent hover:bg-slate-800/50 text-slate-400'
                                        }`}
                                >
                                    <div className="font-bold text-slate-200">{s.name}</div>
                                    <div className="text-[10px] text-slate-500 mt-1">{entries.filter(e => e.setupId === s.id).length} trades</div>
                                </button>
                            ))}
                        </div>

                        {/* Main Content: Stats for Selected Setup */}
                        <div className="flex-1 space-y-6">
                            {filterSetup === 'all' ? (
                                <div className="h-full flex items-center justify-center text-slate-500 p-12 bg-slate-800/20 rounded-lg border border-slate-800 border-dashed">
                                    Select a setup from the left to view detailed statistics
                                </div>
                            ) : (
                                <>
                                    <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                                        <div className="text-xs text-slate-500 uppercase mb-2">Filter by Criteria</div>
                                        <div className="p-4 border border-slate-700 rounded-lg bg-slate-800/20">
                                            <div className="text-xs font-bold text-slate-500 uppercase mb-3 flex justify-between">
                                                <span>Select Setup Criteria</span>
                                                <span className="text-amber-500 lowercase font-normal italic">Required for analysis</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {getSetupById(filterSetup)?.criteria.length === 0 ? (
                                                    <div className="text-xs text-slate-600 italic">No criteria defined for this setup. Go to Setups manager to add them.</div>
                                                ) : (
                                                    getSetupById(filterSetup)?.criteria.map(c => {
                                                        const isActive = filterCriteria.includes(c);
                                                        return (
                                                            <button
                                                                key={c}
                                                                type="button"
                                                                onClick={() => setFilterCriteria(prev =>
                                                                    isActive ? prev.filter(x => x !== c) : [...prev, c]
                                                                )}
                                                                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${isActive
                                                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm shadow-amber-900/20'
                                                                    : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400'
                                                                    }`}
                                                            >
                                                                {isActive ? '✓ ' : ''}{c}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-[10px] text-slate-500 text-right">
                                            Showing {filteredEntries.length} of {entries.filter(e => e.setupId === filterSetup).length} trades
                                        </div>
                                    </div>

                                    {filterCriteria.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-800/20 rounded-lg border border-slate-700 border-dashed">
                                            <div className="text-4xl mb-3">👈</div>
                                            <p className="font-medium">Select criteria to analyze performance</p>
                                            <p className="text-xs text-slate-600 mt-1 max-w-xs text-center">
                                                Select the variables you used (e.g., 'Trend Direction') to see how this setup performs under specific conditions.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-fade-in">
                                            {/* Setup Stats Grid */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <StatCard title="Setup Win Rate" value={`${currentStats.winRate.toFixed(1)}%`} type={currentStats.winRate >= 50 ? 'win' : 'loss'} />
                                                <StatCard title="Setup P&L" value={`$${currentStats.totalPnl.toLocaleString()}`} type={currentStats.totalPnl >= 0 ? 'win' : 'loss'} />
                                                <StatCard title="Avg R" value={`${currentStats.avgR.toFixed(2)} R`} type={currentStats.avgR > 0 ? 'win' : 'loss'} />
                                                <StatCard title="Profit Factor" value={currentStats.profitFactor.toFixed(2)} />
                                            </div>

                                            {/* Setup Performance Graph Placeholder or Additional Insights */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Setup Expectancy</h4>
                                                    <div className="text-3xl font-light text-white">
                                                        {((currentStats.winRate / 100 * currentStats.avgWinR) - ((1 - currentStats.winRate / 100) * Math.abs(currentStats.avgLossR))).toFixed(2)}R
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-1">Expected return per trade</div>
                                                </div>
                                                <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Frequency</h4>
                                                    <div className="text-3xl font-light text-white">
                                                        {((currentStats.totalTrades / (entries.length || 1)) * 100).toFixed(1)}%
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 mt-1">of total trades ({currentStats.totalTrades})</div>
                                                </div>
                                            </div>

                                            {/* Advanced Analytics Charts */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-800">
                                                {/* Equity Curve */}
                                                <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700 h-80">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Equity Curve (P{'&'}L)</h4>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={equityCurveData}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickFormatter={(val) => val.slice(5)} />
                                                            <YAxis stroke="#94a3b8" fontSize={10} />
                                                            <Tooltip
                                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                                                itemStyle={{ color: '#f8fafc' }}
                                                                formatter={(value: any) => [`$${(value || 0).toFixed(2)}`, 'Equity']}
                                                            />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="equity"
                                                                stroke="#fbbf24"
                                                                strokeWidth={2}
                                                                dot={{ r: 3, fill: '#fbbf24' }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>

                                                {/* Time of Day Analysis */}
                                                <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700 h-80">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Hourly Performance (Win/Loss)</h4>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={timeOfDayData}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                                            <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} />
                                                            <YAxis stroke="#94a3b8" fontSize={10} />
                                                            <Tooltip
                                                                cursor={{ fill: '#334155', opacity: 0.2 }}
                                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                                            />
                                                            <Bar dataKey="wins" name="Wins" stackId="a" fill="#10b981" />
                                                            <Bar dataKey="losses" name="Losses/BE" stackId="a" fill="#f43f5e" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                    <div className="text-[10px] text-slate-500 mt-2 text-center italic">
                                                        *Bars show total volume per hour. Green portion represents wins.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Setup Manager */}
            {showSetupManager && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold text-white">⚙️ Setup Manager</h3>
                            <button onClick={() => setShowSetupManager(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-10">
                            {/* Section 1: Global Criteria Library */}
                            <div>
                                <h4 className="text-sm font-bold text-amber-500 uppercase mb-4 flex items-center gap-2">
                                    📚 Global Criteria Library
                                    <span className="text-[10px] font-normal text-slate-500 lowercase normal-case italic">(Criteria available for all setups)</span>
                                </h4>
                                <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700 space-y-4 shadow-inner">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Add new criteria (e.g. 'RSI Divergence')"
                                            value={newCriteria}
                                            onChange={(e) => setNewCriteria(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newCriteria.trim()) {
                                                    setCriteriaLibrary(prev => [...prev, newCriteria.trim()]);
                                                    setNewCriteria('');
                                                }
                                            }}
                                            className="flex-1 bg-slate-900 text-slate-100 px-4 py-2.5 rounded-lg border border-slate-700 focus:border-amber-500 outline-none transition-colors"
                                        />
                                        <button
                                            onClick={() => {
                                                if (!newCriteria.trim()) return;
                                                setCriteriaLibrary(prev => [...prev, newCriteria.trim()]);
                                                setNewCriteria('');
                                            }}
                                            className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 min-h-[40px]">
                                        {criteriaLibrary.length === 0 ? (
                                            <div className="text-xs text-slate-600 italic">No criteria in library. Add some above.</div>
                                        ) : (
                                            criteriaLibrary.map(c => (
                                                <span key={c} className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-2 group hover:border-slate-500 transition-colors">
                                                    {c}
                                                    <button
                                                        onClick={() => setCriteriaLibrary(prev => prev.filter(x => x !== c))}
                                                        className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove from library"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <hr className="border-slate-800 mx-[-1.5rem]" />

                            {/* Section 2: Specific Setups */}
                            <div className="space-y-6">
                                <h4 className="text-sm font-bold text-amber-500 uppercase flex items-center gap-2">
                                    🏠 Strategy Setups
                                </h4>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="New setup name (e.g. 'Bear Flag')"
                                        value={newSetupName}
                                        onChange={(e) => setNewSetupName(e.target.value)}
                                        className="flex-1 bg-slate-800 text-slate-100 px-4 py-2 rounded border border-slate-700 focus:border-amber-500 outline-none"
                                    />
                                    <button
                                        onClick={addSetup}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
                                    >
                                        Add Setup
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {setups.map(setup => (
                                        <div key={setup.id} className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`px-2 py-1 rounded text-sm font-bold border ${getSetupColor(setup.id)}`}>
                                                    {setup.name}
                                                </span>
                                                <button onClick={() => deleteSetup(setup.id)} className="text-slate-500 hover:text-rose-400 text-xs uppercase font-bold">Delete</button>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    {setup.criteria.map(c => (
                                                        <span key={c} className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded flex items-center gap-1">
                                                            {c}
                                                            <button onClick={() => removeCriteriaFromSetup(setup.id, c)} className="hover:text-rose-400 ml-1">×</button>
                                                        </span>
                                                    ))}
                                                    <button
                                                        onClick={() => setSelectedSetupForCriteria(selectedSetupForCriteria === setup.id ? null : setup.id)}
                                                        className="px-2 py-1 bg-slate-700/50 text-slate-400 text-xs rounded hover:bg-slate-700 border border-dashed border-slate-600"
                                                    >
                                                        + Add Criteria
                                                    </button>
                                                </div>

                                                {selectedSetupForCriteria === setup.id && (
                                                    <div className="flex gap-2 mt-2">
                                                        <select
                                                            value={newCriteria}
                                                            onChange={(e) => setNewCriteria(e.target.value)}
                                                            className="flex-1 bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded border border-slate-700"
                                                        >
                                                            <option value="">Select criteria...</option>
                                                            {criteriaLibrary.filter(c => !setup.criteria.includes(c)).map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                        <button onClick={() => { addCriteriaToSetup(setup.id, newCriteria); setSelectedSetupForCriteria(null); }} className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Add</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* New Entry Form */}
            {showNewEntry && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl shadow-black overflow-hidden">
                        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                {editingEntry ? '✏️ Edit Entry' : '📝 New Journal Entry'}
                            </h3>
                            <button onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Section 1: Instrument & Time */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Date</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                        className="w-full bg-slate-800 text-slate-100 px-3 py-2 rounded focus:ring-1 focus:ring-amber-500 border border-slate-700 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Time</label>
                                    <input
                                        type="time"
                                        value={formData.time}
                                        onChange={(e) => setFormData(p => ({ ...p, time: e.target.value }))}
                                        className="w-full bg-slate-800 text-slate-100 px-3 py-2 rounded focus:ring-1 focus:ring-amber-500 border border-slate-700 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Symbol</label>
                                    <input
                                        type="text"
                                        list="tickers"
                                        placeholder="MES"
                                        value={formData.symbol}
                                        onChange={(e) => handleSymbolChange(e.target.value)}
                                        className="w-full bg-slate-800 text-slate-100 px-3 py-2 rounded focus:ring-1 focus:ring-amber-500 border border-slate-700 outline-none text-sm font-bold uppercase"
                                    />
                                    <datalist id="tickers">
                                        {Object.keys(FUTURES_SYMBOLS).map(s => <option key={s} value={s} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Tick Value ($)</label>
                                    <input
                                        type="number"
                                        value={formData.tickValue}
                                        onChange={(e) => setFormData(p => ({ ...p, tickValue: e.target.value }))}
                                        className="w-full bg-slate-800 text-slate-100 px-3 py-2 rounded focus:ring-1 focus:ring-amber-500 border border-slate-700 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Section 2: Setup Details */}
                            <div className="bg-slate-800/20 p-5 rounded-xl border border-slate-700/50 space-y-4">
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-2">Strategy Setup</label>
                                    <select
                                        value={formData.setupId}
                                        onChange={(e) => setFormData(p => ({ ...p, setupId: e.target.value, criteriaUsed: [] }))}
                                        className="w-full bg-slate-800 text-slate-200 px-4 py-2.5 rounded-lg border border-slate-600 focus:border-amber-500 outline-none"
                                    >
                                        <option value="">Select a setup...</option>
                                        {setups.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {formData.setupId && (
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-2">Select Criteria</label>
                                        <div className="flex flex-wrap gap-2">
                                            {/* Combined view: show library criteria, highlight if in setup */}
                                            {criteriaLibrary.map(c => {
                                                const isInSetup = getSetupById(formData.setupId)?.criteria.includes(c);
                                                const isSelected = formData.criteriaUsed.includes(c);
                                                return (
                                                    <button
                                                        key={c}
                                                        onClick={() => setFormData(p => ({
                                                            ...p,
                                                            criteriaUsed: isSelected
                                                                ? p.criteriaUsed.filter(x => x !== c)
                                                                : [...p.criteriaUsed, c]
                                                        }))}
                                                        className={`px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${isSelected
                                                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                                                            : isInSetup
                                                                ? 'bg-slate-800/50 text-slate-300 border-amber-500/30'
                                                                : 'bg-slate-900/50 text-slate-500 border-slate-800'
                                                            }`}
                                                    >
                                                        {isSelected && <span>✓</span>}
                                                        {c}
                                                        {isInSetup && !isSelected && <span className="text-[8px] text-amber-500/50 ml-1">★</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[9px] text-slate-600 mt-2 italic">★ Starred criteria are recommended for the selected setup.</p>
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Execution Details */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] uppercase text-amber-500 font-bold tracking-widest border-b border-amber-500/20 pb-1.5">Execution Details</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Entry Price</label>
                                            <input
                                                type="number" step="0.25"
                                                value={formData.entry}
                                                onChange={(e) => setFormData(p => ({ ...p, entry: e.target.value }))}
                                                className="w-full bg-slate-800 text-white px-3 py-2.5 rounded-lg border border-slate-700 text-sm font-mono font-bold focus:border-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-rose-400 uppercase font-bold mb-1.5">Stop Loss</label>
                                            <input
                                                type="number" step="0.25"
                                                value={formData.stopLoss}
                                                onChange={(e) => setFormData(p => ({ ...p, stopLoss: e.target.value }))}
                                                className="w-full bg-slate-800 text-rose-300 px-3 py-2.5 rounded-lg border border-rose-900/30 text-sm font-mono focus:border-rose-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] text-slate-300 uppercase font-bold mb-1.5">Exit Price</label>
                                            <input
                                                type="number" step="0.25"
                                                value={formData.exit}
                                                onChange={(e) => setFormData(p => ({ ...p, exit: e.target.value }))}
                                                className="w-full bg-slate-800 text-white px-3 py-2.5 rounded-lg border border-slate-700 text-sm font-mono font-bold focus:border-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-emerald-400 uppercase font-bold mb-1.5">Take Profit</label>
                                            <input
                                                type="number" step="0.25"
                                                value={formData.takeProfit}
                                                onChange={(e) => setFormData(p => ({ ...p, takeProfit: e.target.value }))}
                                                className="w-full bg-slate-800 text-emerald-300 px-3 py-2.5 rounded-lg border border-emerald-900/30 text-sm font-mono focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1.5">Quantity</label>
                                            <input
                                                type="number" step="1"
                                                value={formData.quantity}
                                                onChange={(e) => setFormData(p => ({ ...p, quantity: e.target.value }))}
                                                className="w-full bg-slate-800 text-slate-100 px-3 py-2.5 rounded-lg border border-slate-700 text-sm focus:border-amber-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1.5">Commissions ($)</label>
                                            <input
                                                type="number" step="0.01"
                                                value={formData.commissions}
                                                onChange={(e) => setFormData(p => ({ ...p, commissions: e.target.value }))}
                                                className="w-full bg-slate-800 text-slate-200 px-3 py-2.5 rounded-lg border border-slate-700 text-sm focus:border-amber-500 outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-[10px] text-amber-500 uppercase font-bold mb-1.5">Max Move (Points)</label>
                                            <input
                                                type="number" step="0.25"
                                                value={formData.maxMove}
                                                onChange={(e) => setFormData(p => ({ ...p, maxMove: e.target.value }))}
                                                className="w-full bg-slate-800 text-amber-100 px-3 py-2.5 rounded-lg border border-slate-700 text-sm focus:border-amber-500 outline-none"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Images & Notes */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-3">Charts & Evidence</label>
                                    <div className="flex flex-wrap gap-3">
                                        {formData.images.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                                <img
                                                    src={img}
                                                    alt="Evidence"
                                                    className="w-20 h-20 object-cover rounded-lg border border-slate-700 cursor-zoom-in"
                                                    onClick={() => setImageModal({ src: img, zoom: 1, x: 0, y: 0 })}
                                                />
                                                <button
                                                    onClick={() => removeImage(idx)}
                                                    className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-20 h-20 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-500 transition-all bg-slate-800/30 hover:bg-slate-800/50"
                                        >
                                            <span className="text-xl">📷</span>
                                            <span className="text-[9px] mt-1 font-bold">ADD</span>
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-3">Analysis Notes</label>
                                    <textarea
                                        placeholder="Psychology, execution errors, market context..."
                                        value={formData.notes}
                                        onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                        className="w-full bg-slate-800 text-slate-100 px-4 py-3 rounded-xl border border-slate-700 text-sm h-32 resize-none leading-relaxed focus:border-amber-500 outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-slate-800 bg-slate-900/90 flex justify-end gap-3">
                            <button onClick={resetForm} className="px-6 py-2.5 bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors text-sm font-medium">
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-10 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold rounded-lg shadow-lg shadow-amber-500/20 transform active:scale-95 transition-all text-sm"
                            >
                                {editingEntry ? 'Update Entry' : 'Log Trade'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Modal */}
            {imageModal && createPortal(
                <div
                    className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center backdrop-blur-sm overflow-hidden"
                    onClick={() => setImageModal(null)}
                    onWheel={(e) => {
                        e.stopPropagation();
                        const delta = -e.deltaY * 0.001;
                        setImageModal(prev => {
                            if (!prev) return null;
                            const newZoom = Math.min(Math.max(0.1, prev.zoom + delta), 10);
                            return { ...prev, zoom: newZoom };
                        });
                    }}
                    onMouseDown={(e) => {
                        if (!imageModal) return;
                        dragRef.current.isDragging = true;
                        dragRef.current.startX = e.clientX;
                        dragRef.current.startY = e.clientY;
                        dragRef.current.lastX = imageModal.x;
                        dragRef.current.lastY = imageModal.y;
                    }}
                    onMouseMove={(e) => {
                        if (!imageModal || !dragRef.current.isDragging) return;
                        e.preventDefault();
                        const dx = e.clientX - dragRef.current.startX;
                        const dy = e.clientY - dragRef.current.startY;
                        const newX = dragRef.current.lastX + dx;
                        const newY = dragRef.current.lastY + dy;
                        setImageModal(prev => prev ? { ...prev, x: newX, y: newY } : null);
                    }}
                    onMouseUp={() => { dragRef.current.isDragging = false; }}
                    onMouseLeave={() => { dragRef.current.isDragging = false; }}
                >
                    <div
                        className="relative w-full h-full flex items-center justify-center"
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: dragRef.current.isDragging ? 'grabbing' : 'grab' }}
                    >
                        <img
                            src={imageModal.src}
                            alt="Evidence"
                            draggable={false}
                            style={{
                                transform: `translate(${imageModal.x}px, ${imageModal.y}px) scale(${imageModal.zoom})`,
                                transition: dragRef.current.isDragging ? 'none' : 'transform 0.1s ease-out',
                                maxWidth: 'none',
                                maxHeight: 'none',
                            }}
                            className="object-contain shadow-2xl select-none"
                        />
                        <button
                            onClick={() => setImageModal(null)}
                            className="absolute top-6 right-6 w-12 h-12 bg-slate-800/50 hover:bg-rose-600 text-white rounded-full text-2xl flex items-center justify-center transition-colors z-50 shadow-lg border border-white/10"
                        >
                            ✕
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default TradingJournal;
