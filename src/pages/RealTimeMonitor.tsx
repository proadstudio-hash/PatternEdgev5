import React, { useState, useEffect } from 'react';
import { Activity, Search, RefreshCw, AlertCircle, X, Plus, Sparkles } from 'lucide-react';
import { OrderBookPanel } from '../components/OrderBookPanel';
import { ALL_CRYPTOS } from '../constants';

interface MonitorCondition {
    c1_sma200: boolean;
    c2_ema: boolean;
    c3_structure: boolean;
    c4_breakout?: boolean;
    c4_breakdown?: boolean;
    c5_volume: boolean;
    c6_adx: boolean;
    c7_supertrend: boolean;
    c8_rsi: boolean;
    c9_macd: boolean;
    c10_stopValue: number;
}

interface StrongSetup {
    c1: boolean;
    c2: boolean;
    c3: boolean;
    c4: boolean;
    c5: boolean;
    c6: boolean;
    c7: boolean;
    c8: boolean;
    c9: boolean;
    c10: boolean;
    c11: boolean;
    c12: boolean;
    c13: boolean;
    c14: boolean;
    c15: boolean;
}

interface MonitorResult {
    symbol: string;
    price?: number;
    error?: string;
    uptrend?: MonitorCondition;
    downtrend?: MonitorCondition;
    longForte?: StrongSetup;
    shortForte?: StrongSetup;
    bullScore?: number;
    bearScore?: number;
    globalScore?: number;
    robustData?: {
        signal: boolean;
        score: number;
        activeModules: string[];
        noTradeReasons: string[];
        modules: {
            momentumLeader: boolean;
            module52W: boolean;
            isRangeBreakout: boolean;
            isVolSqueezeBreakout: boolean;
            highVolConf: boolean;
            gapUpHold: boolean;
            isPullback: boolean;
            isGapHold: boolean;
            orbProxy: boolean;
        };
        conditions: {
            trendScore: number;
            volumeScore: number;
        };
    };
    orderBook?: any;
}

function interpretScore(score: number) {
    if (score <= 40) return { text: 'debole / no trade', color: 'text-slate-500' };
    if (score <= 60) return { text: 'osservazione', color: 'text-blue-500' };
    if (score <= 70) return { text: 'setup interessante', color: 'text-indigo-500' };
    if (score <= 80) return { text: 'segnale forte', color: 'text-emerald-500' };
    return { text: 'segnale molto forte', color: 'text-emerald-600 font-bold' };
}

export type SortField = 'bullScore' | 'bearScore' | 'robustScore' | 'globalScore' | 'symbol';

const QUICK_STOCK_PRESETS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'SPY', 'QQQ', 'AMZN', 'GOOGL'];
const QUICK_CRYPTO_PRESETS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'SUI-USD', 'ONDO-USD'];

export function RealTimeMonitor() {
    const [inputs, setInputs] = useState<string[]>(['AAPL', 'NVDA', 'TSLA', 'MSFT']);
    const [enableCrypto, setEnableCrypto] = useState<boolean>(false);
    const [results, setResults] = useState<MonitorResult[]>([]);
    const [scanResults, setScanResults] = useState<MonitorResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [mode, setMode] = useState<'DASHBOARD' | 'SCAN'>('DASHBOARD');
    const [interval, setInterval] = useState<string>('1d');
    const [sortField, setSortField] = useState<SortField | null>('globalScore');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (!enableCrypto) {
            const cryptos = ALL_CRYPTOS.map(c => c.symbol);
            setInputs(prev => prev.map(val => cryptos.includes(val) ? '' : val));
        }
    }, [enableCrypto]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const getSortedResults = () => {
        if (!sortField) return scanResults;
        return [...scanResults].sort((a, b) => {
            let aValue: any = a[sortField as keyof MonitorResult];
            let bValue: any = b[sortField as keyof MonitorResult];
            if (sortField === 'robustScore') {
                aValue = a.robustData?.score || 0;
                bValue = b.robustData?.score || 0;
            } else if (sortField === 'globalScore') {
                aValue = a.globalScore || 0;
                bValue = b.globalScore || 0;
            } else if (sortField === 'bullScore' || sortField === 'bearScore') {
                aValue = aValue || 0;
                bValue = bValue || 0;
            }
            if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const handleInputChange = (index: number, value: string) => {
        const newInputs = [...inputs];
        newInputs[index] = value.toUpperCase().trim();
        setInputs(newInputs);
    };

    const handleClearInput = (index: number) => {
        const newInputs = [...inputs];
        newInputs[index] = '';
        setInputs(newInputs);
    };

    const handleAddPreset = (sym: string) => {
        const clean = sym.toUpperCase().trim();
        if (inputs.includes(clean)) return;
        const emptyIdx = inputs.findIndex(v => v === '');
        if (emptyIdx !== -1) {
            const newInputs = [...inputs];
            newInputs[emptyIdx] = clean;
            setInputs(newInputs);
        } else {
            setInputs([...inputs, clean]);
        }
    };

    const handleUpdate = async () => {
        let validSymbols = inputs.filter(s => s !== '');
        if (!enableCrypto) {
            const cryptos = ALL_CRYPTOS.map(c => c.symbol);
            validSymbols = validSymbols.filter(s => !cryptos.includes(s));
        }
        if (validSymbols.length === 0) return;

        setLoading(true);
        try {
            const res = await fetch('/api/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: validSymbols, interval })
            });
            const data = await res.json();
            setResults(data);
        } catch (error: any) {
            const msg = String(error.message || error);
            if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
        } finally {
            setLoading(false);
        }
    };

    const handleTotalScan = async () => {
        setMode('SCAN');
        setScanning(true);
        try {
            const res = await fetch('/api/monitor/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interval, includeCrypto: enableCrypto })
            });
            const data = await res.json();
            setScanResults(data);
        } catch (error: any) {
            const msg = String(error.message || error);
            if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
        } finally {
            setScanning(false);
        }
    };

    // Auto-load on mount
    useEffect(() => {
        handleUpdate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const ConditionRow = ({ label, isTrue }: { label: string, isTrue: boolean }) => (
        <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span className="text-slate-600 dark:text-slate-300">{label}</span>
            <div className={`w-3 h-3 rounded-full ${isTrue ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
        </div>
    );

    return (
        <div className="p-4 md:p-8 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Activity className="w-6 h-6 text-indigo-600" />
                        Real-Time Monitor
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Live Multi-plot algorithmic matrix &amp; real-time market scanner</p>
                </div>

                <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                        onClick={() => setMode('DASHBOARD')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === 'DASHBOARD' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                    >
                        Multi-Symbol Dashboard
                    </button>
                    <button
                        onClick={() => {
                            setMode('SCAN');
                            if (scanResults.length === 0) handleTotalScan();
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${mode === 'SCAN' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
                    >
                        Full Market Scanner
                    </button>
                </div>
            </div>

            {/* Main Search and Control Bar */}
            <div className="bg-white dark:bg-slate-850 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 mb-6">
                {mode === 'DASHBOARD' ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                <Search className="w-4 h-4 text-indigo-600" />
                                Active Monitored Symbols
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                                Enter custom ticker symbols (e.g. AAPL, NVDA, TSLA) to compare in real time
                            </span>
                        </div>

                        {/* High-contrast explicit search input slots */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                            {inputs.map((val, idx) => (
                                <div key={idx} className="relative flex flex-col gap-1">
                                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 pl-1">
                                        Slot {idx + 1}
                                    </label>
                                    <div className="relative flex items-center">
                                        <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={val}
                                            onChange={(e) => handleInputChange(idx, e.target.value)}
                                            placeholder={`e.g. ${QUICK_STOCK_PRESETS[idx % QUICK_STOCK_PRESETS.length]}`}
                                            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white dark:bg-slate-800 dark:hover:bg-slate-750 dark:focus:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950 rounded-xl text-sm font-extrabold text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                                        />
                                        {val && (
                                            <button
                                                type="button"
                                                onClick={() => handleClearInput(idx)}
                                                className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                                title="Clear symbol"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Quick Presets for one-click symbol loading */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-amber-500" /> Quick Add:
                            </span>
                            {QUICK_STOCK_PRESETS.map((sym) => (
                                <button
                                    key={sym}
                                    type="button"
                                    onClick={() => handleAddPreset(sym)}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${inputs.includes(sym) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
                                >
                                    + {sym}
                                </button>
                            ))}
                            {enableCrypto && QUICK_CRYPTO_PRESETS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => handleAddPreset(c)}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${inputs.includes(c) ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
                                >
                                    🪙 {c.split('-')[0]}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div>
                            <p className="font-extrabold text-slate-800 dark:text-white flex items-center gap-2 text-sm">
                                <Activity className="w-4 h-4 text-emerald-500" />
                                Full Market Scanner Mode Active
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">Scanning universe across all active watchlist equities with real-time scoring.</p>
                        </div>
                        <button
                            onClick={() => setMode('DASHBOARD')}
                            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white px-4 py-2 rounded-xl text-xs font-bold transition self-start md:self-auto cursor-pointer"
                        >
                            &larr; Return to Multi-Symbol Dashboard
                        </button>
                    </div>
                )}

                {/* Bottom Controls Row: Interval, Crypto Toggle, Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Timeframe:</label>
                            <select 
                                value={interval} 
                                onChange={(e) => setInterval(e.target.value)} 
                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white outline-none cursor-pointer hover:border-slate-400"
                            >
                                <option value="1d">Daily Trend (1D)</option>
                                <option value="1h">Hourly Trend (1H)</option>
                                <option value="15m">15m Trend (15M)</option>
                            </select>
                        </div>

                        <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors select-none">
                            <input
                                type="checkbox"
                                checked={enableCrypto}
                                onChange={(e) => setEnableCrypto(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Crypto Feeds 🪙</span>
                        </label>
                    </div>

                    <div className="flex gap-2 items-center flex-wrap">
                        <button 
                            onClick={mode === 'DASHBOARD' ? handleUpdate : handleTotalScan}
                            disabled={loading || scanning}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                        >
                            {(loading || scanning) ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            <span>Update Live Data</span>
                        </button>
                        
                        {mode === 'DASHBOARD' && (
                            <button 
                                onClick={handleTotalScan}
                                disabled={scanning}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-70 cursor-pointer"
                            >
                                {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                                <span>SCANNER TOTALE</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Display Area */}
            <div className="flex-1 overflow-y-auto">
                {mode === 'SCAN' ? (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('symbol')}>Symbol {sortField==='symbol'&&(sortOrder==='asc'?'↑':'↓')}</th>
                                    <th className="p-4 font-bold text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">Price</th>
                                    <th className="p-4 font-bold text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('globalScore')}>Global Score {sortField==='globalScore'&&(sortOrder==='asc'?'↑':'↓')}</th>
                                    <th className="p-4 font-bold text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('bullScore')}>Bull Score {sortField==='bullScore'&&(sortOrder==='asc'?'↑':'↓')}</th>
                                    <th className="p-4 font-bold text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('bearScore')}>Bear Score {sortField==='bearScore'&&(sortOrder==='asc'?'↑':'↓')}</th>
                                    <th className="p-4 font-bold text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('robustScore')}>Robust Score {sortField==='robustScore'&&(sortOrder==='asc'?'↑':'↓')}</th>
                                    <th className="p-4 font-bold">Base Setup</th>
                                    <th className="p-4 font-bold">Forte Setup</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getSortedResults().map((res, i) => (
                                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 font-black">
                                            {res.symbol}
                                            {res.error && <p className="text-xs text-rose-500 font-normal mt-1">{res.error}</p>}
                                        </td>
                                        <td className="p-4 font-mono font-bold text-right">
                                            {res.price ? `$${res.price.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-black ${interpretScore(res.globalScore || 0).color}`}>{res.globalScore}%</span>
                                                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">GLOBAL</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-black ${interpretScore(res.bullScore || 0).color}`}>{res.bullScore}%</span>
                                                <span className={`text-[9px] uppercase tracking-wider font-bold ${interpretScore(res.bullScore || 0).color}`}>{interpretScore(res.bullScore || 0).text}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`font-black ${interpretScore(res.bearScore || 0).color}`}>{res.bearScore}%</span>
                                                <span className={`text-[9px] uppercase tracking-wider font-bold ${interpretScore(res.bearScore || 0).color}`}>{interpretScore(res.bearScore || 0).text}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            {res.robustData ? (
                                                <div className="flex flex-col items-center">
                                                    <span className={`font-black ${res.robustData.signal ? 'text-indigo-600' : 'text-slate-400'}`}>{res.robustData.score}</span>
                                                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500">{res.robustData.signal ? 'SIGNAL' : '-'}</span>
                                                </div>
                                            ) : <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="p-4 text-sm font-medium">
                                            {res.uptrend?.c4_breakout ? <span className="text-emerald-500">Uptrend (Breakout)</span> : res.downtrend?.c4_breakdown ? <span className="text-rose-500">Downtrend (Breakdown)</span> : <span className="text-slate-400">Neutral</span>}
                                        </td>
                                        <td className="p-4 text-sm font-medium">
                                            {res.longForte?.c4 ? <span className="text-emerald-600 font-bold">LONG FORTE</span> : res.shortForte?.c4 ? <span className="text-rose-600 font-bold">SHORT FORTE</span> : <span className="text-slate-300">-</span>}
                                        </td>
                                    </tr>
                                ))}
                                {scanResults.length === 0 && !scanning && (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-500">No results found. Click &quot;SCANNER TOTALE&quot; to execute scan.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={`grid gap-6 ${results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'}`}>
                    {results.map((res, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-sm">
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                                <h2 className="text-xl font-black flex items-center gap-3">
                                    {res.symbol}
                                    {res.globalScore && (
                                        <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-full border border-indigo-200 dark:border-indigo-800">
                                            Global Score: {res.globalScore}%
                                        </span>
                                    )}
                                </h2>
                                {res.price && <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">${res.price.toFixed(2)}</div>}
                            </div>
                            
                            {res.error ? (
                                <div className="p-8 flex flex-col items-center justify-center text-slate-400 h-full gap-2">
                                    <AlertCircle className="w-8 h-8 text-rose-400" />
                                    <p className="text-sm font-medium">{res.error}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col lg:flex-row flex-1 p-4 gap-6 overflow-x-auto">
                                    
                                    {/* Base Uptrend */}
                                    <div className="flex-1 space-y-3 min-w-[250px]">
                                        <h3 className="font-bold text-emerald-600 flex items-center justify-between border-b border-emerald-100 dark:border-emerald-900 pb-2">
                                            <span>Probable Uptrend</span>
                                        </h3>
                                        <div className="space-y-1">
                                            <ConditionRow label="Price > SMA 200" isTrue={res.uptrend?.c1_sma200 ?? false} />
                                            <ConditionRow label="EMA 20 > EMA 50" isTrue={res.uptrend?.c2_ema ?? false} />
                                            <ConditionRow label="Higher Highs & Lows" isTrue={res.uptrend?.c3_structure ?? false} />
                                            <ConditionRow label="Breakout vs Resistance" isTrue={res.uptrend?.c4_breakout ?? false} />
                                            <ConditionRow label="Volume > Avg (Up Bar)" isTrue={res.uptrend?.c5_volume ?? false} />
                                            <ConditionRow label="ADX > 20 (+DI > -DI)" isTrue={res.uptrend?.c6_adx ?? false} />
                                            <ConditionRow label="Price > Supertrend" isTrue={res.uptrend?.c7_supertrend ?? false} />
                                            <ConditionRow label="RSI > 50" isTrue={res.uptrend?.c8_rsi ?? false} />
                                            <ConditionRow label="MACD Improving" isTrue={res.uptrend?.c9_macd ?? false} />
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-emerald-600">Stop Loss</span>
                                            <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                                ~${res.uptrend?.c10_stopValue ? res.uptrend.c10_stopValue.toFixed(2) : '-'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Strong Uptrend */}
                                    <div className="flex-1 space-y-3 min-w-[250px]">
                                        <h3 className="font-bold text-emerald-700 dark:text-emerald-500 flex flex-col border-b border-emerald-200 dark:border-emerald-800 pb-2">
                                            <span className="flex justify-between items-center w-full">
                                                <span>Setup Long Forte</span>
                                                <span className={`text-sm ${interpretScore(res.bullScore || 0).color}`}>{res.bullScore}%</span>
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${interpretScore(res.bullScore || 0).color}`}>{interpretScore(res.bullScore || 0).text}</span>
                                        </h3>
                                        <div className="space-y-1">
                                            <ConditionRow label="Prezzo > SMA 200" isTrue={res.longForte?.c1 ?? false} />
                                            <ConditionRow label="EMA 20 > EMA 50" isTrue={res.longForte?.c2 ?? false} />
                                            <ConditionRow label="Struttura HH HL" isTrue={res.longForte?.c3 ?? false} />
                                            <ConditionRow label="Breakout Resistenza" isTrue={res.longForte?.c4 ?? false} />
                                            <ConditionRow label="Volume > 1.5x Avg" isTrue={res.longForte?.c5 ?? false} />
                                            <ConditionRow label="ADX > 20 Crescente" isTrue={res.longForte?.c6 ?? false} />
                                            <ConditionRow label="+DI > -DI" isTrue={res.longForte?.c7 ?? false} />
                                            <ConditionRow label="Prezzo > Supertrend" isTrue={res.longForte?.c8 ?? false} />
                                            <ConditionRow label="50 < RSI < 70" isTrue={res.longForte?.c9 ?? false} />
                                            <ConditionRow label="MACD Miglioramento" isTrue={res.longForte?.c10 ?? false} />
                                            <ConditionRow label="Forza Relativa > 0" isTrue={res.longForte?.c11 ?? false} />
                                            <ConditionRow label="Settore Positivo" isTrue={res.longForte?.c12 ?? false} />
                                            <ConditionRow label="Uscita Compressione" isTrue={res.longForte?.c13 ?? false} />
                                            <ConditionRow label="Risk/Reward > 1:2" isTrue={res.longForte?.c14 ?? false} />
                                            <ConditionRow label="Spazio Resistenza" isTrue={res.longForte?.c15 ?? false} />
                                        </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="h-px lg:h-auto lg:w-px bg-slate-200 dark:bg-slate-800 my-4 lg:my-0 flex-shrink-0"></div>

                                    {/* Robust Long Setup */}
                                    <div className="flex-1 space-y-3 min-w-[250px] bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <h3 className="font-bold text-indigo-700 dark:text-indigo-400 flex flex-col border-b border-indigo-200 dark:border-indigo-800/50 pb-2">
                                            <span className="flex justify-between items-center w-full">
                                                <span>Long Robusta</span>
                                                <span className={`text-sm ${res.robustData?.signal ? 'text-indigo-600 font-black' : 'text-slate-400'}`}>{res.robustData?.score ?? 0} pt</span>
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${res.robustData?.signal ? 'text-indigo-500' : 'text-slate-400'}`}>
                                                {res.robustData?.signal ? 'SIGNAL ATTIVO' : 'OSSERVAZIONE'}
                                            </span>
                                        </h3>
                                        {res.robustData && (
                                            <div className="space-y-3 pt-1">
                                                
                                                <div className="space-y-1">
                                                    <ConditionRow label="1. Momentum Leader" isTrue={res.robustData.modules.momentumLeader} />
                                                    <ConditionRow label="2. 52-Week High" isTrue={res.robustData.modules.module52W} />
                                                    <ConditionRow label="3. Range Breakout" isTrue={res.robustData.modules.isRangeBreakout} />
                                                    <ConditionRow label="4. Volatility Squeeze" isTrue={res.robustData.modules.isVolSqueezeBreakout} />
                                                    <ConditionRow label="5. High Vol Confirmation" isTrue={res.robustData.modules.highVolConf} />
                                                    <ConditionRow label="6. PEAD / Gap Up" isTrue={res.robustData.modules.gapUpHold} />
                                                    <ConditionRow label="7. Pullback in Trend" isTrue={res.robustData.modules.isPullback} />
                                                    <ConditionRow label="8. Gap Hold" isTrue={res.robustData.modules.isGapHold} />
                                                    <ConditionRow label="9. ORB Intraday" isTrue={res.robustData.modules.orbProxy} />
                                                </div>

                                                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
                                                    <ConditionRow label="Trend Score (>=65)" isTrue={res.robustData.conditions.trendScore >= 65} />
                                                    <ConditionRow label="Volume Score (>=60)" isTrue={res.robustData.conditions.volumeScore >= 60} />
                                                    <ConditionRow label="Ha Moduli Attivi?" isTrue={res.robustData.activeModules.length > 0} />
                                                </div>

                                                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 border-b border-slate-200 dark:border-slate-700 pb-1">Filtri NO TRADE</p>
                                                    {res.robustData.noTradeReasons.length > 0 ? (
                                                        <div className="flex flex-col gap-1">
                                                            {res.robustData.noTradeReasons.map(r => (
                                                                <span key={r} className="text-[11px] text-rose-500 flex items-start gap-1 leading-tight"><span className="text-rose-400 mt-0.5">•</span> {r}</span>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">Nessun blocco attivo</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Divider */}
                                    <div className="h-px lg:h-auto lg:w-px bg-slate-200 dark:bg-slate-800 my-4 lg:my-0 flex-shrink-0"></div>

                                    {/* Base Downtrend */}
                                    <div className="flex-1 space-y-3 min-w-[250px]">
                                        <h3 className="font-bold text-rose-600 flex items-center justify-between border-b border-rose-100 dark:border-rose-900 pb-2">
                                            <span>Probable Downtrend</span>
                                        </h3>
                                        <div className="space-y-1">
                                            <ConditionRow label="Price < SMA 200" isTrue={res.downtrend?.c1_sma200 ?? false} />
                                            <ConditionRow label="EMA 20 < EMA 50" isTrue={res.downtrend?.c2_ema ?? false} />
                                            <ConditionRow label="Lower Highs & Lows" isTrue={res.downtrend?.c3_structure ?? false} />
                                            <ConditionRow label="Breakdown vs Support" isTrue={res.downtrend?.c4_breakdown ?? false} />
                                            <ConditionRow label="Volume > Avg (Down Bar)" isTrue={res.downtrend?.c5_volume ?? false} />
                                            <ConditionRow label="ADX > 20 (-DI > +DI)" isTrue={res.downtrend?.c6_adx ?? false} />
                                            <ConditionRow label="Price < Supertrend" isTrue={res.downtrend?.c7_supertrend ?? false} />
                                            <ConditionRow label="RSI < 50" isTrue={res.downtrend?.c8_rsi ?? false} />
                                            <ConditionRow label="MACD Worsening" isTrue={res.downtrend?.c9_macd ?? false} />
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest text-rose-600">Stop Loss</span>
                                            <span className="font-mono text-sm font-bold text-rose-700 dark:text-rose-400">
                                                ~${res.downtrend?.c10_stopValue ? res.downtrend.c10_stopValue.toFixed(2) : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Strong Downtrend */}
                                    <div className="flex-1 space-y-3 min-w-[250px]">
                                        <h3 className="font-bold text-rose-700 dark:text-rose-500 flex flex-col border-b border-rose-200 dark:border-rose-800 pb-2">
                                            <span className="flex justify-between items-center w-full">
                                                <span>Setup Short Forte</span>
                                                <span className={`text-sm ${interpretScore(res.bearScore || 0).color}`}>{res.bearScore}%</span>
                                            </span>
                                            <span className={`text-[10px] uppercase font-bold tracking-wider ${interpretScore(res.bearScore || 0).color}`}>{interpretScore(res.bearScore || 0).text}</span>
                                        </h3>
                                        <div className="space-y-1">
                                            <ConditionRow label="Prezzo < SMA 200" isTrue={res.shortForte?.c1 ?? false} />
                                            <ConditionRow label="EMA 20 < EMA 50" isTrue={res.shortForte?.c2 ?? false} />
                                            <ConditionRow label="Struttura LH LL" isTrue={res.shortForte?.c3 ?? false} />
                                            <ConditionRow label="Breakdown Supporto" isTrue={res.shortForte?.c4 ?? false} />
                                            <ConditionRow label="Volume > 1.5x Avg" isTrue={res.shortForte?.c5 ?? false} />
                                            <ConditionRow label="ADX > 20 Crescente" isTrue={res.shortForte?.c6 ?? false} />
                                            <ConditionRow label="-DI > +DI" isTrue={res.shortForte?.c7 ?? false} />
                                            <ConditionRow label="Prezzo < Supertrend" isTrue={res.shortForte?.c8 ?? false} />
                                            <ConditionRow label="RSI < 50" isTrue={res.shortForte?.c9 ?? false} />
                                            <ConditionRow label="MACD Peggioramento" isTrue={res.shortForte?.c10 ?? false} />
                                            <ConditionRow label="Forza Relativa < 0" isTrue={res.shortForte?.c11 ?? false} />
                                            <ConditionRow label="Settore Debole" isTrue={res.shortForte?.c12 ?? false} />
                                            <ConditionRow label="Uscita Compressione" isTrue={res.shortForte?.c13 ?? false} />
                                            <ConditionRow label="Rimbalzi Vol Basso" isTrue={res.shortForte?.c14 ?? false} />
                                            <ConditionRow label="Supporti Lontani" isTrue={res.shortForte?.c15 ?? false} />
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/35 dark:bg-slate-900/10">
                                    <OrderBookPanel symbol={res.symbol} currentPrice={res.price} orderBook={res.orderBook} />
                                </div>
                                </>
                            )}
                        </div>
                    ))}
                    {results.length === 0 && !loading && (
                        <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                            <Activity className="w-12 h-12 mb-4 opacity-50" />
                            <p className="font-bold text-slate-600 dark:text-slate-300">No active symbols configured.</p>
                            <p className="text-xs text-slate-400 mt-1">Enter symbol(s) above or click a Quick Add preset, then click Update Live Data.</p>
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}

