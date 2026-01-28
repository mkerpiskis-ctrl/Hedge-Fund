
import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { error } = await supabase.auth.signInWithOtp({
            email,
        });

        if (error) {
            setMessage(error.message);
            alert(error.message);
        } else {
            setMessage('Check your email for the login link!');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 font-sans text-slate-100">
            <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl animate-fade-in">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                        Hedge Fund
                    </h1>
                    <p className="text-sm text-slate-400 font-medium">Secure Access Portal</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-xs uppercase font-bold text-slate-500 mb-2">Email Address</label>
                        <input
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-600"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <button
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-3 rounded-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                            disabled={loading}
                        >
                            {loading ? 'Sending Magic Link...' : 'Send Magic Link'}
                        </button>
                    </div>
                </form>

                {message && (
                    <div className={`mt-6 p-4 rounded-lg text-sm font-bold text-center border ${message.includes('Check') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
}
