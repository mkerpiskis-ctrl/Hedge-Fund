import React, { useState } from 'react';

const RebalancingCalculator: React.FC = () => {
    // Load initial state from localStorage if available
    const [breakoutValue, setBreakoutValue] = useState<number | ''>(() => {
        const saved = localStorage.getItem('rebalance_breakout');
        return saved ? parseFloat(saved) : '';
    });
    const [allWeatherValue, setAllWeatherValue] = useState<number | ''>(() => {
        const saved = localStorage.getItem('rebalance_all_weather');
        return saved ? parseFloat(saved) : '';
    });

    // Save to localStorage whenever values change
    React.useEffect(() => {
        localStorage.setItem('rebalance_breakout', breakoutValue.toString());
    }, [breakoutValue]);

    React.useEffect(() => {
        localStorage.setItem('rebalance_all_weather', allWeatherValue.toString());
    }, [allWeatherValue]);

    const calculateRebalance = () => {
        const bVal = Number(breakoutValue) || 0;
        const awVal = Number(allWeatherValue) || 0;

        if (bVal === 0 && awVal === 0) return null;

        const totalValue = bVal + awVal;
        const targetValue = totalValue / 2;
        const difference = targetValue - bVal;

        const percentageB = (bVal / totalValue) * 100;
        const deviation = Math.abs(percentageB - 50);

        const actionNeeded = deviation > 5;
        const warningNeeded = deviation > 10;

        return {
            totalValue,
            targetValue,
            difference,
            percentageB,
            deviation,
            actionNeeded,
            warningNeeded
        };
    };

    const result = calculateRebalance();

    return (
        <div className="font-sans text-sm">
            <div className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Breakout Strategy ($)</label>
                        <input
                            type="number"
                            value={breakoutValue}
                            onChange={(e) => setBreakoutValue(parseFloat(e.target.value) || '')}
                            className="glass-input w-full text-lg font-medium"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">All Weather Strategy ($)</label>
                        <input
                            type="number"
                            value={allWeatherValue}
                            onChange={(e) => setAllWeatherValue(parseFloat(e.target.value) || '')}
                            className="glass-input w-full text-lg font-medium"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {result && (
                    <div className="bg-slate-900/50 rounded-xl p-5 border border-slate-800/50 animate-fade-in">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                            <span className="text-xs font-bold text-slate-500 uppercase">Analysis Results</span>
                            <span className="text-xs text-slate-500 font-mono">LIVE_CALC</span>
                        </div>

                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Total Portfolio</span>
                                <span className="text-slate-100 font-bold">${result.totalValue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Target (50/50)</span>
                                <span className="text-slate-100 font-medium">${result.targetValue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-slate-800/50">
                                <span className="text-slate-400">Breakout Alloc</span>
                                <span className={`${result.warningNeeded ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                                    {result.percentageB.toFixed(1)}% <span className="text-slate-600 font-normal">/ 50%</span>
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Deviation</span>
                                <span className="text-slate-200">{result.deviation.toFixed(1)}%</span>
                            </div>
                        </div>

                        {result.warningNeeded && (
                            <div className="mb-4 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-center text-xs font-bold uppercase tracking-wide">
                                ⚠️ Significant Drift Detected ({'>'}10%)
                            </div>
                        )}

                        {result.actionNeeded ? (
                            <div className="bg-slate-800/40 rounded-lg p-4 text-center border border-slate-700">
                                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Recommendation</div>
                                {result.difference > 0 ? (
                                    <div>
                                        <div className="text-emerald-400 font-bold text-lg mb-1">
                                            BUY ${result.difference.toLocaleString()} <span className="text-sm text-slate-500">Breakout</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            (Sell matching amount from All Weather)
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-amber-500 font-bold text-lg mb-1">
                                            SELL ${Math.abs(result.difference).toLocaleString()} <span className="text-sm text-slate-500">Breakout</span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            (Buy matching amount for All Weather)
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-center">
                                <span className="text-emerald-500 font-bold text-xs uppercase tracking-wide">Portfolio Balanced</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RebalancingCalculator;
