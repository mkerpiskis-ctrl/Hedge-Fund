import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

// Types
interface FireEntry {
    date: string;
    capitalEuro: number;
    capitalUsd: number;
    contributionMkUsd: number;
    contributionKjUsd: number;
    fxRate: number;
}

interface Milestone {
    name: string;
    target: number;
    age: number;
    year: number;
}

interface FireSettings {
    inflationRate: number;
    returnRateBear: number;
    returnRateBase: number;
    returnRateBull: number;
    milestones: Milestone[];
}

const FireTracker: React.FC = () => {
    const [subTab, setSubTab] = useState<'overview' | 'update' | 'scenarios' | 'analytics' | 'history' | 'settings'>('overview');

    // State for Settings
    const [settings, setSettings] = useState<FireSettings>(() => {
        const saved = localStorage.getItem('fire_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        const defaults = {
            inflationRate: 2.5,
            returnRateBear: 5.0,
            returnRateBase: 7.0,
            returnRateBull: 9.0,
            milestones: [
                { name: 'Grinding', target: 273508, age: 40, year: 2030 },
                { name: 'YOUR RETIREMENT (MK)', target: 661837, age: 46, year: 2036 },
                { name: 'SPOUSE RETIREMENT (KJ)', target: 850000, age: 58, year: 2048 }
            ]
        };
        // Merge saved settings with defaults to handle new fields (like milestones)
        return {
            ...defaults,
            ...parsed,
            milestones: parsed.milestones || defaults.milestones
        };
    });

    // Persist Settings
    useEffect(() => {
        localStorage.setItem('fire_settings', JSON.stringify(settings));
    }, [settings]);

    // State for Data
    const [entries, setEntries] = useState<FireEntry[]>(() => {
        const saved = localStorage.getItem('fire_entries');
        return saved ? JSON.parse(saved) : [];
    });

    // Persist Data
    useEffect(() => {
        localStorage.setItem('fire_entries', JSON.stringify(entries));
    }, [entries]);

    // State for New Entry Form
    const [newEntry, setNewEntry] = useState({
        date: new Date().toISOString().split('T')[0],
        portfolioUsd: '',
        contribMk: '',
        contribKj: '',
        contribMkEur: '',
        contribKjEur: '', // New field for KJ EUR input
        fxRate: '1.1689' // Default from screenshot
    });

    // Editing State
    const [editingEntry, setEditingEntry] = useState<{ index: number; data: FireEntry } | null>(null);

    const handleAddEntry = () => {
        console.log('Adding entry...', newEntry);

        // Validation with alerts
        if (!newEntry.portfolioUsd) {
            alert('Please enter a Portfolio Value (USD).');
            return;
        }
        if (!newEntry.fxRate) {
            alert('Please enter an FX Rate.');
            return;
        }
        if (!newEntry.date) {
            alert('Please enter a Date.');
            return;
        }

        const pUsd = parseFloat(newEntry.portfolioUsd);
        const fx = parseFloat(newEntry.fxRate);

        // MK Contribution = Manual USD + (Manual EUR * FX)
        const mkUsdInput = parseFloat(newEntry.contribMk) || 0;
        const mkEurInput = parseFloat(newEntry.contribMkEur) || 0;
        // Check for NaN if user entered invalid text
        if (isNaN(mkUsdInput) || isNaN(mkEurInput)) {
            alert('Invalid numeric input for MK Contribution.');
            return;
        }

        const mkTotal = mkUsdInput + (mkEurInput * fx);

        // KJ Contribution logic
        const kj = parseFloat(newEntry.contribKj) || 0;

        const entry: FireEntry = {
            date: newEntry.date,
            capitalUsd: pUsd,
            capitalEuro: pUsd / fx,
            contributionMkUsd: mkTotal,
            contributionKjUsd: kj,
            fxRate: fx
        };

        const updatedEntries = [entry, ...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEntries(updatedEntries);
        // Reset form but keep FX
        setNewEntry(prev => ({ ...prev, portfolioUsd: '', contribMk: '', contribKj: '', contribMkEur: '', contribKjEur: '' }));
        alert('Entry Added!');
    };

    const handleDeleteEntry = (index: number) => {
        if (window.confirm('Are you sure you want to delete this entry?')) {
            const newEntries = [...entries];
            newEntries.splice(index, 1);
            setEntries(newEntries);
            if (editingEntry) setEditingEntry(null); // Close modal if open
        }
    };

    const handleSaveEdit = () => {
        if (!editingEntry) return;
        const { index, data } = editingEntry;
        const updatedEntries = [...entries];
        // Recalculate capitalEuro just in case
        const ent = { ...data, capitalEuro: data.capitalUsd / data.fxRate };
        updatedEntries[index] = ent;
        setEntries(updatedEntries);
        setEditingEntry(null);
    };

    const handleAddMilestone = () => {
        const newMilestone = { name: 'New Goal', target: 0, age: 0, year: new Date().getFullYear() + 1 };
        setSettings({ ...settings, milestones: [...settings.milestones, newMilestone] });
    };

    const handleDeleteMilestone = (index: number) => {
        if (window.confirm('Delete this milestone?')) {
            const newM = [...settings.milestones];
            newM.splice(index, 1);
            setSettings({ ...settings, milestones: newM });
        }
    };



    // Derived Stats
    const latestEntry = entries.length > 0 ? entries[0] : null;
    const currentCapitalEuro = latestEntry ? latestEntry.capitalEuro : 0;
    const currentCapitalUsd = latestEntry ? latestEntry.capitalUsd : 0;

    // Avg Contribution
    const avgContribUsd = entries.length > 0
        ? entries.reduce((sum, e) => sum + e.contributionMkUsd + e.contributionKjUsd, 0) / entries.length
        : 0;

    // Weighted Avg FX or just latest? Let's use latest FX for display consistency
    const latestFx = latestEntry ? latestEntry.fxRate : 1.1689;
    const avgContribEuro = avgContribUsd / latestFx;

    // Scenarios Logic
    const currentYear = new Date().getFullYear();
    const targetYear1 = 2036;
    const targetYear2 = 2048;
    const yearsToT1 = targetYear1 - currentYear;
    const yearsToT2 = targetYear2 - currentYear;

    const calculateProjection = (years: number, realReturnRate: number) => {
        const r = realReturnRate / 100;
        const n = years;
        const pv = currentCapitalEuro;
        const pmt = avgContribEuro * 12; // Annual contribution

        // FV = PV * (1+r)^n + PMT * [ ((1+r)^n - 1) / r ]
        const fv = pv * Math.pow(1 + r, n) + pmt * ((Math.pow(1 + r, n) - 1) / r);
        return fv;
    };

    // Real returns (Nominal - Inflation)
    const bearRate = settings.returnRateBear - settings.inflationRate;
    const baseRate = settings.returnRateBase - settings.inflationRate;
    const bullRate = settings.returnRateBull - settings.inflationRate;

    const proj2036 = {
        bear: calculateProjection(yearsToT1, bearRate),
        base: calculateProjection(yearsToT1, baseRate),
        bull: calculateProjection(yearsToT1, bullRate)
    };

    const proj2048 = {
        bear: calculateProjection(yearsToT2, bearRate),
        base: calculateProjection(yearsToT2, baseRate),
        bull: calculateProjection(yearsToT2, bullRate)
    };

    const renderScenarioRow = (label: string, value: number, target: number, color: string) => {
        const diff = target - value;
        const isReached = value >= target;
        return (
            <tr className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/20 transition-colors">
                <td className="p-3 text-xs flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${color}`}></div>
                    <span className="text-slate-300 font-medium">{label}</span>
                </td>
                <td className="p-3 text-xs text-right font-mono text-slate-200">€{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="p-3 text-xs text-right font-mono text-slate-400">€{(value / Math.pow(1.025, yearsToT1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}*</td>
                <td className="p-3 text-xs text-right font-mono text-slate-400">€{diff > 0 ? diff.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}</td>
                <td className="p-3 text-xs text-right font-bold">
                    {isReached
                        ? <span className="text-emerald-400">✓ Above target</span>
                        : <span className="text-rose-400">✕ Below target</span>
                    }
                </td>
            </tr>
        );
    };

    // Milestones - Use Settings
    const milestones = settings.milestones || [
        { name: 'Grinding', target: 273508, age: 40, year: 2030 },
        { name: 'YOUR RETIREMENT (MK)', target: 661837, age: 46, year: 2036 },
        { name: 'SPOUSE RETIREMENT (KJ)', target: 850000, age: 58, year: 2048 }
    ];

    let activeMilestone = milestones[0];
    let nextMilestone = milestones[0];

    for (const m of milestones) {
        if (currentCapitalEuro < m.target) {
            nextMilestone = m;
            activeMilestone = m; // Active goal is the next unreached one
            break;
        }
    }

    // If all reached
    if (currentCapitalEuro >= milestones[milestones.length - 1].target) {
        activeMilestone = { name: 'FAT FIRE', target: 1000000, age: 99, year: 9999 };
        nextMilestone = activeMilestone;
    }

    // Determine Subsequent Milestone (Next after Active)
    let subsequentMilestone = milestones[milestones.length - 1];
    const activeIndex = milestones.indexOf(activeMilestone);
    if (activeIndex !== -1 && activeIndex < milestones.length - 1) {
        subsequentMilestone = milestones[activeIndex + 1];
    } else if (activeIndex === -1) {
        // FAT FIRE or unknown
        subsequentMilestone = activeMilestone;
    } else {
        // Last one is active
        subsequentMilestone = activeMilestone;
    }

    const progressPercent = Math.min(100, Math.max(0, (currentCapitalEuro / nextMilestone.target) * 100));

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Stats Block */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-1">Current Capital</div>
                    <div className="text-2xl font-bold text-emerald-400">€{currentCapitalEuro.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="text-xs text-slate-500">${currentCapitalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-1">Active Milestone</div>
                    <div className="text-2xl font-bold text-emerald-400">{activeMilestone.name.split(' (')[0]}</div>
                    <div className="text-xs text-slate-500">{activeMilestone.year} • age {activeMilestone.age}</div>
                </div>
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-1">Progress</div>
                    <div className="text-2xl font-bold text-emerald-400">{progressPercent.toFixed(1)}%</div>
                    <div className="text-xs text-slate-500">€{nextMilestone.target.toLocaleString()}</div>
                </div>
                <div className="glass-panel p-4 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-1">Avg Monthly Contrib</div>
                    <div className="text-2xl font-bold text-emerald-400">${avgContribUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className="text-xs text-slate-500">€{avgContribEuro.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
            </div>

            {/* Sub-Navigation */}
            < div className="flex flex-wrap items-center gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50" >
                <button
                    onClick={() => setSubTab('overview')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'overview'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">📊</span>
                    Overview
                </button>
                <button
                    onClick={() => setSubTab('update')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'update'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">+</span>
                    Monthly update
                </button>
                <button
                    onClick={() => setSubTab('scenarios')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'scenarios'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">📈</span>
                    Scenarios
                </button>
                <button
                    onClick={() => setSubTab('analytics')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'analytics'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">🔬</span>
                    Analytics
                </button>
                <button
                    onClick={() => setSubTab('history')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'history'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">📜</span>
                    History
                </button>
                <button
                    onClick={() => setSubTab('settings')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${subTab === 'settings'
                        ? 'bg-emerald-500 text-slate-900 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                >
                    <span className="mr-2">⚙</span>
                    Settings
                </button>
            </div >

            {/* Content Area */}
            < div className="glass-panel p-6 min-h-[400px]" >
                {subTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Milestones Panel */}
                        <div className="space-y-4">
                            <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                <span>◎</span> <span>Milestones</span>
                            </h3>

                            <div className="space-y-4">
                                {milestones.map((m) => {
                                    const mProgress = Math.min(100, Math.max(0, (currentCapitalEuro / m.target) * 100));
                                    const isReached = currentCapitalEuro >= m.target;

                                    return (
                                        <div key={m.name} className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/50 relative overflow-hidden">
                                            <div className="flex justify-between items-end mb-2 relative z-10">
                                                <div>
                                                    <div className="font-bold text-slate-200 text-sm flex items-center space-x-2">
                                                        {isReached && <span className="text-emerald-400">✓</span>}
                                                        <span>{m.name}</span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                        {m.year} • age {m.age}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-slate-200 text-sm">€{m.target.toLocaleString()}</div>
                                                    <div className="text-[10px] text-slate-500">Target</div>
                                                </div>
                                            </div>

                                            {/* Progress Bar Container */}
                                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative z-10">
                                                <div
                                                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-1000 ease-out rounded-full"
                                                    style={{ width: `${mProgress}%` }}
                                                ></div>
                                            </div>

                                            <div className="text-right mt-1 text-[10px] text-slate-500 relative z-10">
                                                {mProgress.toFixed(1)}%
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Financial Health Panel */}
                        <div className="space-y-4">
                            <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                <span>♡</span> <span>Financial health</span>
                            </h3>

                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start space-x-3">
                                <span className="text-amber-500 text-lg">⚠</span>
                                <div>
                                    <div className="text-amber-500 font-bold text-xs">SWR not sufficient yet. Short by ~€{(20856).toLocaleString()}/year.</div>
                                </div>
                            </div>

                            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/50">
                                <p className="text-xs text-slate-400 italic mb-4">
                                    <strong className="text-slate-300">SWR Analysis:</strong> At 3.5% withdrawal rate, portfolio has a "safe cash runway" of ~<span className="text-emerald-400 font-bold">29 years</span> (assuming 0% post-retirement growth).
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="glass-panel p-3 border-slate-800 bg-slate-950/30 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold">SWR @ 3.5%</div>
                                        <div className="text-emerald-400 font-bold mt-1">€262/mo</div>
                                    </div>
                                    <div className="glass-panel p-3 border-slate-800 bg-slate-950/30 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold">RUNWAY (CASH)</div>
                                        <div className="text-emerald-400 font-bold mt-1">29 years</div>
                                    </div>
                                    <div className="glass-panel p-3 border-slate-800 bg-slate-950/30 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold">LONG-TERM CAP GAINS</div>
                                        <div className="text-emerald-400 font-bold mt-1">$3,938</div>
                                    </div>
                                    <div className="glass-panel p-3 border-slate-800 bg-slate-950/30 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold">NET GAIN</div>
                                        <div className="text-emerald-400 font-bold mt-1">$22,312</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {
                    subTab === 'update' && (
                        <div className="max-w-2xl mx-auto">
                            <div className="mb-6">
                                <h3 className="text-lg font-bold text-emerald-400 mb-1">+ Monthly update</h3>
                                <p className="text-xs text-slate-500">Track contributions by contributor (MK or KJ). Portfolio value in USD.</p>
                            </div>

                            <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800/50 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Date</label>
                                        <input
                                            type="date"
                                            value={newEntry.date}
                                            onChange={e => setNewEntry({ ...newEntry, date: e.target.value })}
                                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Portfolio Value (USD)</label>
                                        <input
                                            type="number"
                                            value={newEntry.portfolioUsd}
                                            onChange={e => setNewEntry({ ...newEntry, portfolioUsd: e.target.value })}
                                            placeholder="0.00"
                                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">MK Contribution (EUR)</label>
                                        <input
                                            type="number"
                                            value={newEntry.contribMkEur}
                                            onChange={(e) => setNewEntry({ ...newEntry, contribMkEur: e.target.value })}
                                            placeholder="0.00"
                                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">MK Contribution (USD)</label>
                                        <input
                                            type="number"
                                            value={newEntry.contribMk}
                                            onChange={e => setNewEntry({ ...newEntry, contribMk: e.target.value })}
                                            placeholder="0.00"
                                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">KJ Contribution (EUR)</label>
                                        <input
                                            type="number"
                                            value={newEntry.contribKjEur}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const eur = parseFloat(val);
                                                const fx = parseFloat(newEntry.fxRate);
                                                const usdVal = !isNaN(eur) && !isNaN(fx) ? (eur * fx).toFixed(2) : '';
                                                setNewEntry({ ...newEntry, contribKjEur: val, contribKj: usdVal });
                                            }}
                                            placeholder="0.00"
                                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">KJ USD (Auto)</label>
                                        <input
                                            type="number"
                                            value={newEntry.contribKj}
                                            readOnly
                                            className="w-full bg-slate-900/50 text-slate-400 border border-slate-800 rounded p-2 text-xs cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">EUR/USD Rate</label>
                                        <div className="flex space-x-2">
                                            <input
                                                type="number"
                                                value={newEntry.fxRate}
                                                onChange={e => {
                                                    const newFx = e.target.value;
                                                    const fxVal = parseFloat(newFx);
                                                    const kjEur = parseFloat(newEntry.contribKjEur);

                                                    setNewEntry(prev => ({
                                                        ...prev,
                                                        fxRate: newFx,
                                                        // Only update KJ (Auto derived), leave MK alone as it is additive manual inputs now
                                                        contribKj: !isNaN(kjEur) && !isNaN(fxVal) ? (kjEur * fxVal).toFixed(2) : prev.contribKj
                                                    }));
                                                }}
                                                placeholder="1.1689"
                                                className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs focus:ring-emerald-500/50 focus:border-emerald-500"
                                            />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=1d'));
                                                        const data = await res.json();
                                                        const json = JSON.parse(data.contents);
                                                        const rate = json.chart.result[0].meta.regularMarketPrice;
                                                        if (rate) {
                                                            const newFx = rate.toFixed(4);
                                                            const fxVal = parseFloat(newFx);
                                                            // Only recalculate KJ USD
                                                            const kjEur = parseFloat(newEntry.contribKjEur);

                                                            setNewEntry(prev => ({
                                                                ...prev,
                                                                fxRate: newFx,
                                                                contribKj: !isNaN(kjEur) ? (kjEur * fxVal).toFixed(2) : prev.contribKj
                                                            }));
                                                        } else {
                                                            alert('Could not fetch rate automatically.');
                                                        }
                                                    } catch (err) {
                                                        console.error(err);
                                                        alert('Error fetching rate.');
                                                    }
                                                }}
                                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-bold"
                                            >
                                                GET
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleAddEntry}
                                        className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg text-sm transition-colors shadow-lg shadow-emerald-500/20"
                                    >
                                        Add Entry
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
                {
                    subTab === 'scenarios' && (
                        <div className="space-y-8">
                            <div className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded-r-xl">
                                <h4 className="text-emerald-400 font-bold text-sm flex items-center space-x-2">
                                    <span>ⓘ</span> <span>Inflation-adjusted projections</span>
                                </h4>
                                <p className="text-xs text-slate-400 mt-1">
                                    All values account for {settings.inflationRate}% annual inflation. Bear case ({settings.returnRateBear}% return) is conservative. Base case ({settings.returnRateBase}%) is historical average. Bull case ({settings.returnRateBull}%) is optimistic.
                                </p>
                            </div>

                            {/* Top Cards for 2036 Base */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-center">
                                    <div className="text-[10px] uppercase text-rose-400 font-bold mb-1">BEAR {targetYear1}</div>
                                    <div className="text-xl font-bold text-rose-400">€{proj2036.bear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                </div>
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-center shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                                    <div className="text-[10px] uppercase text-emerald-400 font-bold mb-1">BASE {targetYear1}</div>
                                    <div className="text-xl font-bold text-emerald-400">€{proj2036.base.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                </div>
                                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-center">
                                    <div className="text-[10px] uppercase text-blue-400 font-bold mb-1">BULL {targetYear1}</div>
                                    <div className="text-xl font-bold text-blue-400">€{proj2036.bull.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                </div>
                            </div>

                            {/* 2036 Detail Table */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide border-b border-slate-700 pb-2">
                                    {targetYear1} target (Your retirement - MK)
                                </h3>
                                <div className="overflow-hidden rounded-xl border border-slate-800">
                                    <table className="w-full text-left border-collapse bg-slate-900/40">
                                        <thead className="bg-slate-950/80 text-[10px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                                            <tr>
                                                <th className="p-3">Scenario</th>
                                                <th className="p-3 text-right">Capital in {targetYear1}</th>
                                                <th className="p-3 text-right">Inf-Adj (PV)</th>
                                                <th className="p-3 text-right">Distance to target</th>
                                                <th className="p-3 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {renderScenarioRow(`Bear (${settings.returnRateBear}%)`, proj2036.bear, settings.milestones[1].target, 'bg-rose-500')}
                                            {renderScenarioRow(`Base (${settings.returnRateBase}%)`, proj2036.base, settings.milestones[1].target, 'bg-emerald-500')}
                                            {renderScenarioRow(`Bull (${settings.returnRateBull}%)`, proj2036.bull, settings.milestones[1].target, 'bg-blue-500')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 2048 Detail Table */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide border-b border-slate-700 pb-2">
                                    {targetYear2} target (Spouse retirement - KJ)
                                </h3>
                                <div className="overflow-hidden rounded-xl border border-slate-800">
                                    <table className="w-full text-left border-collapse bg-slate-900/40">
                                        <thead className="bg-slate-950/80 text-[10px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                                            <tr>
                                                <th className="p-3">Scenario</th>
                                                <th className="p-3 text-right">Capital in {targetYear2}</th>
                                                <th className="p-3 text-right">Inf-Adj (PV)</th>
                                                <th className="p-3 text-right">Distance to target</th>
                                                <th className="p-3 text-right">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {renderScenarioRow(`Bear (${settings.returnRateBear}%)`, proj2048.bear, settings.milestones[2].target, 'bg-rose-500')}
                                            {renderScenarioRow(`Base (${settings.returnRateBase}%)`, proj2048.base, settings.milestones[2].target, 'bg-emerald-500')}
                                            {renderScenarioRow(`Bull (${settings.returnRateBull}%)`, proj2048.bull, settings.milestones[2].target, 'bg-blue-500')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )
                }
                {
                    subTab === 'analytics' && (
                        <div className="space-y-8">
                            {/* Capital Growth Chart */}
                            <div className="space-y-2">
                                <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                    <span>📈</span> <span>Capital growth</span>
                                </h3>
                                <div className="h-[300px] w-full bg-slate-900/40 rounded-xl border border-slate-800/50 p-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={[
                                            ...entries.slice().reverse().map(e => ({
                                                name: e.date,
                                                Capital: e.capitalEuro,
                                                type: 'Historical'
                                            })),
                                            // Add one projection point for 2048 (Base Case)
                                            {
                                                name: '2048',
                                                Capital: proj2048.base,
                                                type: 'Projected'
                                            }
                                        ]}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                                            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(value) => `€${value / 1000}k`} />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px' }}
                                                itemStyle={{ color: '#10b981' }}
                                                formatter={(value: any) => [`€${value ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}`, 'Capital']}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                            <Line type="monotone" dataKey="Capital" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Time Horizon */}
                            <div className="space-y-2">
                                <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                    <span>🕒</span> <span>Time horizon</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">YEARS TO {targetYear1} GOAL</div>
                                        <div className="text-2xl font-bold text-emerald-400">{yearsToT1}</div>
                                        <div className="text-xs text-slate-500">At current contribution rate</div>
                                    </div>
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">YEARS REMAINING (BUFFER)</div>
                                        <div className="text-2xl font-bold text-emerald-400">0</div>
                                        <div className="text-xs text-slate-500">Safety margin before deadline</div>
                                    </div>
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">YOUR AGE IN {targetYear1}</div>
                                        <div className="text-2xl font-bold text-emerald-400">{settings.milestones[1].age}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Withdrawal Strategy */}
                            <div className="space-y-2">
                                <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                    <span>💶</span> <span>Withdrawal strategy</span>
                                </h3>
                                <div className="overflow-hidden rounded-xl border border-slate-800">
                                    <table className="w-full text-left border-collapse bg-slate-900/40">
                                        <thead className="bg-slate-950/80 text-[10px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                                            <tr>
                                                <th className="p-3">Withdrawal Rate</th>
                                                <th className="p-3 text-right">Monthly</th>
                                                <th className="p-3 text-right">Annual</th>
                                                <th className="p-3 text-right">Runway (cash)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-mono text-slate-300">
                                            {[0.025, 0.03, 0.035, 0.04].map(rate => (
                                                <tr key={rate} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                                    <td className="p-3 font-sans text-slate-400">{(rate * 100).toFixed(1)}% {rate === 0.03 ? '(recommended)' : rate === 0.035 ? '(base case)' : ''}</td>
                                                    <td className="p-3 text-right text-emerald-400 font-bold">€{((currentCapitalEuro * rate) / 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="p-3 text-right">€{(currentCapitalEuro * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="p-3 text-right">{(1 / rate).toFixed(0)} years</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Taxes */}
                            <div className="space-y-2">
                                <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                    <span>🏛</span> <span>Taxes and regulations</span>
                                </h3>
                                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-xs text-amber-500">
                                    <strong>Important:</strong> Early withdrawals from pension pillars and investment accounts may be subject to income tax and capital gains tax, depending on jurisdiction and residency status.
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">CAPITAL GAIN (ASSUMED)</div>
                                        <div className="text-lg font-bold text-emerald-400">€{(currentCapitalEuro * 0.3).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    </div>
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">ESTIMATED TAX</div>
                                        <div className="text-lg font-bold text-emerald-400">€{(currentCapitalEuro * 0.3 * 0.15).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    </div>
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">NET GAIN</div>
                                        <div className="text-lg font-bold text-emerald-400">€{(currentCapitalEuro * 0.3 * 0.85).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    </div>
                                    <div className="glass-panel p-4 text-center">
                                        <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">EFFECTIVE TAX RATE</div>
                                        <div className="text-lg font-bold text-emerald-400">15.0%</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }
                {
                    subTab === 'history' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="flex items-center space-x-2 text-md font-bold text-emerald-400">
                                    <span>📜</span> <span>Full history & contributor stats</span>
                                </h3>
                                <button
                                    onClick={() => setSubTab('update')}
                                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-500/20 transition-colors"
                                >
                                    + Add historical entry
                                </button>
                            </div>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="glass-panel p-4 text-center">
                                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">MK TOTAL CONTRIB</div>
                                    <div className="text-lg font-bold text-emerald-400">${entries.reduce((sum, e) => sum + e.contributionMkUsd, 0).toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-500">{entries.length} payments</div>
                                </div>
                                <div className="glass-panel p-4 text-center">
                                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">KJ TOTAL CONTRIB</div>
                                    <div className="text-lg font-bold text-emerald-400">${entries.reduce((sum, e) => sum + e.contributionKjUsd, 0).toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-500">{entries.length} payments</div>
                                </div>
                                <div className="glass-panel p-4 text-center">
                                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">COMBINED TOTAL</div>
                                    <div className="text-lg font-bold text-emerald-400">${entries.reduce((sum, e) => sum + e.contributionMkUsd + e.contributionKjUsd, 0).toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-500">{entries.length} payments</div>
                                </div>
                                <div className="glass-panel p-4 text-center border-emerald-500/10 bg-emerald-500/5">
                                    <div className="text-[9px] uppercase text-slate-500 font-bold mb-1">NEXT GOAL ({subsequentMilestone.name})</div>
                                    <div className="text-lg font-bold text-emerald-400">€{subsequentMilestone.target.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                                    <div className="text-[9px] text-slate-500">Target: {subsequentMilestone.year}</div>
                                </div>
                            </div>

                            {/* History Table */}
                            <div className="overflow-hidden rounded-xl border border-slate-800">
                                <table className="w-full text-left border-collapse bg-slate-900/40">
                                    <thead className="bg-slate-950/80 text-[10px] font-semibold text-slate-500 uppercase tracking-wider backdrop-blur-sm">
                                        <tr>
                                            <th className="p-3">Date</th>
                                            <th className="p-3 text-right">Capital (EUR)</th>
                                            <th className="p-3 text-right">Capital (USD)</th>
                                            <th className="p-3 text-right">MK</th>
                                            <th className="p-3 text-right">KJ</th>
                                            <th className="p-3 text-right">FX</th>
                                            <th className="p-3 text-right">Growth</th>
                                            <th className="p-3 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs font-mono text-slate-300">
                                        {entries.map((entry, idx) => {
                                            const prevEntry = entries[idx + 1];
                                            const growth = prevEntry
                                                ? entry.capitalEuro - prevEntry.capitalEuro
                                                : 0;

                                            return (
                                                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                                    <td className="p-3 font-sans text-slate-400">{entry.date}</td>
                                                    <td className="p-3 text-right font-bold text-emerald-400">€{entry.capitalEuro.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="p-3 text-right text-slate-400">${entry.capitalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className="p-3 text-right text-blue-400">${entry.contributionMkUsd.toLocaleString()}</td>
                                                    <td className="p-3 text-right text-amber-400">${entry.contributionKjUsd.toLocaleString()}</td>
                                                    <td className="p-3 text-right text-slate-500">{entry.fxRate.toFixed(4)}</td>
                                                    <td className="p-3 text-right text-emerald-400">+{growth > 0 ? '€' + growth.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '€0'}</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => setEditingEntry({ index: idx, data: { ...entry } })}
                                                            className="text-slate-500 hover:text-emerald-400 transition-colors"
                                                            title="Edit"
                                                        >
                                                            ✎
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {entries.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="p-8 text-center text-slate-500 italic">No entries yet. Add one!</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                {subTab === 'settings' && (
                    <div className="max-w-xl mx-auto space-y-6">
                        <div className="mb-4">
                            <h3 className="text-lg font-bold text-emerald-400 mb-1">⚙ Settings</h3>
                            <p className="text-xs text-slate-500">Customize assumptions for projections and calculations.</p>
                        </div>

                        <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800/50 space-y-6">
                            <div>
                                <label className="block text-[10px] uppercase text-slate-500 font-bold mb-2">Inflation Rate (Annual %)</label>
                                <input
                                    type="number" step="0.1"
                                    value={settings.inflationRate}
                                    onChange={e => setSettings({ ...settings, inflationRate: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-sm font-bold focus:ring-emerald-500/50 focus:border-emerald-500"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Subtracted from nominal returns to get real returns.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] uppercase text-rose-400 font-bold mb-2">Bear Rate (%)</label>
                                    <input
                                        type="number" step="0.1"
                                        value={settings.returnRateBear}
                                        onChange={e => setSettings({ ...settings, returnRateBear: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-800 text-rose-400 border border-slate-700 rounded p-2 text-sm font-bold focus:ring-rose-500/50 focus:border-rose-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-emerald-400 font-bold mb-2">Base Rate (%)</label>
                                    <input
                                        type="number" step="0.1"
                                        value={settings.returnRateBase}
                                        onChange={e => setSettings({ ...settings, returnRateBase: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-800 text-emerald-400 border border-slate-700 rounded p-2 text-sm font-bold focus:ring-emerald-500/50 focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-blue-400 font-bold mb-2">Bull Rate (%)</label>
                                    <input
                                        type="number" step="0.1"
                                        value={settings.returnRateBull}
                                        onChange={e => setSettings({ ...settings, returnRateBull: parseFloat(e.target.value) || 0 })}
                                        className="w-full bg-slate-800 text-blue-400 border border-slate-700 rounded p-2 text-sm font-bold focus:ring-blue-500/50 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-800/50">
                                <h4 className="text-sm font-bold text-slate-300 mb-4">Goals & Milestones</h4>
                                <div className="space-y-4">
                                    {settings.milestones.map((m, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-4">
                                                <label className="block text-[9px] uppercase text-slate-500 font-bold mb-1">Name</label>
                                                <input
                                                    type="text"
                                                    value={m.name}
                                                    onChange={(e) => {
                                                        const newM = [...settings.milestones];
                                                        newM[idx].name = e.target.value;
                                                        setSettings({ ...settings, milestones: newM });
                                                    }}
                                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="block text-[9px] uppercase text-slate-500 font-bold mb-1">Target (€)</label>
                                                <input
                                                    type="number"
                                                    value={m.target}
                                                    onChange={(e) => {
                                                        const newM = [...settings.milestones];
                                                        newM[idx].target = parseFloat(e.target.value) || 0;
                                                        setSettings({ ...settings, milestones: newM });
                                                    }}
                                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[9px] uppercase text-slate-500 font-bold mb-1">Year</label>
                                                <input
                                                    type="number"
                                                    value={m.year}
                                                    onChange={(e) => {
                                                        const newM = [...settings.milestones];
                                                        newM[idx].year = parseInt(e.target.value) || 0;
                                                        setSettings({ ...settings, milestones: newM });
                                                    }}
                                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[9px] uppercase text-slate-500 font-bold mb-1">Age</label>
                                                <input
                                                    type="number"
                                                    value={m.age}
                                                    onChange={(e) => {
                                                        const newM = [...settings.milestones];
                                                        newM[idx].age = parseInt(e.target.value) || 0;
                                                        setSettings({ ...settings, milestones: newM });
                                                    }}
                                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center pb-2">
                                                <button
                                                    onClick={() => handleDeleteMilestone(idx)}
                                                    className="text-slate-600 hover:text-rose-500 transition-colors"
                                                    title="Delete Milestone"
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="pt-2">
                                        <button
                                            onClick={handleAddMilestone}
                                            className="w-full py-2 border border-dashed border-slate-700 text-slate-500 hover:border-emerald-500/50 hover:text-emerald-400 rounded-lg text-xs font-bold transition-all"
                                        >
                                            + Add New Milestone
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* Edit Modal */}
            {editingEntry && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
                        <h3 className="text-lg font-bold text-emerald-400 mb-4">Edit Entry</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingEntry.data.date}
                                    onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, date: e.target.value } })}
                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Portfolio (USD)</label>
                                <input
                                    type="number"
                                    value={editingEntry.data.capitalUsd}
                                    onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, capitalUsd: parseFloat(e.target.value) || 0 } })}
                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">MK (USD)</label>
                                    <input
                                        type="number"
                                        value={editingEntry.data.contributionMkUsd}
                                        onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, contributionMkUsd: parseFloat(e.target.value) || 0 } })}
                                        className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">KJ (USD)</label>
                                    <input
                                        type="number"
                                        value={editingEntry.data.contributionKjUsd}
                                        onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, contributionKjUsd: parseFloat(e.target.value) || 0 } })}
                                        className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">FX Rate</label>
                                <input
                                    type="number"
                                    value={editingEntry.data.fxRate}
                                    onChange={e => setEditingEntry({ ...editingEntry, data: { ...editingEntry.data, fxRate: parseFloat(e.target.value) || 1 } })}
                                    className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded p-2 text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
                            <button
                                onClick={() => handleDeleteEntry(editingEntry.index)}
                                className="text-rose-400 hover:text-rose-300 text-xs font-bold px-3 py-2 rounded hover:bg-rose-500/10 transition-colors"
                            >
                                🗑 Delete Entry
                            </button>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setEditingEntry(null)}
                                    className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg text-xs"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FireTracker;
