import {
  Activity,
  ShieldAlert,
  BarChart2,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { WATCHLIST_SYMBOLS } from "../constants";

export function Dashboard() {
  const [symbols, setSymbols] = useState<any[]>([]);
  const [sortTeachingBy, setSortTeachingBy] = useState('winRate');
  const [sortTeachingDirection, setSortTeachingDirection] = useState<'desc'|'asc'>('desc');
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('dashboard_selected_symbols');
    if (saved) {
      try { return new Set(JSON.parse(saved)); } catch (e) {}
    }
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem('dashboard_selected_symbols', JSON.stringify(Array.from(selectedSymbols)));
    } catch (e) {
      console.warn('Could not save dashboard_selected_symbols to localStorage:', e);
    }
  }, [selectedSymbols]);
  const [status, setStatus] = useState<any>({
    isProcessing: false,
    stage: "Idle",
    progress: 0,
    details: "",
  });
  const [systemStatus, setSystemStatus] = useState("Loading...");
  const navigate = useNavigate();
  const pollInterval = useRef<any>(null);

  const availableIndicators = [
    { id: "sma200", name: "SMA 200 (Macro Trend)" },
    { id: "ema50", name: "EMA 50 (Mid Trend)" },
    { id: "ema20", name: "EMA 20 (Micro Trend)" },
    { id: "supertrend", name: "Supertrend" },
    { id: "adx", name: "ADX, +DI, -DI" },
    { id: "rsi14", name: "RSI 14 (Momentum)" },
    { id: "macd", name: "MACD" },
    { id: "atr", name: "ATR" },
    { id: "bbw", name: "Bollinger Band Width" },
    { id: "sr", name: "Supporti/resistenze (Structure)" },
    { id: "fibonacci", name: "Fibonacci Pivot Points" },
  ];

  const [selectedIndicators, setSelectedIndicators] = useState<Set<string>>(
    new Set([
      "sma200",
      "ema50",
      "ema20",
      "supertrend",
      "adx",
      "rsi14",
      "macd",
      "atr",
      "bbw",
      "sr",
      "fibonacci",
    ]),
  );
  const [timeframe, setTimeframe] = useState("PRO AUTO");
  const [frequency, setFrequency] = useState("1 Day");

  const toggleIndicator = (id: string) => {
    const next = new Set(selectedIndicators);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIndicators(next);
  };

  const [teachingResults, setTeachingResults] = useState<any>({});
  const [trainingSettings, setTrainingSettings] = useState<any>({});

  const fetchTrainedPatterns = () => {
    fetch("/api/trained-patterns")
      .then((r) => r.json())
      .then((d) => {
        if (d && Array.isArray(d.patterns)) {
          const dict: any = {};
          for (const item of d.patterns) {
             const key = `${item.symbol}_${item.setup_name}_${item.training_timeframe}`;
             dict[key] = item;
          }
          setTeachingResults(dict);
          let parsedSettings = {};
          if (d.settings?.training_settings) {
            try { parsedSettings = JSON.parse(d.settings.training_settings); } catch(e){}
          }
          setTrainingSettings(parsedSettings);
        } else if (Array.isArray(d)) {
          const dict: any = {};
          for (const item of d) {
             const key = `${item.symbol}_${item.setup_name}_${item.training_timeframe}`;
             dict[key] = item;
          }
          setTeachingResults(dict);
        }
      })
      .catch((e) => {
        const msg = String(e.message || e);
        if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
      });
  };

  useEffect(() => {
    fetch("/api/symbols")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setSymbols(d);
          setSystemStatus("Online");
          
          const savedStr = localStorage.getItem('dashboard_selected_symbols');
          let hasSaved = false;
          if (savedStr) {
             try {
                const parsed = JSON.parse(savedStr);
                if (Array.isArray(parsed) && parsed.length > 0) hasSaved = true;
             } catch(e) {}
          }

          if (!hasSaved) {
            const defaultSelected = new Set(
              d.filter((s) => s.active === 1).map((s) => s.symbol),
            );
            if (defaultSelected.size === 0) {
              setSelectedSymbols(new Set(d.map((s) => s.symbol)));
            } else {
              setSelectedSymbols(defaultSelected);
            }
          }
        } else {
          console.error("Expected array, received:", d);
          setSystemStatus("Offline (Data Error)");
        }
      })
      .catch((e) => setSystemStatus("Offline"));

    // Fetch initial trained patterns
    fetchTrainedPatterns();

    // Check status immediately on mount
    checkStatus();

    return () => clearInterval(pollInterval.current);
  }, []);

  const checkStatus = () => {
    fetch("/api/scanner/status")
      .then((r) => r.json())
      .then((d) => {
        if (!d || d.error) return;
        setStatus(d);
        if (d.isProcessing) {
          if (!pollInterval.current)
            pollInterval.current = setInterval(checkStatus, 1000);
        } else {
          if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
            // Fetch trained patterns when done
            fetchTrainedPatterns();
          }
        }
      })
      .catch((e) => {
        const msg = String(e.message || e);
        if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
      });
  };

  const toggleSymbol = (sym: string) => {
    const next = new Set(selectedSymbols);
    if (next.has(sym)) next.delete(sym);
    else next.add(sym);
    setSelectedSymbols(next);
  };

  const selectAll = () =>
    setSelectedSymbols(new Set(symbols.map((s) => s.symbol)));
  const selectNone = () => setSelectedSymbols(new Set());
  const selectWatchlist = () => setSelectedSymbols(new Set(WATCHLIST_SYMBOLS));

  const handleScan = async () => {
    if (selectedSymbols.size === 0) return alert("Select at least one symbol");
    if (selectedIndicators.size === 0)
      return alert("Select at least one indicator");

    await fetch("/api/scanner/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: Array.from(selectedSymbols),
        indicators: Array.from(selectedIndicators),
        timeframe,
        frequency,
        method: trainingSettings.method || 'pattern'
      }),
    });

    checkStatus();
  };

  const sectors = Array.from(new Set(symbols.map((s) => s.sector)));

  let avgTeachingQuality = 0;
  let avgModelFitting = 0;
  const trainedSymbolsCount = Object.keys(teachingResults).length;
  if (trainedSymbolsCount > 0) {
    let totalTeaching = 0;
    let totalFitting = 0;
    for (const key of Object.keys(teachingResults)) {
      totalTeaching += teachingResults[key].teachingQuality || 0;
      totalFitting += teachingResults[key].modelFittingPerformance || 0;
    }
    avgTeachingQuality = totalTeaching / trainedSymbolsCount;
    avgModelFitting = totalFitting / trainedSymbolsCount;
  }

  
  const modelPerformance = useMemo(() => {
    const models: Record<string, { count: number, winRateSum: number, teachingQSum: number, sampleSizeSum: number }> = {
       'Pattern Learning': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Time Series': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Signals': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 },
       'Learning Trend': { count: 0, winRateSum: 0, teachingQSum: 0, sampleSizeSum: 0 }
    };
    
    Object.values(teachingResults).forEach((res: any) => {
        let modelName = 'Pattern Learning';
        if (res.setup_name) {
            if (res.setup_name.includes('Time Series') || res.setup_name.includes('TS Multi')) modelName = 'Time Series';
            else if (res.setup_name.includes('Learning Trend')) modelName = 'Learning Trend';
            else if (res.setup_name.includes('Signal') || res.setup_name.includes('Segnali')) modelName = 'Signals';
            else modelName = 'Pattern Learning';
        }
        
        if (models[modelName]) {
            models[modelName].count += 1;
            models[modelName].winRateSum += (res.winRate || 0);
            models[modelName].teachingQSum += (res.teachingQuality || 0);
            models[modelName].sampleSizeSum += (res.sampleSize || 0);
        }
    });
    
    return models;
  }, [teachingResults]);
  
  const sortedTeachingResults = useMemo(() => {
    if (!teachingResults) return [];
    
    let sortableItems = Object.entries(teachingResults).map(([sym, res]: [string, any]) => ({ sym, ...res }));
    sortableItems.sort((a: any, b: any) => {
      let aVal = a[sortTeachingBy];
      let bVal = b[sortTeachingBy];
      
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      
      if (aVal < bVal) return sortTeachingDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortTeachingDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sortableItems;
  }, [teachingResults, sortTeachingBy, sortTeachingDirection]);

  return (
    <div className="p-4 md:p-8 pb-32 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-8 text-slate-900">
        Market Overview
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              System Status
            </span>
            <Activity className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-4xl font-light text-slate-900">{systemStatus}</p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            {symbols.length} Universe Symbols
          </p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Market Regime
            </span>
            <BarChart2 className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-4xl font-light text-slate-900">Bullish</p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            SPY &gt; SMA50
          </p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Model Performance
            </span>
            <Activity className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-4xl font-light text-slate-900">
            {trainedSymbolsCount > 0 ? `${avgModelFitting.toFixed(1)}%` : 'N/A'}
          </p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
             {trainedSymbolsCount > 0 ? `Avg Teaching Quality: ${avgTeachingQuality.toFixed(1)}%` : 'No models trained'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <RefreshCw
                className={`h-5 w-5 text-indigo-600 ${status.isProcessing ? "animate-spin" : ""}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Scan & Train Engine
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Select which assets to analyze, fetch real data, and run
                statistical triggers.
              </p>
            </div>
          </div>
          
          <button
            onClick={handleScan}
            disabled={selectedSymbols.size === 0}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded shadow-sm transition-colors uppercase tracking-widest flex items-center gap-2 m-0"
          >
            <BarChart2 className="w-4 h-4" />
            Run Analysis Workflow
          </button>
        </div>

        {status.isProcessing ? (
          <div className="bg-slate-50 rounded-xl p-8 border border-slate-200 text-center mb-6">
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">
                {status.stage}
              </div>
              <div className="text-xl font-bold text-slate-900">
                {status.details}
              </div>
            </div>

            <div className="w-full max-w-md mx-auto bg-slate-200 rounded-full h-2.5 mb-2 overflow-hidden relative">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${status.progress}%` }}
              ></div>
            </div>
            <div className="text-xs font-mono font-bold text-slate-500">
              {status.progress}%
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in relative mb-6">
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-6 mb-8 border-b border-slate-100 pb-6">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Training Method
                  </label>
                  <select
                    value={trainingSettings.method || 'pattern'}
                    onChange={(e) => setTrainingSettings({...trainingSettings, method: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500 p-2"
                  >
                    <option value="pattern">Pattern Learning (Original)</option>
                    <option value="timeseries">Time Series (Advanced)</option>
                    <option value="signals">Segnali (Rapid Durable Trend)</option>
                    <option value="learning_trend">Learning Trend (Robusto)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Training Timeframe
                  </label>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500 p-2"
                  >
                    <option value="PRO AUTO">PRO AUTO (Multi-Timeframe Ensemble)</option>
                    <option value="Last 3 Months">Last 3 Months</option>
                    <option value="Last 6 Months">Last 6 Months</option>
                    <option value="Last 1 Year">Last 1 Year</option>
                    <option value="Last 2 Years">Last 2 Years</option>
                    <option value="Last 5 Years">Last 5 Years</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Sampling Frequency
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    disabled={timeframe === 'PRO AUTO'}
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded focus:ring-indigo-500 focus:border-indigo-500 p-2 ${timeframe === 'PRO AUTO' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <option value="1 Minute">1 Minute</option>
                    <option value="15 Minutes">15 Minutes</option>
                    <option value="1 Hour">1 Hour</option>
                    <option value="1 Day">1 Day</option>
                    <option value="1 Week">1 Week</option>
                  </select>
                </div>
              </div>

              <div className="mb-8 border-b border-slate-100 pb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                  Model Features (Indicators)
                </label>
                <div className="flex flex-wrap gap-3">
                  {availableIndicators.map((ind) => {
                    const isSelected = selectedIndicators.has(ind.id);
                    return (
                      <button
                        key={ind.id}
                        onClick={() => toggleIndicator(ind.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          isSelected
                            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? "bg-emerald-600 border-emerald-600" : "border-slate-300"}`}
                        >
                          {isSelected && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span className="font-bold">{ind.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-4 mb-2">
                <button
                  onClick={selectAll}
                  className="text-xs font-bold text-indigo-600 px-3 py-1.5 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors uppercase tracking-widest"
                >
                  Select All
                </button>
                <button
                  onClick={selectWatchlist}
                  className="text-xs font-bold text-emerald-600 px-3 py-1.5 bg-emerald-50 rounded hover:bg-emerald-100 transition-colors uppercase tracking-widest"
                >
                  WatchList
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs font-bold text-slate-600 px-3 py-1.5 bg-slate-100 rounded hover:bg-slate-200 transition-colors uppercase tracking-widest"
                >
                  Clear All
                </button>
              </div>

              {sectors.map((sector) => {
                const sectorSymbols = symbols.filter(
                  (s) => s.sector === sector,
                );
                return (
                  <div key={sector}>
                    <h3 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">
                      {sector}
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {sectorSymbols.map((sym) => {
                        const isSelected = selectedSymbols.has(sym.symbol);
                        return (
                          <button
                            key={sym.symbol}
                            onClick={() => toggleSymbol(sym.symbol)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              isSelected
                                ? "bg-indigo-50 border-indigo-200 text-indigo-900"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center border ${isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}
                            >
                              {isSelected && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            <span className="font-bold">{sym.name}</span>
                            <span className="text-xs font-mono text-slate-400">
                              ({sym.symbol})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end items-center gap-4 border-t border-slate-100 pt-6">
              <div className="text-sm font-bold text-slate-500">
                {selectedSymbols.size} selected
              </div>
            </div>
          </div>
        )}

        {teachingResults && Object.keys(teachingResults).length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-900">
                Teaching Results (Historical Performance)
              </h3>
              <div className="flex gap-2">
                 <button
                   onClick={() => {
                        fetch('/api/scanner/clear-training', { method: 'POST' })
                          .then(() => {
                             setTeachingResults({});
                             setTrainingSettings({});
                             fetchTrainedPatterns();
                          });
                   }}
                   className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg font-bold text-sm shadow-sm hover:bg-rose-100 transition-colors"
                 >
                   Clear Training
                 </button>
                 <button
                   onClick={() => navigate("/scanner")}
                   className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm shadow hover:bg-indigo-700 transition-all transform hover:scale-105"
                 >
                   View Daily Scanner
                 </button>
              </div>
            </div>

            {/* Model Performance Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
               {Object.entries(modelPerformance)
                  .filter(([, stats]) => stats.count > 0)
                  .map(([name, stats]) => (
                 <div key={name} className="bg-slate-800 text-white rounded-lg p-3 shadow text-sm border border-slate-700 flex flex-col justify-between">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{name}</div>
                    <div className="flex justify-between items-end">
                       <div>
                         <div className="text-2xl font-black text-emerald-400">
                           {((stats.winRateSum / stats.count) * 100).toFixed(1)}%
                         </div>
                         <div className="text-[10px] font-bold text-slate-300">AVG WIN RATE</div>
                       </div>
                       <div className="text-right">
                         <div className="text-sm font-bold text-indigo-300">
                           {(stats.teachingQSum / stats.count).toFixed(0)}%
                         </div>
                         <div className="text-[9px] font-bold text-slate-400">QUALITY</div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>

            {trainingSettings && trainingSettings.training_timeframe && (
              <div className="mb-6 p-4 bg-white border border-slate-200 rounded-lg shadow-sm text-sm text-slate-600 flex justify-between items-center flex-wrap gap-4">
                <div>
                  <span className="font-bold text-slate-800">Parameters:</span> Timeframe: <span className="font-mono">{trainingSettings.training_timeframe}</span>, Frequency: <span className="font-mono">{trainingSettings.training_frequency}</span>
                </div>
                <div className="flex items-center gap-2">
                   <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sort By</label>
                   <select 
                      value={sortTeachingBy} 
                      onChange={e => setSortTeachingBy(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded focus:ring-indigo-500 focus:border-indigo-500 p-1.5"
                   >
                     <option value="winRate">Win Rate</option>
                     <option value="avgExpectancy">Expectancy</option>
                     <option value="patternsFound">Patterns Evaluated</option>
                     <option value="sampleSize">Dataset Bars</option>
                     <option value="teachingQuality">Teaching Quality</option>
                     <option value="modelFittingPerformance">Model Fitting</option>
                   </select>
                   <button 
                     onClick={() => setSortTeachingDirection(d => d === 'asc' ? 'desc' : 'asc')}
                     className="p-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded hover:bg-slate-100"
                   >
                     {sortTeachingDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                   </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              {sortedTeachingResults.map(
                (res: any) => (
                  <div
                    key={res.sym}
                    className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-colors"
                  >
                    <div className={`absolute top-0 left-0 w-1 h-full ${res.winRate >= 0.5 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    <div className="flex justify-between items-center mb-2 pl-2">
                       <div>
                          <span className="font-bold text-slate-900">{res.symbol || res.sym}</span>
                          {res.setup_name && <span className="ml-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">{res.setup_name}</span>}
                       </div>
                      <span className="text-[10px] font-bold text-slate-400 font-mono italic">
                        {res.training_timeframe || timeframe}
                      </span>
                    </div>
                    <div className="space-y-2 pl-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Dataset</span>
                        <span className="font-bold text-slate-700">
                          {res.sampleSize} bars
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">
                          {res.training_timeframe === 'TS Multi-Factor' ? 'TS Setups Evaluated' : 'Patterns Evaluated'}
                        </span>
                        <span className="font-bold">{res.patternsFound}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Overall Win Rate</span>
                        <span
                          className={`font-bold ${res.winRate >= 0.5 ? "text-emerald-600" : "text-slate-900"}`}
                        >
                          {(res.winRate * 100).toFixed(1)}%
                        </span>
                      </div>

                      {res.training_timeframe === 'TS Multi-Factor' && (
                        <div className="bg-slate-50 p-2 rounded -mx-2 my-2 border border-slate-200">
                           <div className="flex justify-between text-xs mb-1">
                             <span className="text-slate-500">Bullish Win Rate</span>
                             <span className="font-bold text-emerald-600">{res.bullWinRate ? (res.bullWinRate * 100).toFixed(1) + '%' : 'N/A'}</span>
                           </div>
                           <div className="flex justify-between text-xs mb-1">
                             <span className="text-slate-500">Average Pullback (Drawdown)</span>
                             <span className="font-bold text-slate-600">{res.avgBullDrawdown !== undefined ? (res.avgBullDrawdown * 100).toFixed(2) + '%' : 'N/A'}</span>
                           </div>
                           <div className="flex justify-between text-xs mb-1">
                             <span className="text-slate-500">Average Move Time</span>
                             <span className="font-bold text-slate-600">{res.avgBullMoveTime !== undefined ? Number(res.avgBullMoveTime).toFixed(1) + ' bars' : 'N/A'}</span>
                           </div>
                           <div className="flex justify-between text-xs border-t border-slate-200 pt-1 mt-1">
                             <span className="text-slate-500">Bearish Win Rate</span>
                             <span className="font-bold text-rose-600">{res.bearWinRate ? (res.bearWinRate * 100).toFixed(1) + '%' : 'N/A'}</span>
                           </div>
                           <div className="flex justify-between text-xs mb-1">
                             <span className="text-slate-500">Average Risk (Drawdown against short)</span>
                             <span className="font-bold text-slate-600">{res.avgBearDrawdown !== undefined ? (res.avgBearDrawdown * 100).toFixed(2) + '%' : 'N/A'}</span>
                           </div>
                           <div className="flex justify-between text-xs">
                             <span className="text-slate-500">Average Move Time</span>
                             <span className="font-bold text-slate-600">{res.avgBearMoveTime !== undefined ? Number(res.avgBearMoveTime).toFixed(1) + ' bars' : 'N/A'}</span>
                           </div>
                        </div>
                      )}

                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Expectancy</span>
                        <span className="font-bold text-indigo-600">
                          {res.avgExpectancy !== undefined && res.avgExpectancy !== null ? Number(res.avgExpectancy).toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
                        <span className="text-slate-500">Teaching Quality</span>
                        <span className="font-bold text-slate-800">
                          {typeof res.teachingQuality === 'number' ? res.teachingQuality.toFixed(1) : (Number(res.teachingQuality) || 0).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Model Fitting</span>
                        <span className="font-bold text-slate-800">
                          {typeof res.modelFittingPerformance === 'number' ? res.modelFittingPerformance.toFixed(1) : (Number(res.modelFittingPerformance) || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
