import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

// Types
interface BusinessMetric {
    month: string;
    c2Subs: number;
    etoroCopiers: number;
    auc: number;
    netIncome: number;
}

interface FireEntry {
    date: string;
    capitalUsd: number;
    capitalEuro: number;
    contributionMkUsd: number;
    contributionKjUsd: number;
    fxRate: number;
}

export default function EmpireDashboard() {
    // --- STATE ---
    const [businessData, setBusinessData] = useState<BusinessMetric[]>([]);
    const [fireData, setFireData] = useState<FireEntry[]>([]);
    const [isLogModalOpen, setLogModalOpen] = useState(false);
    const [isEditBizModalOpen, setEditBizModalOpen] = useState(false);

    // Form State
    const [logForm, setLogForm] = useState({
        month: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        // Business
        c2Subs: '',
        etoroCopiers: '',
        auc: '',
        netIncome: '',
        // Personal (Vault)
        portfolioUsd: '',
        fxRate: '1.05',
        mkEur: '500',
        mkUsd: '700',
        wifeEur: '250'
    });

    // --- INIT / MOCK DATA ---
    useEffect(() => {
        // Business Data
        const savedBiz = localStorage.getItem('empire_business_data');
        if (savedBiz) {
            setBusinessData(JSON.parse(savedBiz));
        } else {
            // Mock Data Jan 2026
            setBusinessData([
                { month: '2026-01-01', c2Subs: 8, etoroCopiers: 12, auc: 45000, netIncome: 1250 },
                { month: '2026-02-01', c2Subs: 8, etoroCopiers: 12, auc: 45000, netIncome: 1250 } // Duplicate for line visibility
            ]);
        }

        // Fire Data (Read from existing FireTracker if available)
        const savedFire = localStorage.getItem('fire_tracker_entries');
        if (savedFire) {
            setFireData(JSON.parse(savedFire));
        }
    }, []);

    // --- HANDLERS ---
    const handleLogSubmit = () => {
        // 1. Process Business Data
        const newBiz: BusinessMetric = {
            month: logForm.month,
            c2Subs: parseInt(logForm.c2Subs) || 0,
            etoroCopiers: parseInt(logForm.etoroCopiers) || 0,
            auc: parseFloat(logForm.auc) || 0,
            netIncome: parseFloat(logForm.netIncome) || 0
        };
        const updatedBiz = [...businessData, newBiz].sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
        setBusinessData(updatedBiz);
        localStorage.setItem('empire_business_data', JSON.stringify(updatedBiz));

        // 2. Process Personal Data (FireVault)
        const pUsd = parseFloat(logForm.portfolioUsd) || 0;
        const fx = parseFloat(logForm.fxRate) || 1.05;
        const mkEur = parseFloat(logForm.mkEur) || 0;
        const mkUsd = parseFloat(logForm.mkUsd) || 0;
        const wifeEur = parseFloat(logForm.wifeEur) || 0;

        // Total MK Contribution (USD) = MK_USD + (MK_EUR * FX)
        // Note: Wife is usually EUR only, converted to USD for record? 
        // Logic from spec: Total Monthly Added ($) = (Op_EUR + Wife_EUR) * Rate + Op_USD. 
        // However, FireTracker stores specifically "MK Contrib USD" and "KJ Contrib USD".
        // We will stick to FireTracker data structure for compatibility.

        const mkTotalUsd = mkUsd + (mkEur * fx);
        const kjTotalUsd = wifeEur * fx;

        const newFire: FireEntry = {
            date: logForm.month,
            capitalUsd: pUsd,
            capitalEuro: pUsd / fx,
            contributionMkUsd: mkTotalUsd,
            contributionKjUsd: kjTotalUsd, // Assuming KJ is Wife
            fxRate: fx
        };

        // Append to existing FIRE data
        const updatedFire = [newFire, ...fireData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setFireData(updatedFire);
        localStorage.setItem('fire_tracker_entries', JSON.stringify(updatedFire));

        setLogModalOpen(false);
        alert('Month Logged Successfully!');
    };

    const handleDeleteBizEntry = (index: number) => {
        if (window.confirm('Delete this entry?')) {
            const updated = [...businessData];
            updated.splice(index, 1);
            setBusinessData(updated);
            localStorage.setItem('empire_business_data', JSON.stringify(updated));
        }
    };

    const handleUpdateBizEntry = (index: number, field: keyof BusinessMetric, value: string) => {
        const updated = [...businessData];
        // Handle number parsing
        if (field === 'month') {
            // @ts-ignore
            updated[index][field] = value;
        } else {
            // @ts-ignore
            updated[index][field] = parseFloat(value) || 0;
        }
        setBusinessData(updated);
        localStorage.setItem('empire_business_data', JSON.stringify(updated));
    };

    // --- CALCULATIONS FOR UI ---

    // Most recent Business
    const latestBiz = businessData[businessData.length - 1] || { c2Subs: 0, etoroCopiers: 0, auc: 0, netIncome: 0 };

    // Most recent FIRE
    const latestFire = fireData[0] || { capitalUsd: 0, date: new Date().toISOString() };

    // Progress Bars
    const targetCapital = 1000000; // $1M Target
    const capitalProgress = Math.min((latestFire.capitalUsd / targetCapital) * 100, 100);

    const startDate = new Date('2026-01-01').getTime();
    const endDate = new Date('2035-01-01').getTime();
    const now = new Date().getTime();
    const totalTime = endDate - startDate;
    const timeElapsed = now - startDate;
    const timeProgress = Math.max(0, Math.min((timeElapsed / totalTime) * 100, 100));

    // Runway
    const yearsRemaining = ((endDate - now) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in font-sans">

            {/* LEFT: BUSINESS (HEDGE FUND) */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-100 uppercase tracking-widest flex items-center">
                        <span className="w-3 h-3 bg-amber-500 rounded-sm mr-3 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></span>
                        Hedge Fund Ops
                    </h2>
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setEditBizModalOpen(true)}
                            className="bg-slate-800 text-slate-400 hover:text-white px-3 py-2 rounded text-xs font-bold uppercase transition-all"
                        >
                            History
                        </button>
                        <button
                            onClick={() => setLogModalOpen(true)}
                            className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500 hover:text-slate-900 px-4 py-2 rounded text-xs font-bold uppercase transition-all tracking-wider"
                        >
                            + Log Month
                        </button>
                    </div>
                </div>

                {/* KPI CARDS */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-6 border-l-2 border-l-amber-500/50">
                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">C2 Subscribers</div>
                        <div className="text-3xl font-black text-slate-100">{latestBiz.c2Subs} <span className="text-sm text-slate-600 font-medium">/ 40</span></div>
                    </div>
                    <div className="glass-panel p-6 border-l-2 border-l-cyan-500/50">
                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">eToro AUC</div>
                        <div className="text-3xl font-black text-slate-100">${(latestBiz.auc / 1000).toFixed(1)}k</div>
                        <div className="text-[10px] text-slate-500 mt-1">{latestBiz.etoroCopiers} Copiers</div>
                    </div>
                </div>

                {/* NET INCOME CHART */}
                <div className="glass-panel p-6">
                    <div className="flex justify-between items-end mb-4">
                        <h3 className="text-xs font-bold text-slate-400 uppercase">Net Income Trend</h3>
                        <div className="text-2xl font-bold text-emerald-400">${latestBiz.netIncome.toLocaleString()}</div>
                    </div>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={businessData}>
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="month" stroke="#475569" fontSize={10} tickFormatter={(val) => val.slice(0, 7)} />
                                <YAxis stroke="#475569" fontSize={10} tickFormatter={(val) => `$${val}`} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Area type="monotone" dataKey="netIncome" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* RIGHT: PERSONAL (THE VAULT) */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black text-slate-100 uppercase tracking-widest flex items-center">
                        <span className="w-3 h-3 bg-cyan-500 rounded-sm mr-3 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></span>
                        The Vault (2035)
                    </h2>
                    <div className="text-xs font-mono text-slate-500">TARGET: $1,000,000</div>
                </div>

                <div className="glass-panel p-8 space-y-8 relative overflow-hidden">
                    {/* Background Tech Line */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full pointer-events-none"></div>

                    {/* METRIC: TOTAL CAPITAL */}
                    <div className="text-center">
                        <div className="text-xs uppercase text-slate-500 font-bold mb-2 tracking-widest">Current Net Worth</div>
                        <div className="text-5xl font-black text-slate-100 tracking-tighter drop-shadow-lg">
                            ${latestFire.capitalUsd.toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-400 mt-2 font-mono">
                            €{(latestFire.capitalEuro || 0).toLocaleString()} <span className="text-slate-600">(@ {latestFire.fxRate})</span>
                        </div>
                    </div>

                    {/* PROGRESS BARS */}
                    <div className="space-y-6 pt-4">

                        {/* 1. CAPITAL BAR (Software Install Style) */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                                <span>Installation Progress (Wealth)</span>
                                <span>{capitalProgress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-4 bg-slate-900 rounded-full border border-slate-700 p-[2px] relative shadow-inner">
                                {/* Striped/Animated Bar */}
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full relative overflow-hidden transition-all duration-1000 ease-out"
                                    style={{ width: `${capitalProgress}%` }}
                                >
                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9InN0cmlwZXMiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBMODAgMEgwTDQwIDQwWiIgZmlsbD0id2hpdGUiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI3N0cmlwZXMpIi8+PC9zdmc+')] animate-[slide_1s_linear_infinite]"></div>
                                </div>
                            </div>
                        </div>

                        {/* 2. FREEDOM BAR (Time) */}
                        <div>
                            <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                                <span>Time Elapsed (2026 - 2035)</span>
                                <span>{yearsRemaining} Years Left</span>
                            </div>
                            <div className="w-full h-2 bg-slate-900 rounded-full">
                                <div
                                    className="h-full bg-slate-700 rounded-full transition-all duration-1000 ease-out"
                                    style={{ width: `${timeProgress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-600 mt-1 font-mono">
                                <span>Jan 2026</span>
                                <span>Jan 2035</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* LAST ENTRY SUMMARY */}
                <div className="glass-panel p-4 flex justify-between items-center opacity-80 hover:opacity-100 transition-opacity">
                    <div className="text-xs text-slate-400">
                        <span className="block font-bold text-slate-300">Last Injection</span>
                        {(latestFire.date || '').slice(0, 10)}
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">+${(latestFire.contributionMkUsd + latestFire.contributionKjUsd).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Added</div>
                    </div>
                </div>
            </div>

            {/* LOG MODAL */}
            {isLogModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-100">Log Monthly Data</h3>
                            <button onClick={() => setLogModalOpen(false)} className="text-slate-500 hover:text-slate-100">✕</button>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* COL 1: BUSINESS */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-amber-500 uppercase tracking-widest border-b border-amber-900/30 pb-2">Business Metrics</h4>

                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Month Date</label>
                                    <input
                                        type="date"
                                        value={logForm.month}
                                        onChange={e => setLogForm({ ...logForm, month: e.target.value })}
                                        className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">C2 Subs</label>
                                        <input
                                            type="number"
                                            value={logForm.c2Subs}
                                            onChange={e => setLogForm({ ...logForm, c2Subs: e.target.value })}
                                            className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">eToro Copiers</label>
                                        <input
                                            type="number"
                                            value={logForm.etoroCopiers}
                                            onChange={e => setLogForm({ ...logForm, etoroCopiers: e.target.value })}
                                            className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">eToro AUC ($)</label>
                                    <input
                                        type="number"
                                        value={logForm.auc}
                                        onChange={e => setLogForm({ ...logForm, auc: e.target.value })}
                                        className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                        placeholder="50000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Net Income ($)</label>
                                    <input
                                        type="number"
                                        value={logForm.netIncome}
                                        onChange={e => setLogForm({ ...logForm, netIncome: e.target.value })}
                                        className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                        placeholder="1200"
                                    />
                                </div>
                            </div>

                            {/* COL 2: PERSONAL */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-cyan-900/30 pb-2">The Vault</h4>

                                <div>
                                    <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">Portfolio Value ($)</label>
                                    <input
                                        type="number"
                                        value={logForm.portfolioUsd}
                                        onChange={e => setLogForm({ ...logForm, portfolioUsd: e.target.value })}
                                        className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                        placeholder="Total Net Worth USD"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase text-slate-500 font-bold mb-1">FX Rate (EUR/USD)</label>
                                        <div className="flex space-x-2">
                                            <input
                                                type="number" step="0.01"
                                                value={logForm.fxRate}
                                                onChange={e => setLogForm({ ...logForm, fxRate: e.target.value })}
                                                className="w-full bg-slate-800 border-slate-700 rounded text-sm p-2 text-slate-200"
                                            />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=1d'));
                                                        const data = await res.json();
                                                        const json = JSON.parse(data.contents);
                                                        const rate = json.chart.result[0].meta.regularMarketPrice;
                                                        if (rate) {
                                                            setLogForm(prev => ({ ...prev, fxRate: rate.toFixed(4) }));
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

                                <div className="p-3 bg-slate-800/50 rounded-lg space-y-3">
                                    <div className="text-[10px] uppercase text-slate-400 font-bold">Contributions</div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[9px] text-slate-500 mb-1">MK (EUR)</label>
                                            <input
                                                type="number"
                                                value={logForm.mkEur}
                                                onChange={e => setLogForm({ ...logForm, mkEur: e.target.value })}
                                                className="w-full bg-slate-900 border-slate-700 rounded text-xs p-2 text-slate-200"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] text-slate-500 mb-1">MK (USD)</label>
                                            <input
                                                type="number"
                                                value={logForm.mkUsd}
                                                onChange={e => setLogForm({ ...logForm, mkUsd: e.target.value })}
                                                className="w-full bg-slate-900 border-slate-700 rounded text-xs p-2 text-slate-200"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-[9px] text-slate-500 mb-1">Wife (EUR)</label>
                                            <input
                                                type="number"
                                                value={logForm.wifeEur}
                                                onChange={e => setLogForm({ ...logForm, wifeEur: e.target.value })}
                                                className="w-full bg-slate-900 border-slate-700 rounded text-xs p-2 text-slate-200"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-800 flex justify-end">
                            <button
                                onClick={handleLogSubmit}
                                className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 px-8 rounded-lg shadow-lg shadow-emerald-500/20 transition-all hover:scale-105"
                            >
                                CONFIRM LOG ENTRY
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT HISTORY MODAL */}
            {isEditBizModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-100">Edit History (Hedge Fund)</h3>
                            <button onClick={() => setEditBizModalOpen(false)} className="text-slate-500 hover:text-slate-100">✕</button>
                        </div>
                        <div className="p-6">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs uppercase text-slate-500 border-b border-slate-800">
                                            <th className="p-3">Month</th>
                                            <th className="p-3">C2 Subs</th>
                                            <th className="p-3">eToro Copiers</th>
                                            <th className="p-3">AUC ($)</th>
                                            <th className="p-3 text-emerald-400">Net Income ($)</th>
                                            <th className="p-3">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm text-slate-300">
                                        {[...businessData].reverse().map((row, rIdx) => {
                                            const idx = businessData.length - 1 - rIdx;
                                            return (
                                                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                                    <td className="p-3">
                                                        <input
                                                            type="date"
                                                            value={row.month}
                                                            onChange={(e) => handleUpdateBizEntry(idx, 'month', e.target.value)}
                                                            className="bg-transparent border border-slate-700 rounded px-2 py-1 w-32 focus:border-amber-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            value={row.c2Subs}
                                                            onChange={(e) => handleUpdateBizEntry(idx, 'c2Subs', e.target.value)}
                                                            className="bg-transparent border border-slate-700 rounded px-2 py-1 w-20 focus:border-amber-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            value={row.etoroCopiers}
                                                            onChange={(e) => handleUpdateBizEntry(idx, 'etoroCopiers', e.target.value)}
                                                            className="bg-transparent border border-slate-700 rounded px-2 py-1 w-20 focus:border-amber-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            value={row.auc}
                                                            onChange={(e) => handleUpdateBizEntry(idx, 'auc', e.target.value)}
                                                            className="bg-transparent border border-slate-700 rounded px-2 py-1 w-24 focus:border-amber-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input
                                                            type="number"
                                                            value={row.netIncome}
                                                            onChange={(e) => handleUpdateBizEntry(idx, 'netIncome', e.target.value)}
                                                            className="bg-transparent border border-slate-700 rounded px-2 py-1 w-24 border-emerald-500/30 text-emerald-400 focus:border-emerald-500 outline-none"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <button
                                                            onClick={() => handleDeleteBizEntry(idx)}
                                                            className="text-rose-500 hover:text-rose-400 p-1"
                                                            title="Delete Entry"
                                                        >
                                                            ✕
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
