import React, { useState } from 'react';

interface Task {
    id: string;
    text: string;
}

const DAILY_TASKS: Task[] = [
    { id: 't1', text: '14:30 - Check Pre-Market Data' },
    { id: 't2', text: '14:35 - Review Oanda Portfolio' },
    { id: 't3', text: '16:00 - Executing Opening Trades' },
    { id: 't4', text: '17:00 - Marketing / Content Creation (Urgent)' },
    { id: 't5', text: '23:00 - Market Close Review' },
];

const OperatorsProtocol: React.FC = () => {
    const [completed, setCompleted] = useState<{ [key: string]: boolean }>({});

    const toggleTask = (id: string) => {
        setCompleted(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const progress = Math.round((Object.values(completed).filter(Boolean).length / DAILY_TASKS.length) * 100);

    return (
        <div className="space-y-6 font-sans">
            {/* Progress Bar */}
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800/50">
                <div className="flex justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    <span>Daily Protocol Compliance</span>
                    <span>{progress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                        className="bg-gradient-to-r from-amber-600 to-amber-400 h-2 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>

            <div className="space-y-3">
                {DAILY_TASKS.map(task => {
                    const isUrgent = task.text.includes('17:00');
                    const isDone = completed[task.id];

                    return (
                        <div
                            key={task.id}
                            onClick={() => toggleTask(task.id)}
                            className={`group cursor-pointer flex items-center justify-between p-3 rounded-lg border transition-all duration-200 
                                ${isDone
                                    ? 'bg-slate-900/30 border-slate-800/50 opacity-60'
                                    : 'bg-slate-900/80 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                                }
                                ${!isDone && isUrgent ? 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10' : ''}
                            `}
                        >
                            <div className="flex items-center space-x-3">
                                <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border
                                    ${isDone
                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                        : isUrgent
                                            ? 'border-rose-400 text-transparent group-hover:border-rose-300'
                                            : 'border-slate-500 text-transparent group-hover:border-amber-400'
                                    }
                                `}>
                                    {isDone && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                </div>
                                <span className={`text-sm font-medium ${isDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                    {task.text}
                                </span>
                            </div>

                            {isUrgent && !isDone && (
                                <span className="text-[10px] font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">
                                    CRITICAL
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default OperatorsProtocol;
