import { useState } from 'react';
import OperatorsProtocol from './components/OperatorsProtocol';

import AllWeatherCalculator from './components/AllWeatherCalculator';
import FireTracker from './components/FireTracker';

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calculators' | 'fireTracker'>('dashboard');

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-center animate-fade-in">
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-black font-bold text-xl">MK</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Hedge Fund<span className="text-amber-500">.</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              INSTITUTIONAL GRADE PROTOCOLS
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right hidden md:block">
            <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Net Income Target</div>
            <div className="text-emerald-400 font-bold text-lg">$5,000<span className="text-slate-600 text-sm">/mo</span></div>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden md:block"></div>
          <div className="flex items-center space-x-2 bg-slate-900/50 px-3 py-1.5 rounded-full border border-slate-800">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-xs text-slate-300 font-medium">System Online</span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto mb-8 flex justify-center md:justify-start border-b border-slate-800/60 pb-1">
        <div className="flex space-x-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-3 px-2 text-sm font-semibold tracking-wide transition-all relative ${activeTab === 'dashboard'
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            DASHBOARD
            {activeTab === 'dashboard' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('calculators')}
            className={`pb-3 px-2 text-sm font-semibold tracking-wide transition-all relative ${activeTab === 'calculators'
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            CALCULATORS
            {activeTab === 'calculators' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('fireTracker')}
            className={`pb-3 px-2 text-sm font-semibold tracking-wide transition-all relative ${activeTab === 'fireTracker'
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            FIRE TRACKER
            {activeTab === 'fireTracker' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto space-y-8 animate-fade-in">

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Operators Protocol */}
            <div className="lg:col-span-2 glass-panel p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-200">Operator's Protocol</h2>
                <span className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded">SYS.PROC.01</span>
              </div>
              <OperatorsProtocol />
            </div>

            {/* Right: KPI Tracker (Placeholder) */}
            <div className="glass-panel p-6 flex flex-col items-center justify-center min-h-[300px] border-dashed border-slate-700 bg-slate-900/30">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                <span className="text-slate-600 text-xl font-bold">#</span>
              </div>
              <h3 className="text-slate-400 font-medium mb-1">KPI Tracker</h3>
              <p className="text-xs text-slate-600 text-center px-4">Database connection established. Waiting for data stream...</p>
            </div>
          </div>
        )}

        {/* CALCULATORS TAB */}
        {activeTab === 'calculators' && (
          <div className="animate-fade-in">
            <div className="premium-card p-6 h-full bg-slate-900/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-lg font-semibold text-slate-200">eToro Rebalancer</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">ALL WEATHER</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">LIVE</span>
              </div>
              <AllWeatherCalculator />
            </div>
          </div>
        )}

        {/* FIRE TRACKER TAB */}
        {activeTab === 'fireTracker' && (
          <div className="animate-fade-in">
            <div className="premium-card p-6 h-full bg-slate-900/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <span className="text-emerald-500 text-lg">◎</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-200">Family FIRE Plan Tracker Pro</h2>
                </div>
                <span className="text-xs text-slate-500 font-mono">2025-2048</span>
              </div>
              <FireTracker />
            </div>
          </div>
        )}

      </main>

      <footer className="mt-20 text-center text-xs text-slate-600 border-t border-slate-800/50 pt-8 pb-8">
        <p className="font-medium tracking-wide">MK OPERATING SYSTEM &copy; {new Date().getFullYear()}</p>
        <p className="mt-1 opacity-50">Authorized Use Only</p>
      </footer>
    </div>
  );
}

export default App;
