import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatCurrency } from '../lib/utils';
import { CandlestickChart } from '../charts/CandlestickChart';
import { ArrowLeft, Target, Shield, Info, ShieldAlert } from 'lucide-react';

export function TickerDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ticker/${encodeURIComponent(symbol || '')}/analysis`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="p-8 text-slate-400">Loading analysis...</div>;
  if (!data?.bars) return <div className="p-8 text-rose-400">Error loading data.</div>;

  const currentBar = data.bars[data.bars.length - 1];
  const setup = data.active_setups?.[0]; // Show first active setup

  return (
    <div className="p-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 text-sm font-bold transition-colors uppercase tracking-widest text-[10px]">
         <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-end justify-between mb-8 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{symbol}</h1>
          <p className="text-slate-500 mt-1 font-medium">Daily timeframe analysis</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold text-slate-900">{formatCurrency(currentBar.bar.close)}</div>
          <div className="text-sm text-slate-400 mt-1 font-bold tracking-widest uppercase">Vol: {currentBar.bar.volume.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
           <div className="bg-white border border-slate-200 rounded-xl p-4 h-[500px] shadow-sm">
              <CandlestickChart data={data.bars} />
           </div>
           
           <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <Info className="h-4 w-4 text-indigo-600" />
                 Feature Snapshot
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                 <div className="bg-slate-50 p-3 rounded">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">SMA50</div>
                    <div className="font-mono text-slate-900 font-bold">{formatCurrency(currentBar.sma50)}</div>
                 </div>
                 <div className="bg-slate-50 p-3 rounded">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">SMA200</div>
                    <div className="font-mono text-slate-900 font-bold">{formatCurrency(currentBar.sma200)}</div>
                 </div>
                 <div className="bg-slate-50 p-3 rounded">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">RSI(14)</div>
                    <div className="font-mono text-slate-900 font-bold">{currentBar.rsi14.toFixed(1)}</div>
                 </div>
                 <div className="bg-slate-50 p-3 rounded">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-1">BB Width</div>
                    <div className="font-mono text-slate-900 font-bold">{currentBar.bbWidth.toFixed(3)}</div>
                 </div>
              </div>
           </div>
        </div>

        <div className="space-y-6">
          {setup ? (
            <div className="bg-indigo-900 border border-indigo-800 rounded-xl p-6 shadow-sm text-white overflow-hidden relative">
              <div className="relative z-10">
                <div className="inline-flex items-center px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold bg-white/10 text-indigo-200 mb-4">
                   Active Setup Detected
                </div>
                <h2 className="text-xl font-bold mb-2">{setup.setup_name}</h2>
                <p className="text-indigo-200 text-sm leading-relaxed mb-6 font-medium">
                   {setup.explanation}
                </p>

                <div className="space-y-3 mb-6">
                   <div className="bg-white/10 rounded p-3 flex items-center justify-between border border-white/5">
                      <div className="flex items-center gap-3">
                         <Target className="h-4 w-4 text-emerald-400" />
                         <span className="font-bold text-xs uppercase tracking-widest text-indigo-200">Entry Zone</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">&gt; {formatCurrency(setup.entry_price)}</span>
                   </div>
                   
                   <div className="bg-white/10 rounded p-3 flex items-center justify-between border border-white/5">
                      <div className="flex items-center gap-3">
                         <Shield className="h-4 w-4 text-rose-400" />
                         <span className="font-bold text-xs uppercase tracking-widest text-indigo-200">Stop Loss</span>
                      </div>
                      <span className="font-mono font-bold text-rose-400">{formatCurrency(setup.stop_price)}</span>
                   </div>
                   
                   <div className="bg-white/10 rounded p-3 flex items-center justify-between border border-white/5">
                      <div className="flex items-center gap-3">
                         <Target className="h-4 w-4 text-white" />
                         <span className="font-bold text-xs uppercase tracking-widest text-indigo-200">Target 1</span>
                      </div>
                      <span className="font-mono font-bold text-white">{formatCurrency(setup.target_1)}</span>
                   </div>
                </div>

                <div className="border-t border-white/10 pt-6">
                   <div className="flex gap-4 mb-6">
                      <div className="flex-1 bg-white/10 p-3 rounded">
                         <div className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold mb-1">R/R Ratio</div>
                         <div className="text-lg font-bold font-mono">{setup.risk_reward ? setup.risk_reward.toFixed(1) : '-'}</div>
                      </div>
                      <div className="flex-1 bg-white/10 p-3 rounded">
                         <div className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold mb-1">Historical Win %</div>
                         <div className="text-lg font-bold font-mono">{setup.probability != null ? (setup.probability * 100).toFixed(0) : '-'}%</div>
                      </div>
                   </div>

                   <div className="bg-red-500/20 text-red-100 rounded-lg p-4 border border-red-500/30">
                      <div className="text-xs uppercase tracking-widest font-bold mb-2 flex items-center gap-2 text-red-200">
                         <ShieldAlert className="h-4 w-4" /> Failure Risks
                      </div>
                      <p className="text-sm font-medium">{setup.failure_reasons}</p>
                   </div>
                </div>
              </div>
              <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-500/50 rounded-full blur-3xl pointer-events-none"></div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 shadow-sm font-medium">
               No active statistical setups detected for {symbol} right now.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
