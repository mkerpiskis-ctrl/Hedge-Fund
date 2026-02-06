import { useState, useEffect, useCallback, useRef } from 'react';

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
    setupId: string;
    criteriaUsed: string[];
    level: number;
    stopLoss: number;
    takeProfit: number;
    entry: number;
    exit: number;
    quantity: number;
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

// Default criteria library
const CRITERIA_LIBRARY = [
    'HTF EMA20 Price',
    'HTF EMA50 Price',
    'HTF VWAP Price',
    'HTF Trend Direction',
    'LTF EMA9 Cross',
    'LTF Trend Direction',
    'LTF Volume Spike',
    'Key Level Break',
    'Support/Resistance',
    'Opening Range',
    'Volume Confirmation',
    'CVD Divergence',
    'Oscillator Divergence',
];

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

    const [filterSetup, setFilterSetup] = useState<string>('all');
    const [filterCriteria, setFilterCriteria] = useState<string[]>([]);
    const [showNewEntry, setShowNewEntry] = useState(false);
    const [showSetupManager, setShowSetupManager] = useState(false);
    const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
    const [imageModal, setImageModal] = useState<{ src: string; zoom: number } | null>(null);
    const [newSetupName, setNewSetupName] = useState('');
    const [newCriteria, setNewCriteria] = useState('');
    const [selectedSetupForCriteria, setSelectedSetupForCriteria] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().slice(0, 5),
        symbol: '',
        setupId: '',
        criteriaUsed: [] as string[],
        level: '',
        stopLoss: '',
        takeProfit: '',
        entry: '',
        exit: '',
        quantity: '1',
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

    // ============= Calculations =============
    const calculateStats = useCallback(() => {
        let filteredEntries = entries;

        if (filterSetup !== 'all') {
            filteredEntries = filteredEntries.filter(e => e.setupId === filterSetup);
        }

        if (filterCriteria.length > 0) {
            filteredEntries = filteredEntries.filter(e =>
                filterCriteria.every(c => e.criteriaUsed.includes(c))
            );
        }

        const totalTrades = filteredEntries.length;
        const wins = filteredEntries.filter(e => e.result === 'WIN').length;
        const losses = filteredEntries.filter(e => e.result === 'LOSS').length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const totalPnl = filteredEntries.reduce((sum, e) => sum + e.pnl, 0);
        const avgR = totalTrades > 0 ? filteredEntries.reduce((sum, e) => sum + e.rMultiple, 0) / totalTrades : 0;
        const avgWinR = wins > 0 ? filteredEntries.filter(e => e.result === 'WIN').reduce((sum, e) => sum + e.rMultiple, 0) / wins : 0;
        const avgLossR = losses > 0 ? filteredEntries.filter(e => e.result === 'LOSS').reduce((sum, e) => sum + Math.abs(e.rMultiple), 0) / losses : 0;

        return { totalTrades, wins, losses, winRate, totalPnl, avgR, avgWinR, avgLossR, filteredEntries };
    }, [entries, filterSetup, filterCriteria]);

    const stats = calculateStats();

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

    const handleSubmit = () => {
        const entry = parseFloat(formData.entry) || 0;
        const exit = parseFloat(formData.exit) || 0;
        const stopLoss = parseFloat(formData.stopLoss) || 0;
        const quantity = parseFloat(formData.quantity) || 1;

        const pnl = (exit - entry) * quantity;
        const pnlPercent = entry > 0 ? ((exit - entry) / entry) * 100 : 0;
        const risk = Math.abs(entry - stopLoss);
        const rMultiple = risk > 0 ? (exit - entry) / risk : 0;

        let result: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
        if (pnl > 0) result = 'WIN';
        else if (pnl < 0) result = 'LOSS';

        const newEntry: JournalEntry = {
            id: editingEntry?.id || `entry_${Date.now()}`,
            date: formData.date,
            time: formData.time,
            symbol: formData.symbol.toUpperCase(),
            setupId: formData.setupId,
            criteriaUsed: formData.criteriaUsed,
            level: parseFloat(formData.level) || 0,
            stopLoss,
            takeProfit: parseFloat(formData.takeProfit) || 0,
            entry,
            exit,
            quantity,
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
            symbol: '',
            setupId: '',
            criteriaUsed: [],
            level: '',
            stopLoss: '',
            takeProfit: '',
            entry: '',
            exit: '',
            quantity: '1',
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
            setupId: entry.setupId,
            criteriaUsed: entry.criteriaUsed,
            level: entry.level.toString(),
            stopLoss: entry.stopLoss.toString(),
            takeProfit: entry.takeProfit.toString(),
            entry: entry.entry.toString(),
            exit: entry.exit.toString(),
            quantity: entry.quantity.toString(),
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
            id: `setup_${Date.now()}`,
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

    // ============= Render =============
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <span className="text-3xl">📊</span>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Trading Journal</h2>
                        <p className="text-xs text-slate-500">Track, analyze, and improve your setups</p>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => setShowSetupManager(!showSetupManager)}
                        className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600"
                    >
                        ⚙️ Manage Setups
                    </button>
                    <button
                        onClick={() => setShowNewEntry(true)}
                        className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg"
                    >
                        + New Entry
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500">Setup:</span>
                    <select
                        value={filterSetup}
                        onChange={(e) => setFilterSetup(e.target.value)}
                        className="bg-slate-700 text-slate-200 text-sm px-3 py-1.5 rounded border border-slate-600"
                    >
                        <option value="all">All Setups</option>
                        {setups.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500">Criteria:</span>
                    <div className="flex flex-wrap gap-1">
                        {filterSetup !== 'all' && getSetupById(filterSetup)?.criteria.map(c => (
                            <button
                                key={c}
                                onClick={() => setFilterCriteria(prev =>
                                    prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                                )}
                                className={`px-2 py-0.5 text-[10px] rounded border ${filterCriteria.includes(c)
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                    : 'bg-slate-700 text-slate-400 border-slate-600'
                                    }`}
                            >
                                {c}
                            </button>
                        ))}
                        {filterSetup === 'all' && (
                            <span className="text-xs text-slate-500 italic">Select a setup to filter by criteria</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className="text-2xl font-bold text-white">{stats.totalTrades}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Trades</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className="text-2xl font-bold text-emerald-400">{stats.wins}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Wins</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className="text-2xl font-bold text-rose-400">{stats.losses}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Losses</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.winRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase">Win Rate</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className={`text-2xl font-bold ${stats.avgR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.avgR >= 0 ? '+' : ''}{stats.avgR.toFixed(2)}R
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase">Avg R</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className="text-2xl font-bold text-emerald-400">+{stats.avgWinR.toFixed(2)}R</div>
                    <div className="text-[10px] text-slate-500 uppercase">Avg Win</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className="text-2xl font-bold text-rose-400">-{stats.avgLossR.toFixed(2)}R</div>
                    <div className="text-[10px] text-slate-500 uppercase">Avg Loss</div>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 text-center">
                    <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${stats.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase">Total P&L</div>
                </div>
            </div>

            {/* Setup Manager */}
            {showSetupManager && (
                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-lg font-bold text-white mb-4">📋 Setup Manager</h3>

                    <div className="flex items-center space-x-2 mb-4">
                        <input
                            type="text"
                            placeholder="New setup name..."
                            value={newSetupName}
                            onChange={(e) => setNewSetupName(e.target.value)}
                            className="flex-1 bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                            onKeyDown={(e) => e.key === 'Enter' && addSetup()}
                        />
                        <button
                            onClick={addSetup}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded"
                        >
                            + Add Setup
                        </button>
                    </div>

                    <div className="space-y-3">
                        {setups.map(setup => (
                            <div key={setup.id} className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`px-2 py-1 rounded text-sm font-bold border ${getSetupColor(setup.id)}`}>
                                        {setup.name}
                                    </span>
                                    <button
                                        onClick={() => deleteSetup(setup.id)}
                                        className="text-slate-500 hover:text-rose-400 text-xs"
                                    >
                                        ✕ Remove
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-1 mb-2">
                                    {setup.criteria.map(c => (
                                        <span key={c} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-[10px] rounded flex items-center gap-1">
                                            {c}
                                            <button
                                                onClick={() => removeCriteriaFromSetup(setup.id, c)}
                                                className="text-slate-500 hover:text-rose-400"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    ))}
                                </div>

                                {selectedSetupForCriteria === setup.id ? (
                                    <div className="flex items-center space-x-2">
                                        <select
                                            value={newCriteria}
                                            onChange={(e) => setNewCriteria(e.target.value)}
                                            className="flex-1 bg-slate-700 text-slate-200 text-xs px-2 py-1 rounded border border-slate-600"
                                        >
                                            <option value="">Select criteria...</option>
                                            {CRITERIA_LIBRARY.filter(c => !setup.criteria.includes(c)).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => {
                                                addCriteriaToSetup(setup.id, newCriteria);
                                                setSelectedSetupForCriteria(null);
                                            }}
                                            className="px-2 py-1 bg-emerald-600 text-white text-xs rounded"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => setSelectedSetupForCriteria(null)}
                                            className="px-2 py-1 bg-slate-600 text-slate-300 text-xs rounded"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setSelectedSetupForCriteria(setup.id)}
                                        className="text-xs text-slate-500 hover:text-slate-300"
                                    >
                                        + Add Criteria
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* New Entry Form */}
            {showNewEntry && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">
                                {editingEntry ? '✏️ Edit Entry' : '📝 New Journal Entry'}
                            </h3>
                            <button onClick={resetForm} className="text-slate-400 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Row 1: Date, Time, Symbol */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Time</label>
                                    <input
                                        type="time"
                                        value={formData.time}
                                        onChange={(e) => setFormData(p => ({ ...p, time: e.target.value }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Symbol</label>
                                    <input
                                        type="text"
                                        placeholder="AAPL"
                                        value={formData.symbol}
                                        onChange={(e) => setFormData(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm uppercase"
                                    />
                                </div>
                            </div>

                            {/* Row 2: Setup */}
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Setup</label>
                                <select
                                    value={formData.setupId}
                                    onChange={(e) => setFormData(p => ({ ...p, setupId: e.target.value, criteriaUsed: [] }))}
                                    className="w-full bg-slate-700 text-slate-200 px-3 py-2 rounded border border-slate-600 text-sm"
                                >
                                    <option value="">Select setup...</option>
                                    {setups.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Row 3: Criteria Used */}
                            {formData.setupId && (
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Criteria Used</label>
                                    <div className="flex flex-wrap gap-2">
                                        {getSetupById(formData.setupId)?.criteria.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setFormData(p => ({
                                                    ...p,
                                                    criteriaUsed: p.criteriaUsed.includes(c)
                                                        ? p.criteriaUsed.filter(x => x !== c)
                                                        : [...p.criteriaUsed, c]
                                                }))}
                                                className={`px-2 py-1 text-xs rounded border ${formData.criteriaUsed.includes(c)
                                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                                    : 'bg-slate-700 text-slate-400 border-slate-600'
                                                    }`}
                                            >
                                                {formData.criteriaUsed.includes(c) ? '✓ ' : ''}{c}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Row 4: Price Levels */}
                            <div className="grid grid-cols-5 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Level</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.level}
                                        onChange={(e) => setFormData(p => ({ ...p, level: e.target.value }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Stop Loss</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.stopLoss}
                                        onChange={(e) => setFormData(p => ({ ...p, stopLoss: e.target.value }))}
                                        className="w-full bg-slate-700 text-rose-300 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Take Profit</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.takeProfit}
                                        onChange={(e) => setFormData(p => ({ ...p, takeProfit: e.target.value }))}
                                        className="w-full bg-slate-700 text-emerald-300 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Entry</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.entry}
                                        onChange={(e) => setFormData(p => ({ ...p, entry: e.target.value }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 block mb-1">Exit</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.exit}
                                        onChange={(e) => setFormData(p => ({ ...p, exit: e.target.value }))}
                                        className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Row 5: Quantity */}
                            <div className="w-32">
                                <label className="text-xs text-slate-400 block mb-1">Quantity</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData(p => ({ ...p, quantity: e.target.value }))}
                                    className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm"
                                />
                            </div>

                            {/* Row 6: Images */}
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Screenshots</label>
                                <div className="flex flex-wrap gap-2">
                                    {formData.images.map((img, idx) => (
                                        <div key={idx} className="relative group">
                                            <img
                                                src={img}
                                                alt={`Screenshot ${idx + 1}`}
                                                className="w-20 h-20 object-cover rounded cursor-pointer border border-slate-600 hover:border-amber-500"
                                                onClick={() => setImageModal({ src: img, zoom: 1 })}
                                            />
                                            <button
                                                onClick={() => removeImage(idx)}
                                                className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 rounded-full text-white text-xs opacity-0 group-hover:opacity-100"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-20 h-20 border-2 border-dashed border-slate-600 rounded flex items-center justify-center text-slate-500 hover:border-slate-400 hover:text-slate-300"
                                    >
                                        📷+
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

                            {/* Row 7: Notes */}
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Notes</label>
                                <textarea
                                    placeholder="What did you learn? What went well/wrong?"
                                    value={formData.notes}
                                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                                    className="w-full bg-slate-700 text-slate-100 px-3 py-2 rounded border border-slate-600 text-sm h-24 resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-700 flex justify-end space-x-3">
                            <button onClick={resetForm} className="px-4 py-2 bg-slate-700 text-slate-300 rounded">
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded"
                            >
                                {editingEntry ? 'Save Changes' : 'Add Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Modal */}
            {imageModal && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                    onClick={() => setImageModal(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <img
                            src={imageModal.src}
                            alt="Full size"
                            style={{ transform: `scale(${imageModal.zoom})` }}
                            className="max-w-full max-h-[85vh] object-contain transition-transform"
                        />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-2 bg-slate-800/80 px-3 py-2 rounded-full">
                            <button
                                onClick={() => setImageModal(p => p ? { ...p, zoom: Math.max(0.5, p.zoom - 0.25) } : null)}
                                className="w-8 h-8 bg-slate-700 rounded-full text-white hover:bg-slate-600"
                            >
                                −
                            </button>
                            <span className="text-xs text-slate-300 w-12 text-center">{(imageModal.zoom * 100).toFixed(0)}%</span>
                            <button
                                onClick={() => setImageModal(p => p ? { ...p, zoom: Math.min(3, p.zoom + 0.25) } : null)}
                                className="w-8 h-8 bg-slate-700 rounded-full text-white hover:bg-slate-600"
                            >
                                +
                            </button>
                        </div>
                        <button
                            onClick={() => setImageModal(null)}
                            className="absolute top-2 right-2 w-10 h-10 bg-slate-800/80 rounded-full text-white text-xl hover:bg-slate-700"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Entries List */}
            <div className="bg-slate-800/30 rounded-lg border border-slate-700">
                <div className="p-4 border-b border-slate-700">
                    <h3 className="text-lg font-bold text-white">📋 Journal Entries</h3>
                </div>

                {stats.filteredEntries.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <div className="text-4xl mb-2">📔</div>
                        <p>No entries yet. Start journaling your trades!</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 uppercase text-xs bg-slate-800/50">
                                <tr>
                                    <th className="text-left p-3">Date</th>
                                    <th className="text-left p-3">Symbol</th>
                                    <th className="text-left p-3">Setup</th>
                                    <th className="text-right p-3">Entry</th>
                                    <th className="text-right p-3">Exit</th>
                                    <th className="text-right p-3">R Multiple</th>
                                    <th className="text-right p-3">P&L</th>
                                    <th className="text-center p-3">📷</th>
                                    <th className="text-center p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                {stats.filteredEntries.map(entry => (
                                    <tr key={entry.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                                        <td className="p-3">
                                            <div>{entry.date}</div>
                                            <div className="text-xs text-slate-500">{entry.time}</div>
                                        </td>
                                        <td className="p-3 font-mono font-bold">{entry.symbol}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getSetupColor(entry.setupId)}`}>
                                                {getSetupById(entry.setupId)?.name || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">${entry.entry.toFixed(2)}</td>
                                        <td className="p-3 text-right">${entry.exit.toFixed(2)}</td>
                                        <td className={`p-3 text-right font-bold ${entry.rMultiple >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {entry.rMultiple >= 0 ? '+' : ''}{entry.rMultiple.toFixed(2)}R
                                        </td>
                                        <td className={`p-3 text-right font-bold ${entry.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-center">
                                            {entry.images.length > 0 && (
                                                <button
                                                    onClick={() => setImageModal({ src: entry.images[0], zoom: 1 })}
                                                    className="text-amber-400 hover:text-amber-300"
                                                >
                                                    🖼️ {entry.images.length}
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => editEntry(entry)}
                                                className="text-slate-400 hover:text-amber-400 mr-2"
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => deleteEntry(entry.id)}
                                                className="text-slate-400 hover:text-rose-400"
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
                )}
            </div>
        </div>
    );
};

export default TradingJournal;
