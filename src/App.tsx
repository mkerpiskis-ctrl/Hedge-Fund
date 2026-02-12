import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import EmpireDashboard from './components/EmpireDashboard';
import AllWeatherCalculator from './components/AllWeatherCalculator';
import FireTracker from './components/FireTracker';
import IBKRTracker from './components/IBKRTracker';
import TradingJournalV2 from './components/TradingJournalV2';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calculators' | 'fireTracker' | 'ibkrTracker' | 'tradingJournal'>('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 font-mono text-sm">Initializing Secure Environment...</div>;
  }

  if (!session) {
    return <Auth />;
  }

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
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-slate-500 hover:text-rose-500 transition-colors uppercase font-bold"
          >
            Sign Out
          </button>
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
            EMPIRE DASHBOARD
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
            FIRE DEEP DIVE
            {activeTab === 'fireTracker' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('ibkrTracker')}
            className={`pb-3 px-2 text-sm font-semibold tracking-wide transition-all relative ${activeTab === 'ibkrTracker'
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            IBKR TRADES
            {activeTab === 'ibkrTracker' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tradingJournal')}
            className={`pb-3 px-2 text-sm font-semibold tracking-wide transition-all relative ${activeTab === 'tradingJournal'
              ? 'text-amber-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            TRADE JOURNAL
            {activeTab === 'tradingJournal' && (
              <div className="absolute bottom-[-5px] left-0 w-full h-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
            )}
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto space-y-8 animate-fade-in">

        {/* DASHBOARD TAB (EMPIRE) */}
        {activeTab === 'dashboard' && (
          <EmpireDashboard />
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

        {/* IBKR TRADE TRACKER TAB */}
        {activeTab === 'ibkrTracker' && (
          <div className="animate-fade-in">
            <div className="premium-card p-6 h-full bg-slate-900/80 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <span className="text-blue-500 text-lg">📈</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-200">IBKR Trade Tracker</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">NDX + RUI</span>
                </div>
                <span className="text-xs text-slate-500 font-mono">REALTEST</span>
              </div>
              <IBKRTracker />
            </div>
          </div>
        )}

        {/* TRADING JOURNAL TAB */}
        {activeTab === 'tradingJournal' && (
          <div className="animate-fade-in">
            <div className="premium-card p-6 h-full bg-slate-900/80 backdrop-blur-sm">
              <TradingJournalV2 />
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
