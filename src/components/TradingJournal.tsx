import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

// ============= Types =============
interface SetupCategory {
    id: string;
    name: string;
    criteria: { htf: string[], ltf: string[], etf: string[] };
    color: string;
}

interface JournalEntry {
    id: string;
    date: string;
    time: string;
    symbol: string;
    direction: 'Long' | 'Short';
    tickValue: number; // Value per TICK (e.g. $1.25 for MES)
    tickSize: number;  // Size of one TICK (e.g. 0.25 for MES)
    setupId: string;
    criteriaUsed: { htf: string[], ltf: string[], etf: string[] };
    entry: number;
    exit: number;
    stopLoss: number;
    takeProfit: number;
    mfePrice: number; // Max Favorable Excursion Price
    maxMovePoints: number; // Calculated points from Entry to MFE
    quantity: number;
    commissions: number;
    pnl: number;
    pnlPercent: number;
    rMultiple: number;
    result: 'WIN' | 'LOSS' | 'BREAKEVEN';
    images: { htf: string | null, ltf: string | null, etf: string | null };
    notes: string;
}

// Default setup categories
const DEFAULT_SETUPS: SetupCategory[] = [
    { id: 'pullback', name: 'Pullback', criteria: { htf: ['HTF EMA20 Price', 'HTF Trend Direction'], ltf: [], etf: [] }, color: 'blue' },
    { id: 'fakeout', name: 'Fakeout', criteria: { htf: ['HTF VWAP Price'], ltf: ['LTF Volume Spike'], etf: [] }, color: 'purple' },
    { id: 'breakout', name: 'Breakout', criteria: { htf: [], ltf: ['Key Level Break'], etf: ['Volume Confirmation'] }, color: 'emerald' },
];

// Default global criteria
const DEFAULT_CRITERIA = {
    htf: ['Trend Direction', 'EMA 20 Context', 'VWAP Context', 'Volume Profile'],
    ltf: ['Opening Range', 'Key Level Break'],
    etf: ['CVD Divergence'],
};

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
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return parsed.map((e: any) => {
            if (Array.isArray(e.criteriaUsed)) {
                return { ...e, criteriaUsed: { htf: e.criteriaUsed, ltf: [], etf: [] } };
            }
            return e;
        });
    });

    const [setups, setSetups] = useState<SetupCategory[]>(() => {
        const saved = localStorage.getItem('tradingJournalSetups');
        if (!saved) return DEFAULT_SETUPS;
        const parsed = JSON.parse(saved);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return parsed.map((s: any) => {
            if (Array.isArray(s.criteria)) {
                return { ...s, criteria: { htf: s.criteria, ltf: [], etf: [] } };
            }
            return s;
        });
    });

    const [activeSubTab, setActiveSubTab] = useState<'history' | 'totalStats' | 'setupStats'>('history');

    const [criteriaLibrary, setCriteriaLibrary] = useState<{ htf: string[], ltf: string[], etf: string[] }>(() => {
        const saved = localStorage.getItem('tradingJournalCriteria');
        if (!saved) return DEFAULT_CRITERIA;
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            return { htf: parsed, ltf: [], etf: [] };
        }
        return parsed;
    });

    // Filters
    const [filterSetup, setFilterSetup] = useState<string>('all');
    const [filterCriteria, setFilterCriteria] = useState<string[]>([]);
    const [showBaseline, setShowBaseline] = useState(false);

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
        direction: 'Long' as 'Long' | 'Short', // Default Direction
        tickValue: '1.25', // Default MES Tick Value
        tickSize: '0.25',  // Default MES Tick Size
        setupId: '',
        criteriaUsed: { htf: [], ltf: [], etf: [] } as { htf: string[], ltf: string[], etf: string[] },
        stopLoss: '',
        takeProfit: '',
        entry: '',
        exit: '',
        mfePrice: '', // Changed from maxMove
        quantity: '1',
        commissions: '1.82', // Default MES Commission
        notes: '',
        images: { htf: null, ltf: null, etf: null } as { htf: string | null, ltf: string | null, etf: string | null },
    });

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

    useEffect(() => {
        if (activeSubTab === 'setupStats' && filterSetup === 'all' && setups.length > 0) {
            setFilterSetup(setups[0].id);
        }
    }, [activeSubTab, filterSetup, setups]);

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
            filtered = filtered.filter(e => {
                // Parse filter criteria into category:name pairs
                const parsedFilters = filterCriteria.map(fc => {
                    const [cat, ...nameParts] = fc.split(':');
                    return { cat: cat as keyof JournalEntry['criteriaUsed'], name: nameParts.join(':') };
                });

                // If in "By Setup" tab, we want EXACT set match for isolation analysis
                if (activeSubTab === 'setupStats') {
                    const totalTradeCriteriaCount = (e.criteriaUsed?.htf?.length || 0) +
                        (e.criteriaUsed?.ltf?.length || 0) +
                        (e.criteriaUsed?.etf?.length || 0);

                    if (totalTradeCriteriaCount !== filterCriteria.length) return false;

                    return parsedFilters.every(f =>
                        (e.criteriaUsed[f.cat] || []).some(ec => ec.trim().toLowerCase() === f.name.trim().toLowerCase())
                    );
                }

                // Otherwise (History tab / Global Filter), default to "Contains All" logic
                return parsedFilters.every(f =>
                    (e.criteriaUsed[f.cat] || []).some(ec => ec.trim().toLowerCase() === f.name.trim().toLowerCase())
                );
            });
        }

        return filtered;
    }, [entries, filterSetup, filterCriteria, activeSubTab]);

    const [currentStats, setCurrentStats] = useState(() => calculateStats(entries));

    useEffect(() => {
        setCurrentStats(calculateStats(filteredEntries));
    }, [filteredEntries, calculateStats]);

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

    // Baseline Stats for Comparison
    const setupBaselineStats = useMemo(() => {
        if (filterSetup === 'all') return null;
        return calculateStats(entries.filter(e => e.setupId === filterSetup));
    }, [entries, filterSetup, calculateStats]);

    // NEW: Advanced Analytics Logic (v2.3)
    const setupAnalytics = useMemo(() => {
        if (filteredEntries.length === 0) return null;

        // 1. Session Performance
        const sessions = {
            LON: { name: 'London', pnl: 0, total: 0, wins: 0 },
            NY: { name: 'New York', pnl: 0, total: 0, wins: 0 }
        };

        filteredEntries.forEach(e => {
            const time = parseInt(e.time.replace(':', ''));
            // London: 03:00 (0300) to 11:30 (1130)
            if (time >= 300 && time <= 1130) {
                sessions.LON.total++;
                sessions.LON.pnl += e.pnl;
                if (e.result === 'WIN') sessions.LON.wins++;
            }
            // NY: 08:30 (0830) to 17:00 (1700)
            if (time >= 830 && time <= 1700) {
                sessions.NY.total++;
                sessions.NY.pnl += e.pnl;
                if (e.result === 'WIN') sessions.NY.wins++;
            }
        });

        // 2. MFE Optimization Engine
        const optimizationData = [];
        for (let targetR = 0.5; targetR <= 10.0; targetR += 0.5) {
            let simulatedWins = 0;
            let simulatedLosses = 0;
            let simulatedBreakevens = 0;

            filteredEntries.forEach(e => {
                const risk = Math.abs(e.entry - e.stopLoss);
                if (risk === 0) return;

                const mfePrice = e.mfePrice || (e.result === 'WIN' ? e.exit : e.entry);
                const favorableMove = e.direction === 'Long'
                    ? Math.max(0, mfePrice - e.entry)
                    : Math.max(0, e.entry - mfePrice);

                const actualMfeR = favorableMove / risk;

                if (actualMfeR >= targetR) {
                    simulatedWins++;
                } else if (e.result === 'LOSS' || actualMfeR < 0.2) { // Heuristic for loss
                    simulatedLosses++;
                } else {
                    simulatedBreakevens++;
                }
            });

            const total = simulatedWins + simulatedLosses + simulatedBreakevens;
            if (total > 0) {
                const winRate = (simulatedWins / total) * 100;
                // Expectancy: (WR * Reward) - (LR * 1)
                const expectancy = (simulatedWins / total * targetR) - (simulatedLosses / total * 1);
                optimizationData.push({ targetR, winRate, expectancy });
            }
        }

        const bestEdge = [...optimizationData].sort((a, b) => b.expectancy - a.expectancy)[0];

        // 3. Frequency Analysis
        const dates = Array.from(new Set(filteredEntries.map(e => e.date)));
        const firstDate = new Date(Math.min(...dates.map(d => new Date(d).getTime())));
        const lastDate = new Date(Math.max(...dates.map(d => new Date(d).getTime())));
        const weeks = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
        const tradesPerWeek = filteredEntries.length / weeks;

        // 4. Streak & Form Analysis
        const sortedByDate = [...filteredEntries].sort((a, b) => {
            return new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime();
        });

        const recentForm = sortedByDate.slice(0, 5).map(e => e.result);

        let streakCount = 0;
        let streakType: 'WIN' | 'LOSS' | 'BREAKEVEN' | null = null;

        for (const trade of sortedByDate) {
            if (!streakType) {
                streakType = trade.result; // Initialize with most recent result
            }

            if (trade.result === streakType && streakType !== 'BREAKEVEN') {
                streakCount++;
            } else {
                break;
            }
        }

        return { sessions, bestEdge, tradesPerWeek, totalWeeks: weeks, currentStreak: { count: streakCount, type: streakType }, recentForm };
    }, [filteredEntries]);


    // ============= Handlers =============
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'htf' | 'ltf' | 'etf') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setFormData(prev => ({
                ...prev,
                images: {
                    ...prev.images,
                    [type]: base64
                }
            }));
        };
        reader.readAsDataURL(file);
    };

    const removeImage = (type: 'htf' | 'ltf' | 'etf') => {
        setFormData(prev => ({
            ...prev,
            images: {
                ...prev.images,
                [type]: null
            }
        }));
    };

    const handleSymbolChange = (val: string) => {
        const upperVal = val.toUpperCase();
        const config = FUTURES_SYMBOLS[upperVal];
        setFormData(prev => ({
            ...prev,
            symbol: upperVal,
            tickValue: config ? config.pointValue.toString() : prev.tickValue,
            tickSize: config ? (config.pointValue / 5).toString() : prev.tickSize, // Assuming tickSize is pointValue / 5 for now, needs proper config
            commissions: config ? config.commission.toString() : prev.commissions
        }));
    };

    const handleSubmit = () => {
        const entry = parseFloat(formData.entry) || 0;
        const exit = parseFloat(formData.exit) || 0;
        const stopLoss = parseFloat(formData.stopLoss) || 0;
        const quantity = parseFloat(formData.quantity) || 1;
        const tickValue = parseFloat(formData.tickValue) || 1.25;
        const tickSize = parseFloat(formData.tickSize) || 0.25;
        const commissions = parseFloat(formData.commissions) || 0;
        const mfePrice = parseFloat(formData.mfePrice); // Optional

        // P&L Logic
        let priceDiff = 0;
        if (formData.direction === 'Long') {
            priceDiff = exit - entry;
        } else {
            priceDiff = entry - exit;
        }

        // PnL = (Points / TickSize) * TickValue * Contracts - Commissions
        const pnl = ((priceDiff / tickSize) * tickValue * quantity) - commissions;

        // R-Multiple
        let riskPerContract = 0;
        if (formData.direction === 'Long') {
            riskPerContract = Math.abs(entry - stopLoss);
        } else {
            riskPerContract = Math.abs(stopLoss - entry);
        }

        // Ensure R is signed correctly? Usually R is positive for wins, negative for losses.
        // Or R-Multiple is a ratio. Ratio of Profit/Risk. 
        // If PnL > 0, +R. If PnL < 0, -R.
        // Theoretical R based on Exit:
        const rewardPerContract = Math.abs(priceDiff);
        let rMultiple = (riskPerContract > 0) ? (rewardPerContract / riskPerContract) : 0;
        if (pnl < 0) rMultiple = -rMultiple;

        let result: 'WIN' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
        if (pnl > 0) result = 'WIN';
        else if (pnl < 0) result = 'LOSS';

        // PnL Percent (ROI on Margin?) -> Futures ROI is based on Margin, but we don't track margin. 
        // Just use price % change?
        const pnlPercent = entry > 0 ? (priceDiff / entry) * 100 : 0;

        // Max Move Points (for stats)
        let maxMovePoints = 0;
        if (!isNaN(mfePrice) && mfePrice !== 0) {
            if (formData.direction === 'Long') {
                maxMovePoints = mfePrice - entry;
            } else {
                maxMovePoints = entry - mfePrice;
            }
            if (maxMovePoints < 0) maxMovePoints = 0; // MFE implies favorable
        }

        const newEntry: JournalEntry = {
            id: editingEntry?.id || `entry_${Date.now()}`,
            date: formData.date,
            time: formData.time,
            symbol: formData.symbol.toUpperCase(),
            direction: formData.direction,
            tickValue,
            tickSize,
            setupId: formData.setupId,
            criteriaUsed: formData.criteriaUsed,
            entry,
            exit,
            stopLoss,
            takeProfit: parseFloat(formData.takeProfit) || 0,
            mfePrice: mfePrice || 0,
            maxMovePoints,
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
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            symbol: 'MES',
            direction: 'Long',
            tickValue: '1.25',
            tickSize: '0.25',
            setupId: '',
            criteriaUsed: { htf: [], ltf: [], etf: [] },
            stopLoss: '',
            takeProfit: '',
            entry: '',
            exit: '',
            mfePrice: '',
            quantity: '1',
            commissions: '1.82',
            notes: '',
            images: { htf: null, ltf: null, etf: null },
        });
        setShowNewEntry(false);
        setEditingEntry(null);
    };

    const editEntry = (entry: JournalEntry) => {
        // Migration logic for old entries
        let direction = entry.direction;
        if (!direction) {
            if (entry.stopLoss && entry.entry) {
                direction = entry.stopLoss < entry.entry ? 'Long' : 'Short';
            } else {
                direction = 'Long';
            }
        }

        // Migration of mfePrice from legacy maxMove (points)
        let mfePrice = entry.mfePrice?.toString() || '';
        const legacyEntry = entry as unknown as { maxMove?: string | number };
        if (!mfePrice && legacyEntry.maxMove) {
            const points = parseFloat(legacyEntry.maxMove.toString());
            if (!isNaN(points) && points !== 0) {
                const entryPrice = entry.entry;
                if (direction === 'Long') {
                    mfePrice = (entryPrice + points).toString();
                } else {
                    mfePrice = (entryPrice - points).toString();
                }
            }
        }

        // Migration of images from legacy array
        let images: JournalEntry['images'] = { htf: null, ltf: null, etf: null };
        const entryImages = entry.images as unknown as (JournalEntry['images'] | string[]);
        if (Array.isArray(entryImages)) {
            images = {
                htf: entryImages[0] || null,
                ltf: entryImages[1] || null,
                etf: entryImages[2] || null
            };
        } else if (entryImages) {
            images = entryImages;
        }

        // Migration of criteriaUsed from legacy array
        let criteriaUsed: JournalEntry['criteriaUsed'] = { htf: [], ltf: [], etf: [] };
        const entryCriteria = entry.criteriaUsed as unknown as (JournalEntry['criteriaUsed'] | string[]);
        if (Array.isArray(entryCriteria)) {
            criteriaUsed = { htf: entryCriteria, ltf: [], etf: [] };
        } else if (entryCriteria) {
            criteriaUsed = entryCriteria;
        }

        setFormData({
            date: entry.date,
            time: entry.time,
            symbol: entry.symbol,
            direction,
            tickValue: entry.tickValue?.toString() || '1.25',
            tickSize: entry.tickSize?.toString() || '0.25',
            setupId: entry.setupId,
            criteriaUsed,
            entry: entry.entry.toString(),
            exit: entry.exit.toString(),
            stopLoss: entry.stopLoss.toString(),
            takeProfit: entry.takeProfit.toString(),
            mfePrice,
            quantity: entry.quantity.toString(),
            commissions: entry.commissions?.toString() || '',
            notes: entry.notes,
            images,
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
            criteria: { htf: [], ltf: [], etf: [] },
            color: ['blue', 'purple', 'emerald', 'amber', 'rose', 'cyan'][Math.floor(Math.random() * 6)],
        };
        setSetups(prev => [...prev, newSetup]);
        setNewSetupName('');
    };

    const deleteSetup = (id: string) => {
        setSetups(prev => prev.filter(s => s.id !== id));
    };

    const addCriteriaToSetup = (setupId: string, criteria: string, category: 'htf' | 'ltf' | 'etf' = 'htf') => {
        if (!criteria.trim()) return;
        setSetups(prev => prev.map(s => {
            if (s.id !== setupId) return s;
            const currentCat = s.criteria[category] || [];
            if (currentCat.includes(criteria)) return s;
            return {
                ...s,
                criteria: {
                    ...s.criteria,
                    [category]: [...currentCat, criteria]
                }
            };
        }));
        setNewCriteria('');
    };

    const removeCriteriaFromSetup = (setupId: string, criteria: string, category: 'htf' | 'ltf' | 'etf') => {
        setSetups(prev => prev.map(s => {
            if (s.id !== setupId) return s;
            return {
                ...s,
                criteria: {
                    ...s.criteria,
                    [category]: (s.criteria[category] || []).filter(c => c !== criteria)
                }
            };
        }));
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
                        <h2 className="text-2xl font-bold text-white">Trading Journal <span className="text-amber-500 text-sm">(v2.4.4)</span></h2>
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
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterSetup(e.target.value)}
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
                            <div className="flex flex-wrap gap-2">
                                {filterSetup !== 'all' ? (
                                    (['htf', 'ltf', 'etf'] as const).map(cat => (
                                        (getSetupById(filterSetup)?.criteria[cat] || []).map(c => {
                                            const scopedKey = `${cat}:${c}`;
                                            return (
                                                <button
                                                    key={`${cat}_${c}`}
                                                    onClick={() => setFilterCriteria(prev =>
                                                        prev.includes(scopedKey) ? prev.filter(x => x !== scopedKey) : [...prev, scopedKey]
                                                    )}
                                                    className={`px-2 py-0.5 text-[9px] rounded border transition-colors flex items-center gap-1 ${filterCriteria.includes(scopedKey)
                                                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:border-slate-500'
                                                        }`}
                                                >
                                                    <span className="opacity-40 text-[7px] uppercase">{cat}</span>
                                                    {c}
                                                </button>
                                            )
                                        })
                                    ))
                                ) : (
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
                                                    {(() => {
                                                        const allCriteria = [...entry.criteriaUsed.htf, ...entry.criteriaUsed.ltf, ...entry.criteriaUsed.etf];
                                                        if (allCriteria.length === 0) return null;
                                                        return (
                                                            <div className="flex flex-wrap gap-0.5 mt-1">
                                                                {allCriteria.slice(0, 2).map(c => (
                                                                    <span key={c} className="text-[9px] px-1 bg-slate-800 rounded text-slate-500">{c}</span>
                                                                ))}
                                                                {allCriteria.length > 2 && (
                                                                    <span className="text-[9px] px-1 bg-slate-800 rounded text-slate-500">+{allCriteria.length - 2}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
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
                                                    {(entry.images.htf || entry.images.ltf || entry.images.etf) ? (
                                                        <button
                                                            onClick={() => setImageModal({ src: (entry.images.htf || entry.images.ltf || entry.images.etf)!, zoom: 1, x: 0, y: 0 })}
                                                            className="text-amber-400 hover:text-amber-300 transition-colors"
                                                        >
                                                            🖼️
                                                            <span className="text-[8px] ml-0.5 opacity-60">
                                                                {[entry.images.htf, entry.images.ltf, entry.images.etf].filter(Boolean).length}
                                                            </span>
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
                                        <div className="text-xs text-slate-500 uppercase mb-2">Filter Analysis by Variables</div>
                                        <div className="p-4 border border-slate-700 rounded-lg bg-slate-800/20">
                                            <div className="text-xs font-bold text-slate-500 uppercase mb-3 flex justify-between items-center">
                                                <span>Variables Found in History</span>
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-[10px] text-amber-500/80 lowercase italic font-normal">Matching items: {filteredEntries.length}</span>
                                                    <button
                                                        onClick={() => setFilterCriteria([])}
                                                        className="text-[10px] text-slate-500 hover:text-amber-500 transition-colors uppercase font-bold"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                {(() => {
                                                    const harvested = {
                                                        htf: Array.from(new Set(entries.filter(e => e.setupId === filterSetup).flatMap(e => e.criteriaUsed?.htf || []))).sort(),
                                                        ltf: Array.from(new Set(entries.filter(e => e.setupId === filterSetup).flatMap(e => e.criteriaUsed?.ltf || []))).sort(),
                                                        etf: Array.from(new Set(entries.filter(e => e.setupId === filterSetup).flatMap(e => e.criteriaUsed?.etf || []))).sort(),
                                                    };

                                                    const hasAny = harvested.htf.length + harvested.ltf.length + harvested.etf.length > 0;

                                                    if (!hasAny) {
                                                        return <div className="text-xs text-slate-600 italic">No criteria found in trades for this setup yet.</div>;
                                                    }

                                                    const renderGroup = (label: string, items: string[], colorClass: string, cat: string) => {
                                                        if (items.length === 0) return null;
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className={`text-[9px] font-bold uppercase ${colorClass} opacity-60 tracking-widest`}>{label}</div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {items.map(c => {
                                                                        const scopedKey = `${cat}:${c}`;
                                                                        const isActive = filterCriteria.includes(scopedKey);
                                                                        return (
                                                                            <button
                                                                                key={scopedKey}
                                                                                type="button"
                                                                                onClick={() => setFilterCriteria(prev =>
                                                                                    isActive ? prev.filter(x => x !== scopedKey) : [...prev, scopedKey]
                                                                                )}
                                                                                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${isActive
                                                                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-sm shadow-amber-900/20'
                                                                                    : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400'
                                                                                    }`}
                                                                            >
                                                                                {isActive ? '✓ ' : ''}{c}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    };

                                                    return (
                                                        <>
                                                            {renderGroup('High Timeframe (HTF)', harvested.htf, 'text-blue-400', 'htf')}
                                                            {renderGroup('Internal Timeframe (LTF)', harvested.ltf, 'text-purple-400', 'ltf')}
                                                            {renderGroup('Entry Timeframe (ETF)', harvested.etf, 'text-emerald-400', 'etf')}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex justify-between items-center">
                                            <div className="text-[10px] text-amber-500/70 italic font-bold">
                                                * Isolation Mode: Trade must match selected variables EXACTLY.
                                            </div>
                                            <div className="text-[10px] text-slate-500 text-right">
                                                Analyzing {filteredEntries.length} of {entries.filter(e => e.setupId === filterSetup).length} trades
                                            </div>
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
                                                <StatCard
                                                    title="Setup Win Rate"
                                                    value={`${currentStats.winRate.toFixed(1)}%`}
                                                    type={currentStats.winRate >= 50 ? 'win' : 'loss'}
                                                    subtext={showBaseline && setupBaselineStats ? `vs ${setupBaselineStats.winRate.toFixed(1)}% (Global)` : undefined}
                                                />
                                                <StatCard
                                                    title="Setup P&L"
                                                    value={`$${currentStats.totalPnl.toLocaleString()}`}
                                                    type={currentStats.totalPnl >= 0 ? 'win' : 'loss'}
                                                    subtext={showBaseline && setupBaselineStats ? `vs $${setupBaselineStats.totalPnl.toLocaleString()} (Global)` : undefined}
                                                />
                                                <StatCard
                                                    title="Avg R"
                                                    value={`${currentStats.avgR.toFixed(2)} R`}
                                                    type={currentStats.avgR > 0 ? 'win' : 'loss'}
                                                    subtext={showBaseline && setupBaselineStats ? `vs ${setupBaselineStats.avgR.toFixed(2)} R (Global)` : undefined}
                                                />
                                                <StatCard
                                                    title="Profit Factor"
                                                    value={currentStats.profitFactor.toFixed(2)}
                                                    subtext={showBaseline && setupBaselineStats ? `vs ${setupBaselineStats.profitFactor.toFixed(2)} (Global)` : undefined}
                                                />
                                            </div>

                                            {/* Advanced Insights Cards */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                {/* 1. MFE Optimization */}
                                                <div className="bg-slate-800/40 p-5 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-900/5">
                                                    <h4 className="text-xs font-bold text-amber-500 uppercase mb-3 flex items-center gap-2">
                                                        <span>🎯</span> Edge Optimization (MFE)
                                                    </h4>
                                                    {setupAnalytics?.bestEdge ? (
                                                        <div className="space-y-3">
                                                            <div>
                                                                <div className="text-2xl font-bold text-white">{setupAnalytics.bestEdge.targetR.toFixed(1)} : 1</div>
                                                                <div className="text-[10px] text-slate-500 uppercase font-bold">Suggested Target R:R</div>
                                                            </div>
                                                            <div className="flex items-center gap-4 border-t border-slate-700/50 pt-3">
                                                                <div>
                                                                    <div className="text-lg font-bold text-amber-400">{setupAnalytics.bestEdge.winRate.toFixed(1)}%</div>
                                                                    <div className="text-[9px] text-slate-500 uppercase">Win Rate at this R</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-lg font-bold text-emerald-400">{setupAnalytics.bestEdge.expectancy.toFixed(2)}R</div>
                                                                    <div className="text-[9px] text-slate-500 uppercase">Exp. Per Trade</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-slate-500 italic py-4">Not enough MFE data to optimize.</div>
                                                    )}
                                                </div>

                                                {/* 2. Session Performance */}
                                                <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                                        <span>🌐</span> Session Performance
                                                    </h4>
                                                    <div className="space-y-4">
                                                        {['LON', 'NY'].map(sessKey => {
                                                            const s = setupAnalytics?.sessions[sessKey as 'LON' | 'NY'];
                                                            const wr = s?.total ? (s.wins / s.total * 100) : 0;
                                                            return (
                                                                <div key={sessKey} className="flex items-center justify-between">
                                                                    <div>
                                                                        <div className="text-sm font-bold text-slate-200">{s?.name}</div>
                                                                        <div className="text-[9px] text-slate-500">{s?.total} Trades</div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className={`text-sm font-bold ${wr >= 50 ? 'text-emerald-400' : 'text-slate-400'}`}>{wr.toFixed(1)}% WR</div>
                                                                        <div className={`text-[9px] font-bold ${s && s.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                            {s && s.pnl >= 0 ? '+' : ''}${s?.pnl.toLocaleString()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* 3. Trade Frequency */}
                                                <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                                        <span>⚡</span> Trade Frequency
                                                    </h4>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <div className="text-2xl font-bold text-white">{setupAnalytics?.tradesPerWeek.toFixed(1)}</div>
                                                            <div className="text-[10px] text-slate-500 uppercase font-bold">Avg Trades Per Week</div>
                                                        </div>
                                                        <div className="border-t border-slate-700/50 pt-3">
                                                            <div className="text-sm font-bold text-slate-200 uppercase">Peak Activity</div>
                                                            <div className="text-[10px] text-slate-400">
                                                                {timeOfDayData.length > 0
                                                                    ? `Most active at ${[...timeOfDayData].sort((a, b) => b.total - a.total)[0].hour}`
                                                                    : 'No time data available'
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. Current Form & Streak */}
                                                <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                                        <span>🔥</span> Current Form
                                                    </h4>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <div className={`text-2xl font-bold ${setupAnalytics?.currentStreak.type === 'WIN' ? 'text-emerald-400' : setupAnalytics?.currentStreak.type === 'LOSS' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                                {setupAnalytics?.currentStreak.count} {setupAnalytics?.currentStreak.type ? (setupAnalytics.currentStreak.count === 1 ? (setupAnalytics.currentStreak.type === 'WIN' ? 'WIN' : 'LOSS') : (setupAnalytics.currentStreak.type === 'WIN' ? 'WINS' : 'LOSSES')) : 'TRADES'}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 uppercase font-bold">Current Streak</div>
                                                        </div>
                                                        <div className="border-t border-slate-700/50 pt-3">
                                                            <div className="text-xs text-slate-400 mb-2">Last 5 Trades:</div>
                                                            <div className="flex gap-1.5">
                                                                {setupAnalytics?.recentForm.map((result, i) => (
                                                                    <div
                                                                        key={i}
                                                                        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${result === 'WIN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                                            result === 'LOSS' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                                                                'bg-slate-700 text-slate-400 border border-slate-600'
                                                                            }`}
                                                                    >
                                                                        {result === 'WIN' ? 'W' : result === 'LOSS' ? 'L' : '-'}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Baseline Toggle */}
                                            <div className="flex items-center space-x-3 bg-slate-800/20 p-3 rounded-lg border border-slate-800">
                                                <input
                                                    type="checkbox"
                                                    id="compareBaseline"
                                                    checked={showBaseline}
                                                    onChange={(e) => setShowBaseline(e.target.checked)}
                                                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                                                />
                                                <label htmlFor="compareBaseline" className="text-xs text-slate-400 cursor-pointer select-none">
                                                    Compare with **Setup Global Baseline** (Includes all trades for this setup)
                                                </label>
                                            </div>

                                            {/* Setup Performance Graph Placeholder or Additional Insights */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Setup Expectancy</h4>
                                                    <div className="text-3xl font-light text-white">
                                                        {((currentStats.winRate / 100 * currentStats.avgWinR) - ((1 - currentStats.winRate / 100) * Math.abs(currentStats.avgLossR))).toFixed(2)}R
                                                    </div>
                                                    {showBaseline && setupBaselineStats && (
                                                        <div className="text-[10px] text-slate-500 mt-1">
                                                            Baseline: {((setupBaselineStats.winRate / 100 * setupBaselineStats.avgWinR) - ((1 - setupBaselineStats.winRate / 100) * Math.abs(setupBaselineStats.avgLossR))).toFixed(2)}R
                                                        </div>
                                                    )}
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
                                                                formatter={(value?: number) => [`$${(value || 0).toFixed(2)}`, 'Equity']}
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
                    <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">⚙️ Setup Manager</h3>
                            <button onClick={() => setShowSetupManager(false)} className="text-slate-400 hover:text-white bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-10">
                            {/* Section 1: Global Criteria Library */}
                            <div>
                                <h4 className="text-sm font-bold text-amber-500 uppercase mb-4 flex items-center gap-2">
                                    📚 Global Criteria Library
                                    <span className="text-[10px] font-normal text-slate-500 lowercase normal-case italic">(Common variables)</span>
                                </h4>
                                <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700 space-y-6 shadow-inner">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="New criteria name..."
                                            value={newCriteria}
                                            onChange={(e) => setNewCriteria(e.target.value)}
                                            className="flex-1 bg-slate-900 text-slate-100 px-4 py-2.5 rounded-lg border border-slate-700 focus:border-amber-500 outline-none transition-colors text-sm"
                                        />
                                        <div className="flex gap-1">
                                            {(['htf', 'ltf', 'etf'] as const).map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => {
                                                        if (!newCriteria.trim()) return;
                                                        setCriteriaLibrary(prev => ({
                                                            ...prev,
                                                            [cat]: [...(prev[cat] || []), newCriteria.trim()]
                                                        }));
                                                        setNewCriteria('');
                                                    }}
                                                    className={`px-3 py-2 text-[10px] font-bold rounded uppercase transition-colors ${cat === 'htf' ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40' :
                                                        cat === 'ltf' ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/40' :
                                                            'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40'
                                                        }`}
                                                >
                                                    + {cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {(['htf', 'ltf', 'etf'] as const).map(cat => (
                                            <div key={cat} className="space-y-2">
                                                <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                                    {cat === 'htf' ? '🟦 HTF' : cat === 'ltf' ? '🟪 LTF' : '🟩 ETF'}
                                                </div>
                                                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-900/50 rounded-lg border border-slate-800">
                                                    {(criteriaLibrary[cat] || []).length === 0 ? (
                                                        <div className="text-[9px] text-slate-700 italic">Empty</div>
                                                    ) : (
                                                        (criteriaLibrary[cat] || []).map(c => (
                                                            <span key={c} className="px-2 py-1 bg-slate-800 text-slate-400 text-[10px] rounded border border-slate-700 flex items-center gap-1 group">
                                                                {c}
                                                                <button
                                                                    onClick={() => setCriteriaLibrary(prev => ({
                                                                        ...prev,
                                                                        [cat]: prev[cat].filter(x => x !== c)
                                                                    }))}
                                                                    className="text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        ))}
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
                                        className="flex-1 bg-slate-800 text-slate-100 px-4 py-2 rounded-lg border border-slate-700 focus:border-amber-500 outline-none text-sm"
                                    />
                                    <button
                                        onClick={addSetup}
                                        className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg transition-colors text-xs"
                                    >
                                        + Create Setup
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {setups.map(setup => (
                                        <div key={setup.id} className="bg-slate-800/30 p-4 rounded-xl border border-slate-700">
                                            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                                                <span className={`px-2 py-1 rounded text-sm font-bold border ${getSetupColor(setup.id)}`}>
                                                    {setup.name}
                                                </span>
                                                <button onClick={() => deleteSetup(setup.id)} className="text-slate-500 hover:text-rose-400 text-[10px] uppercase font-bold tracking-widest transition-colors">Delete</button>
                                            </div>

                                            <div className="space-y-4">
                                                {(['htf', 'ltf', 'etf'] as const).map(cat => (
                                                    <div key={cat} className="space-y-2">
                                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter flex items-center gap-2 opacity-60">
                                                            {cat === 'htf' ? 'High Timeframe (HTF)' : cat === 'ltf' ? 'Internal Timeframe (LTF)' : 'Entry Logic (ETF)'}
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(setup.criteria[cat] || []).map(c => (
                                                                <span key={c} className="px-2 py-1 bg-slate-700/50 text-slate-300 text-[10px] rounded flex items-center gap-1 border border-slate-600/30 group">
                                                                    {c}
                                                                    <button onClick={() => removeCriteriaFromSetup(setup.id, c, cat)} className="hover:text-rose-400 ml-1 transition-colors opacity-60 group-hover:opacity-100">×</button>
                                                                </span>
                                                            ))}
                                                            <button
                                                                onClick={() => setSelectedSetupForCriteria(selectedSetupForCriteria === `${setup.id}_${cat}` ? null : `${setup.id}_${cat}`)}
                                                                className="px-2 py-1 bg-slate-900 border border-dashed border-slate-700 text-slate-500 text-[10px] rounded hover:border-amber-500 hover:text-amber-500 transition-colors"
                                                            >
                                                                + Link variable
                                                            </button>
                                                        </div>

                                                        {selectedSetupForCriteria === `${setup.id}_${cat}` && (
                                                            <div className="mt-2 p-3 bg-slate-900 rounded-lg border border-slate-700 shadow-xl border-amber-500/20">
                                                                <div className="text-[9px] font-bold text-amber-500/60 uppercase mb-2">Select from {cat.toUpperCase()} Library</div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(criteriaLibrary[cat] || []).filter(c => !(setup.criteria[cat] || []).includes(c)).length === 0 ? (
                                                                        <div className="text-[10px] text-slate-600 italic px-1 text-center w-full">Library empty for this category.</div>
                                                                    ) : (
                                                                        (criteriaLibrary[cat] || []).filter(c => !(setup.criteria[cat] || []).includes(c)).map(c => (
                                                                            <button
                                                                                key={c}
                                                                                onClick={() => addCriteriaToSetup(setup.id, c, cat)}
                                                                                className="px-2 py-1 bg-slate-800 hover:bg-amber-600/20 text-slate-400 hover:text-amber-500 text-[10px] rounded transition-colors border border-slate-700"
                                                                            >
                                                                                + {c}
                                                                            </button>
                                                                        ))
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
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
            {
                showNewEntry && (
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
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5">Direction</label>
                                        <div className="flex bg-slate-800 rounded p-1 border border-slate-700 h-[38px]">
                                            <button
                                                onClick={() => setFormData(p => ({ ...p, direction: 'Long' }))}
                                                className={`flex-1 text-xs font-bold rounded transition-colors ${formData.direction === 'Long' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                LONG
                                            </button>
                                            <button
                                                onClick={() => setFormData(p => ({ ...p, direction: 'Short' }))}
                                                className={`flex-1 text-xs font-bold rounded transition-colors ${formData.direction === 'Short' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                                            >
                                                SHORT
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1.5 focus:text-amber-500">Tick Val ($)</label>
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
                                            onChange={(e) => setFormData(p => ({ ...p, setupId: e.target.value, criteriaUsed: { htf: [], ltf: [], etf: [] } }))}
                                            className="w-full bg-slate-800 text-slate-200 px-4 py-2.5 rounded-lg border border-slate-600 focus:border-amber-500 outline-none"
                                        >
                                            <option value="">Select a setup...</option>
                                            {setups.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {formData.setupId && (
                                        <div className="space-y-4">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-2">Assign Process Variables</label>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                {(['htf', 'ltf', 'etf'] as const).map(cat => (
                                                    <div key={cat} className="space-y-2.5">
                                                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 bg-slate-800/50 px-2 py-1 rounded">
                                                            {cat === 'htf' ? '🟦 HTF Context' : cat === 'ltf' ? '🟪 LTF Sequence' : '🟩 ETF Entry'}
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {(criteriaLibrary[cat] || []).length === 0 ? (
                                                                <div className="text-[10px] text-slate-700 italic">No library items</div>
                                                            ) : (
                                                                (criteriaLibrary[cat] || []).map(c => {
                                                                    const isInSetup = getSetupById(formData.setupId)?.criteria[cat]?.includes(c);
                                                                    const isSelected = formData.criteriaUsed[cat]?.includes(c);
                                                                    return (
                                                                        <button
                                                                            key={c}
                                                                            type="button"
                                                                            onClick={() => setFormData(p => {
                                                                                const currentCat = p.criteriaUsed[cat] || [];
                                                                                return {
                                                                                    ...p,
                                                                                    criteriaUsed: {
                                                                                        ...p.criteriaUsed,
                                                                                        [cat]: isSelected
                                                                                            ? currentCat.filter(x => x !== c)
                                                                                            : [...currentCat, c]
                                                                                    }
                                                                                };
                                                                            })}
                                                                            className={`px-3 py-1.5 text-[10px] rounded-lg border transition-all flex items-center gap-1.5 ${isSelected
                                                                                ? (cat === 'htf' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                                                                                    cat === 'ltf' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' :
                                                                                        'bg-emerald-500/20 text-emerald-400 border-emerald-500/50')
                                                                                : isInSetup
                                                                                    ? 'bg-slate-800/80 text-slate-300 border-amber-500/40 hover:border-amber-500/60'
                                                                                    : 'bg-slate-900/50 text-slate-600 border-slate-800 hover:border-slate-700'
                                                                                }`}
                                                                        >
                                                                            {isSelected && <span className="text-[8px]">✓</span>}
                                                                            {c}
                                                                            {isInSetup && !isSelected && <span className="text-[8px] text-amber-500/50">★</span>}
                                                                        </button>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-slate-600 mt-2 italic flex items-center gap-2">
                                                <span className="text-amber-500/60 font-bold">★</span> Recommended criteria for this setup. Grouped by HTF/LTF/ETF.
                                            </p>
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
                                                <label className="block text-[10px] text-amber-500 uppercase font-bold mb-1.5">Max MFE Price</label>
                                                <input
                                                    type="number" step="0.25"
                                                    value={formData.mfePrice}
                                                    onChange={(e) => setFormData(p => ({ ...p, mfePrice: e.target.value }))}
                                                    className="w-full bg-slate-800 text-amber-500 px-3 py-2.5 rounded-lg border border-slate-700 text-sm font-bold focus:border-amber-500 outline-none"
                                                    placeholder="Max Favorable Price"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Images & Notes */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                    <div>
                                        <label className="text-[10px] uppercase text-slate-500 font-bold block mb-3">Charts (HTF / LTF / ETF)</label>
                                        <div className="flex gap-3">
                                            {/* HTF Upload */}
                                            <div className="flex-1">
                                                {formData.images.htf ? (
                                                    <div className="relative group w-full h-24">
                                                        <img
                                                            src={formData.images.htf}
                                                            alt="HTF"
                                                            className="w-full h-full object-cover rounded-lg border border-slate-700 cursor-zoom-in"
                                                            onClick={() => setImageModal({ src: formData.images.htf as string, zoom: 1, x: 0, y: 0 })}
                                                        />
                                                        <button
                                                            onClick={() => removeImage('htf')}
                                                            className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            ×
                                                        </button>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white text-center py-0.5 rounded-b-lg backdrop-blur-sm">
                                                            HTF
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-500 transition-all bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer">
                                                        <span className="text-xl">📷</span>
                                                        <span className="text-[9px] mt-1 font-bold">ADD HTF</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'htf')} />
                                                    </label>
                                                )}
                                            </div>

                                            {/* LTF Upload */}
                                            <div className="flex-1">
                                                {formData.images.ltf ? (
                                                    <div className="relative group w-full h-24">
                                                        <img
                                                            src={formData.images.ltf}
                                                            alt="LTF"
                                                            className="w-full h-full object-cover rounded-lg border border-slate-700 cursor-zoom-in"
                                                            onClick={() => setImageModal({ src: formData.images.ltf!, zoom: 1, x: 0, y: 0 })}
                                                        />
                                                        <button
                                                            onClick={() => removeImage('ltf')}
                                                            className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            ×
                                                        </button>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white text-center py-0.5 rounded-b-lg backdrop-blur-sm">
                                                            LTF
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-500 transition-all bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer">
                                                        <span className="text-xl">📷</span>
                                                        <span className="text-[9px] mt-1 font-bold">ADD LTF</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'ltf')} />
                                                    </label>
                                                )}
                                            </div>

                                            {/* ETF Upload */}
                                            <div className="flex-1">
                                                {formData.images.etf ? (
                                                    <div className="relative group w-full h-24">
                                                        <img
                                                            src={formData.images.etf}
                                                            alt="ETF"
                                                            className="w-full h-full object-cover rounded-lg border border-slate-700 cursor-zoom-in"
                                                            onClick={() => setImageModal({ src: formData.images.etf!, zoom: 1, x: 0, y: 0 })}
                                                        />
                                                        <button
                                                            onClick={() => removeImage('etf')}
                                                            className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            ×
                                                        </button>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white text-center py-0.5 rounded-b-lg backdrop-blur-sm">
                                                            ETF
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="w-full h-24 border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-amber-500 hover:text-amber-500 transition-all bg-slate-800/30 hover:bg-slate-800/50 cursor-pointer">
                                                        <span className="text-xl">📷</span>
                                                        <span className="text-[9px] mt-1 font-bold">ADD ETF</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'etf')} />
                                                    </label>
                                                )}
                                            </div>
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
                )
            }

            {/* Image Modal */}
            {
                imageModal && createPortal(
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
                )
            }
        </div >
    );
};

export default TradingJournal;
