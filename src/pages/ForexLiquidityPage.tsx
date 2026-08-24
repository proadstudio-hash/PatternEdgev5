import { useState, useEffect, useRef } from 'react';
import { 
  Coins, 
  Settings, 
  Play, 
  RefreshCw, 
  AlertTriangle, 
  Layers, 
  Brain, 
  CheckCircle, 
  History, 
  XCircle, 
  Eye, 
  FileText, 
  Trash2, 
  Download, 
  ShieldAlert,
  Info,
  Sliders,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { createChart, IChartApi, CandlestickSeries } from 'lightweight-charts';
import { Candle, LiquidityLevel, LiquiditySignal, SignalStatus, BacktestLog } from '../types/forexLiquidity';

export function ForexLiquidityPage() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'scanner' | 'backtest'>('scanner');

  // Scanner State
  const [assetClass, setAssetClass] = useState<string>('FOREX_MAJORS');
  const [timeframe, setTimeframe] = useState<string>('M5');
  const [scanMode, setScanMode] = useState<'live' | 'historical'>('live');
  const [historicalIndex, setHistoricalIndex] = useState<number>(0); // Mock historical time index
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [signals, setSignals] = useState<LiquiditySignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<LiquiditySignal | null>(null);
  
  // Selected Symbol Chart Candles
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);

  // Configuration Panel Toggles
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [config, setConfig] = useState({
    asiaStart: '00:00',
    asiaEnd: '08:00',
    londonStart: '08:00',
    londonEnd: '11:00',
    nyStart: '14:00',
    nyEnd: '17:00',
    minRiskReward: 1.5,
    maxSpread: 2.5,
    newsFilter: true,
    timezone: 'Europe/Rome',
    provider: 'YAHOO'
  });

  // AI Explanation State
  const [aiExplanation, setAiExplanation] = useState<any | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // Backtest / Saving Log State
  const [backtestLogs, setBacktestLogs] = useState<BacktestLog[]>([]);
  const [logOutcome, setLogOutcome] = useState<string>('TP1 Hit');
  const [logMaxFavorable, setLogMaxFavorable] = useState<number>(10);
  const [logMaxAdverse, setLogMaxAdverse] = useState<number>(2);
  const [logNotes, setLogNotes] = useState<string>('');
  const [isSavingLog, setIsSavingLog] = useState<boolean>(false);

  // Chart Ref
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  // Default Assets mapping
  const assetSymbols: Record<string, string[]> = {
    FOREX_MAJORS: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'],
    FOREX_MINORS: ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/CHF', 'AUD/JPY', 'NZD/JPY', 'CAD/JPY'],
    INDICES: ['SPX', 'NDX', 'GER30', 'UK100', 'JPN225'],
    STOCKS: ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'],
    CRYPTO: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD']
  };

  // Trigger Scanner
  const handleScan = async () => {
    setIsScanning(true);
    try {
      const symbols = assetSymbols[assetClass] || [];
      const res = await fetch('/api/liquidity/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          timeframe,
          config: {
            ...config,
            // Inject historical mock mode adjustments if selected
            provider: scanMode === 'historical' ? 'MOCK' : config.provider
          }
        })
      });
      const data = await res.json();
      if (data.results) {
        setSignals(data.results);
        // Default select the top signal if nothing or different selected
        if (data.results.length > 0) {
          const top = data.results[0];
          setSelectedSignal(top);
        } else {
          setSelectedSignal(null);
        }
      }
    } catch (e) {
      console.error("Scanner failed:", e);
    } finally {
      setIsScanning(false);
    }
  };

  // Fetch candles for chosen symbol
  const fetchCandles = async (symbol: string) => {
    setIsLoadingCandles(true);
    try {
      const provider = scanMode === 'historical' ? 'MOCK' : config.provider;
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&provider=${provider}`);
      const data = await res.json();
      if (data.candles) {
        setCandles(data.candles);
      }
    } catch (e) {
      console.error("Candles fetch failed:", e);
    } finally {
      setIsLoadingCandles(false);
    }
  };

  // Load backtest logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/liquidity/logs');
      const data = await res.json();
      if (Array.isArray(data)) {
        setBacktestLogs(data);
      }
    } catch (e) {
      console.error("Logs fetch failed:", e);
    }
  };

  // Generate AI Explanation via Gemini
  const handleAiExplanation = async () => {
    if (!selectedSignal) return;
    setIsGeneratingAi(true);
    setAiExplanation(null);
    try {
      const res = await fetch('/api/liquidity/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: selectedSignal })
      });
      const data = await res.json();
      setAiExplanation(data);
    } catch (e) {
      console.error("AI explanation failed:", e);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Save current signal to log
  const handleSaveLog = async () => {
    if (!selectedSignal) return;
    setIsSavingLog(true);
    try {
      const logPayload = {
        signalId: `SL_${Date.now()}_${selectedSignal.symbol.replace(/\//gi, '_')}`,
        timestamp: new Date().toISOString(),
        symbol: selectedSignal.symbol,
        direction: selectedSignal.direction,
        statusAtDetection: selectedSignal.status,
        score: selectedSignal.score,
        sweptLevel: selectedSignal.sweptLevel?.label || 'Unknown',
        entry: selectedSignal.entry || selectedSignal.currentPrice,
        stopLoss: selectedSignal.stopLoss || 0,
        tp1: selectedSignal.tp1 || 0,
        tp2: selectedSignal.tp2 || 0,
        tp3: selectedSignal.tp3 || 0,
        resultLater: logOutcome,
        maxFavorableExcursion: logMaxFavorable,
        maxAdverseExcursion: logMaxAdverse,
        notes: logNotes
      };

      const res = await fetch('/api/liquidity/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logPayload)
      });
      const data = await res.json();
      if (data.success) {
        // Reset inputs and reload logs
        setLogNotes('');
        setLogOutcome('TP1 Hit');
        setLogMaxFavorable(10);
        setLogMaxAdverse(2);
        fetchLogs();
        alert("Signal successfully recorded in Backtest log!");
      }
    } catch (e) {
      console.error("Save log failed:", e);
    } finally {
      setIsSavingLog(false);
    }
  };

  // Delete log
  const handleDeleteLog = async (id: string) => {
    if (!confirm("Are you sure you want to delete this log?")) return;
    try {
      const res = await fetch(`/api/liquidity/logs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchLogs();
      }
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  // Export logs to CSV
  const handleExportCSV = () => {
    if (backtestLogs.length === 0) return;
    const headers = ["SignalId", "Timestamp", "Symbol", "Direction", "Status", "Score", "SweptLevel", "Entry", "SL", "TP1", "TP2", "TP3", "Result", "MaxFavorablePips", "MaxAdversePips", "Notes"];
    const rows = backtestLogs.map(l => [
      l.signalId,
      l.timestamp,
      l.symbol,
      l.direction,
      l.statusAtDetection,
      l.score,
      l.sweptLevel,
      l.entry,
      l.stopLoss,
      l.tp1,
      l.tp2,
      l.tp3,
      l.resultLater,
      l.maxFavorableExcursion,
      l.maxAdverseExcursion,
      l.notes
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ForexLiquidity_BacktestLogs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Initial loads
  useEffect(() => {
    handleScan();
    fetchLogs();
  }, [assetClass, timeframe, scanMode]);

  // Load candles when selected signal changes
  useEffect(() => {
    if (selectedSignal) {
      fetchCandles(selectedSignal.symbol);
      setAiExplanation(null); // Clear previous explanation
    }
  }, [selectedSignal]);

  // Chart Rendering using lightweight-charts
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clear any existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 380,
      layout: {
        background: { color: '#0f172a' }, // Deep slate background
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      }
    }) as any;

    chartRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#10b981',
      wickDownColor: '#ef4444',
      wickUpColor: '#10b981',
    });

    // Format data for lightweight-charts (timestamps must be Unix numbers)
    const formattedCandles = candles.map(c => ({
      time: Math.floor(new Date(c.time).getTime() / 1000) as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    })).sort((a, b) => a.time - b.time);

    candleSeries.setData(formattedCandles);

    // If there is an active signal with a swept level, let's draw it on the chart!
    if (selectedSignal) {
      const isJpy = selectedSignal.symbol.toUpperCase().includes('JPY');
      const decimalPlaces = isJpy ? 2 : 5;

      // Swept level line
      if (selectedSignal.sweptLevel) {
        const sweptLine = candleSeries.createPriceLine({
          price: selectedSignal.sweptLevel.price,
          color: '#eab308', // Amber yellow for swept level
          lineWidth: 2,
          lineStyle: 0, // Solid
          axisLabelVisible: true,
          title: `Swept ${selectedSignal.sweptLevel.label}`
        });
      }

      // Setup entry, stop loss, and targets if a sweep/signal exists
      if (selectedSignal.direction !== 'NONE') {
        // Entry Line
        if (selectedSignal.entry) {
          candleSeries.createPriceLine({
            price: selectedSignal.entry,
            color: '#3b82f6', // blue
            lineWidth: 1.5,
            lineStyle: 1, // dashed
            axisLabelVisible: true,
            title: 'Suggested Entry'
          });
        }
        // Stop Loss Line
        if (selectedSignal.stopLoss) {
          candleSeries.createPriceLine({
            price: selectedSignal.stopLoss,
            color: '#ef4444', // red
            lineWidth: 1.5,
            lineStyle: 1, // dashed
            axisLabelVisible: true,
            title: 'Stop Loss (Invalidation)'
          });
        }
        // Take Profit Lines
        if (selectedSignal.tp1) {
          candleSeries.createPriceLine({
            price: selectedSignal.tp1,
            color: '#10b981', // green
            lineWidth: 1,
            lineStyle: 2, // dotted
            axisLabelVisible: true,
            title: 'TP1 (1R)'
          });
        }
        if (selectedSignal.tp2) {
          candleSeries.createPriceLine({
            price: selectedSignal.tp2,
            color: '#10b981',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP2 (${selectedSignal.sweptLevel?.type.includes('HIGH') ? 'Below' : 'Above'} target)`
          });
        }
      }
    }

    // Auto fit content
    chart.timeScale().fitContent();

    // Handle Resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, selectedSignal]);

  // Color helper for priorities
  const getStatusBadge = (status: SignalStatus) => {
    switch (status) {
      case 'CONFIRMED_SIGNAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-green-500/10 text-green-500 border border-green-500/30 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            CONFIRMED
          </span>
        );
      case 'SWEEP_DETECTED':
      case 'CONFIRMATION_PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-amber-500/10 text-amber-500 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            PENDING
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase bg-rose-500/10 text-rose-500 border border-rose-500/30 line-through">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            BLOCKED
          </span>
        );
      case 'WATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            WATCHING
          </span>
        );
      case 'IGNORE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400">
            NO SETUP
          </span>
        );
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Coins className="h-8 w-8 text-indigo-600" />
            <h1 className="text-3xl font-black tracking-tight text-slate-900">FOREX LIQUIDITY TERMINAL</h1>
          </div>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Real-time and historical liquidity sweep reversal engine. Scan major assets, detect smart money sweeps, and receive structured, risk-defined entry setups based on objective data.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button 
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'scanner' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Layers className="h-4 w-4" /> Live Scanner
          </button>
          <button 
            onClick={() => setActiveTab('backtest')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all ${activeTab === 'backtest' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <History className="h-4 w-4" /> Backtest & Logs ({backtestLogs.length})
          </button>
        </div>
      </div>

      {activeTab === 'scanner' ? (
        <>
          {/* SCANNER CONTROLLER CARD */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Asset Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Asset Class:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(assetSymbols).map((ac) => (
                    <button
                      key={ac}
                      onClick={() => setAssetClass(ac)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${assetClass === ac ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                    >
                      {ac.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Core Parameters Quick-Access */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Timeframe:</span>
                  <select 
                    value={timeframe} 
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="bg-slate-50 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer"
                  >
                    <option value="M1">M1 (Scalping)</option>
                    <option value="M5">M5 (Intraday Core)</option>
                    <option value="M15">M15 (Standard)</option>
                    <option value="H1">H1 (Swing)</option>
                  </select>
                </div>

                <button 
                  onClick={() => setShowConfig(!showConfig)}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-bold ${showConfig ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <Settings className="h-4 w-4" /> Parameters
                </button>

                <button 
                  onClick={handleScan}
                  disabled={isScanning}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
                >
                  <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} /> Scan Now
                </button>
              </div>
            </div>

            {/* Config Panel Dropdown */}
            {showConfig && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Asia Session Window</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      value={config.asiaStart} 
                      onChange={(e) => setConfig({...config, asiaStart: e.target.value})}
                      className="bg-white border border-slate-200 text-xs rounded p-1.5"
                      placeholder="Start (00:00)"
                    />
                    <input 
                      type="text" 
                      value={config.asiaEnd} 
                      onChange={(e) => setConfig({...config, asiaEnd: e.target.value})}
                      className="bg-white border border-slate-200 text-xs rounded p-1.5"
                      placeholder="End (08:00)"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">London Sweep Window</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="text" 
                      value={config.londonStart} 
                      onChange={(e) => setConfig({...config, londonStart: e.target.value})}
                      className="bg-white border border-slate-200 text-xs rounded p-1.5"
                    />
                    <input 
                      type="text" 
                      value={config.londonEnd} 
                      onChange={(e) => setConfig({...config, londonEnd: e.target.value})}
                      className="bg-white border border-slate-200 text-xs rounded p-1.5"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Risk/Reward Threshold</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={config.minRiskReward}
                    onChange={(e) => setConfig({...config, minRiskReward: parseFloat(e.target.value)})}
                    className="w-full bg-white border border-slate-200 text-xs rounded p-1.5"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Max Spread (Pips)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={config.maxSpread}
                    onChange={(e) => setConfig({...config, maxSpread: parseFloat(e.target.value)})}
                    className="w-full bg-white border border-slate-200 text-xs rounded p-1.5"
                  />
                </div>

                <div className="col-span-1 md:col-span-2 flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                    <input 
                      type="checkbox" 
                      checked={config.newsFilter} 
                      onChange={(e) => setConfig({...config, newsFilter: e.target.checked})}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 border-slate-300"
                    />
                    Enable News Event Safety Filter
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600">Provider:</span>
                    <select
                      value={config.provider}
                      onChange={(e) => setConfig({...config, provider: e.target.value})}
                      className="bg-white border border-slate-200 text-xs rounded p-1"
                    >
                      <option value="YAHOO">Yahoo Finance (Live Market fallback)</option>
                      <option value="MOCK">Simulation engine (Guaranteed Sweep Opportunities)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SCAN MODE TOGGLE & SLIDER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scanner Mode:</span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button 
                    onClick={() => setScanMode('live')}
                    className={`px-3 py-1 rounded-md text-xs font-bold ${scanMode === 'live' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                  >
                    Real-Time Live Scan
                  </button>
                  <button 
                    onClick={() => setScanMode('historical')}
                    className={`px-3 py-1 rounded-md text-xs font-bold ${scanMode === 'historical' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}
                  >
                    Historical Replay Mode
                  </button>
                </div>
              </div>

              {scanMode === 'historical' && (
                <div className="flex-1 max-w-md flex items-center gap-3">
                  <span className="text-xs text-slate-500 font-bold">Time Index:</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="10" 
                    value={historicalIndex}
                    onChange={(e) => {
                      setHistoricalIndex(parseInt(e.target.value));
                      handleScan();
                    }}
                    className="flex-1 accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <span className="text-xs font-bold font-mono text-indigo-600">T - {10 - historicalIndex} bars</span>
                </div>
              )}
            </div>
          </div>

          {/* TWO COLUMN GRID: LEFT = SCANNER RANKINGS, RIGHT = DETAILED VIEW & CHART */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            
            {/* LEFT RANKINGS (5 COLS ON XL) */}
            <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[750px]">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-sm tracking-tight text-slate-800">Ranked Sweep Reversal Candidates</h3>
                <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                  Sorted by Status Priority &amp; Score
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Status / Direction</th>
                      <th className="p-3 text-right">Price</th>
                      <th className="p-3 text-right">R/R (TP2)</th>
                      <th className="p-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {signals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                          No symbols match current scan params. Click "Scan Now" or switch asset class.
                        </td>
                      </tr>
                    ) : (
                      signals.map((sig) => (
                        <tr 
                          key={sig.symbol}
                          onClick={() => setSelectedSignal(sig)}
                          className={`hover:bg-indigo-50/30 cursor-pointer transition-colors ${selectedSignal?.symbol === sig.symbol ? 'bg-indigo-50/50 border-l-4 border-l-indigo-600' : ''}`}
                        >
                          <td className="p-3 font-bold text-slate-900">
                            {sig.symbol}
                          </td>
                          <td className="p-3 space-y-1">
                            <div>{getStatusBadge(sig.status)}</div>
                            {sig.direction !== 'NONE' && (
                              <div className={`text-[10px] font-black tracking-wider ${sig.direction === 'BULLISH' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {sig.direction} SWEEP
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-800">
                            {sig.currentPrice.toFixed(sig.symbol.toUpperCase().includes('JPY') ? 2 : 5)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            {sig.direction !== 'NONE' ? `${sig.riskRewardTP2?.toFixed(1)}x` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            <span className={`px-2 py-1 rounded text-xs ${
                              sig.score >= 75 ? 'bg-green-100 text-green-800' :
                              sig.score >= 50 ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {sig.score}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT DETAILS PANEL (7 COLS ON XL) */}
            <div className="xl:col-span-7 flex flex-col gap-6">
              
              {/* INTERACTIVE CHART */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md flex flex-col">
                <div className="p-4 bg-slate-950/70 border-b border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-400" />
                    <span className="font-bold text-sm text-slate-100">
                      {selectedSignal ? `${selectedSignal.symbol} M${timeframe.replace('M','')}` : 'Market Chart View'}
                    </span>
                  </div>
                  {isLoadingCandles && <span className="text-xs text-slate-400 font-bold animate-pulse">Loading market feeds...</span>}
                </div>
                
                {/* Candle Plot Canvas */}
                <div className="p-2 bg-slate-950">
                  <div ref={chartContainerRef} className="w-full h-[380px]" />
                </div>

                {/* Level legend */}
                <div className="p-3 bg-slate-950/45 border-t border-slate-800/40 flex flex-wrap gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-yellow-500 rounded"></span> Swept Trigger Level
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-blue-500 rounded-sm border-dashed"></span> Entry Marker
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-red-500 rounded-sm border-dashed"></span> Stop Loss
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-emerald-500 rounded-sm border-dotted"></span> Targets (TP1/TP2)
                  </div>
                </div>
              </div>

              {/* SIGNAL QUANTITATIVE DETAIL & AI PANEL */}
              {selectedSignal ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                  
                  {/* Top line summary */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        {selectedSignal.symbol} Reversal Candidate 
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${selectedSignal.direction === 'BULLISH' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {selectedSignal.direction} Setup
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">Session: {selectedSignal.session} | ATR M15: {selectedSignal.atrM15?.toFixed(selectedSignal.symbol.includes('JPY') ? 2 : 4)}</p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                      <div className="text-center border-r border-slate-200 pr-3">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Score</span>
                        <span className="font-mono font-black text-slate-800 text-lg">{selectedSignal.score}/100</span>
                      </div>
                      <div className="text-center pl-1">
                        <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">R/R</span>
                        <span className="font-mono font-black text-emerald-600 text-lg">{selectedSignal.direction !== 'NONE' ? `${selectedSignal.riskRewardTP2?.toFixed(1)}x` : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Entry Levels Grid */}
                  {selectedSignal.direction !== 'NONE' && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sweep Low/High</span>
                        <span className="font-mono font-black text-slate-800 text-base">{selectedSignal.sweepExtreme?.toFixed(selectedSignal.symbol.includes('JPY') ? 2 : 5)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suggested Entry</span>
                        <span className="font-mono font-black text-indigo-600 text-base">{selectedSignal.entry?.toFixed(selectedSignal.symbol.includes('JPY') ? 2 : 5)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest text-rose-500">Stop Loss</span>
                        <span className="font-mono font-black text-rose-600 text-base">{selectedSignal.stopLoss?.toFixed(selectedSignal.symbol.includes('JPY') ? 2 : 5)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest text-emerald-600">TP1 (1R Target)</span>
                        <span className="font-mono font-black text-emerald-700 text-base">{selectedSignal.tp1?.toFixed(selectedSignal.symbol.includes('JPY') ? 2 : 5)}</span>
                      </div>
                    </div>
                  )}

                  {/* Quantitative Score Components */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Operational Scoring Weights</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Level Quality</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.levelQuality} / 20</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Sweep Quality</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.sweepQuality} / 20</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Session Aligned</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.session} / 15</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Microstructure</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.microstructure} / 15</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Risk Reward</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.riskReward} / 15</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Spread Friction</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.spread} / 10</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded">
                        <span className="block text-[9px] text-slate-400 font-bold uppercase">Volatility</span>
                        <span className="font-mono font-black text-slate-700">{selectedSignal.components.volatility} / 5</span>
                      </div>
                      <div className="p-2 border border-slate-100 rounded bg-rose-50 border-rose-100">
                        <span className="block text-[9px] text-rose-500 font-bold uppercase">News Penalty</span>
                        <span className="font-mono font-black text-rose-700">-{selectedSignal.components.newsPenalty}</span>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Explanation / Warnings */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">System Findings</h4>
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg space-y-2">
                      <p className="text-slate-700 text-sm leading-relaxed">{selectedSignal.explanation}</p>
                      <p className="text-xs text-slate-500 font-mono font-bold">{selectedSignal.invalidation}</p>
                    </div>

                    {selectedSignal.warnings && selectedSignal.warnings.length > 0 && (
                      <div className="space-y-1">
                        {selectedSignal.warnings.map((w, idx) => (
                          <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded bg-amber-50 text-amber-800 text-xs border border-amber-100">
                            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                            <span className="font-semibold">{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI INTEGRATION LAYER */}
                  <div className="border-t border-slate-100 pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-indigo-600 animate-pulse" />
                        <h4 className="font-black text-sm text-slate-900 tracking-tight">Gemini Advanced AI Explanation</h4>
                      </div>
                      <button 
                        onClick={handleAiExplanation}
                        disabled={isGeneratingAi}
                        className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-500 font-black text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                      >
                        {isGeneratingAi ? 'Analyzing Context...' : 'Generate AI Explanation'}
                      </button>
                    </div>

                    {aiExplanation && (
                      <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-xl space-y-4 animate-fadeIn text-xs">
                        <div>
                          <span className="font-bold text-indigo-800 uppercase tracking-wider block mb-1">Market Summary</span>
                          <p className="text-slate-700 leading-relaxed text-sm">{aiExplanation.summary}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <span className="font-bold text-indigo-800 uppercase tracking-wider block mb-1">Reason for Signal</span>
                            <p className="text-slate-600 leading-relaxed">{aiExplanation.reasonForSignal}</p>
                          </div>
                          <div>
                            <span className="font-bold text-rose-800 uppercase tracking-wider block mb-1 font-semibold">Risk Factors</span>
                            <p className="text-slate-600 leading-relaxed">{aiExplanation.riskFactors}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-indigo-100/60 pt-3">
                          <div>
                            <span className="font-bold text-slate-800 uppercase tracking-wider block mb-1">Trading Strategy</span>
                            <p className="text-slate-600 leading-relaxed">{aiExplanation.tradingPlan}</p>
                          </div>
                          <div>
                            <span className="font-bold text-amber-800 uppercase tracking-wider block mb-1">Confidence Comment</span>
                            <p className="text-slate-600 leading-relaxed">{aiExplanation.confidenceComment}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* LOG TO BACKTESTING PANEL */}
                  <div className="border-t border-slate-100 pt-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <History className="h-5 w-5 text-indigo-600" />
                      <h4 className="font-black text-sm text-slate-900 tracking-tight font-bold">Record Replay / Backtest Outcome</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase tracking-wide">Signal Outcome</label>
                        <select 
                          value={logOutcome} 
                          onChange={(e) => setLogOutcome(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-semibold"
                        >
                          <option value="TP1 Hit">TP1 Hit (1.0 Risk/Reward)</option>
                          <option value="TP2 Hit">TP2 Hit (Standard Target)</option>
                          <option value="TP3 Hit">TP3 Hit (Major High/Low target)</option>
                          <option value="SL Hit">Stop Loss Hit</option>
                          <option value="Invalidated">Invalidated (Level crossed before setup)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase tracking-wide">Max Favorable (Pips)</label>
                        <input 
                          type="number" 
                          value={logMaxFavorable} 
                          onChange={(e) => setLogMaxFavorable(parseFloat(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-1.5"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-500 uppercase tracking-wide">Max Adverse (Pips)</label>
                        <input 
                          type="number" 
                          value={logMaxAdverse} 
                          onChange={(e) => setLogMaxAdverse(parseFloat(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-1.5"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <label className="font-bold text-slate-500 uppercase tracking-wide block">Notes / Observations</label>
                      <textarea 
                        rows={2}
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs"
                        placeholder="Add annotations, news factors, or microstructure details here..."
                      />
                    </div>

                    <div className="flex justify-end">
                      <button 
                        onClick={handleSaveLog}
                        disabled={isSavingLog}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <FileText className="h-4 w-4" /> Save to Logs
                      </button>
                    </div>
                  </div>

                  {/* MANDATORY DISCLAIMER IN EVERY DETAILED PANEL */}
                  <div className="p-3.5 bg-rose-50 border border-rose-100/60 rounded-lg flex items-start gap-2 text-[10px] text-rose-800 leading-relaxed font-semibold">
                    <ShieldAlert className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="uppercase tracking-widest font-black text-[11px] mb-1">Operational Risk Disclaimer</p>
                      <p>
                        Every trading signal represents an objective market data scanning hypothesis. PatternEdge does NOT guarantee financial profitability and does not execute trade entries automatically. Margin trading contains high risks. Verify all stops and invalidations.
                      </p>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 font-bold">
                  Select a symbol from the candidates table to view operational scoring breakdowns and suggested target plans.
                </div>
              )}
            </div>

          </div>
        </>
      ) : (
        /* BACKTEST LAB VIEW TABLE */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
            <div>
              <h3 className="font-black text-slate-900 text-lg tracking-tight flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" /> Historic Replays &amp; Backtest Logs
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">Explore logged sweep detections and export them for MT5 / Python backtesting suites.</p>
            </div>
            
            <button 
              onClick={handleExportCSV}
              disabled={backtestLogs.length === 0}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-sm"
            >
              <Download className="h-4 w-4" /> Export CSV Data
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Symbol</th>
                  <th className="p-4">Direction</th>
                  <th className="p-4 text-center">Score</th>
                  <th className="p-4">Swept Level</th>
                  <th className="p-4 text-right">Entry</th>
                  <th className="p-4 text-right">SL</th>
                  <th className="p-4 text-right">TP2</th>
                  <th className="p-4">Outcome</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backtestLogs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400 font-bold text-sm">
                      No logs have been saved yet. Analyze a setup in the live scanner and click "Save to Logs" to populate.
                    </td>
                  </tr>
                ) : (
                  backtestLogs.map((log) => (
                    <tr key={log.signalId} className="hover:bg-slate-50/50">
                      <td className="p-4 text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-4 font-bold text-slate-900">{log.symbol}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.direction === 'BULLISH' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {log.direction}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold font-mono text-slate-700">{log.score}</td>
                      <td className="p-4 text-slate-600">{log.sweptLevel}</td>
                      <td className="p-4 text-right font-mono text-slate-800 font-bold">{log.entry.toFixed(4)}</td>
                      <td className="p-4 text-right font-mono text-rose-600">{log.stopLoss.toFixed(4)}</td>
                      <td className="p-4 text-right font-mono text-emerald-600">{log.tp2.toFixed(4)}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-black tracking-wider uppercase ${
                          log.resultLater.includes('Hit') ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {log.resultLater}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleDeleteLog(log.signalId)}
                          className="text-rose-500 hover:text-rose-700 p-1.5 rounded hover:bg-rose-50 transition-colors"
                          title="Delete Log"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FOOTER DISCLAIMER */}
      <div className="bg-slate-100 border border-slate-200 p-5 rounded-xl space-y-2 mt-8 text-xs text-slate-500">
        <h4 className="font-bold text-slate-700 uppercase tracking-widest text-[11px] flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-indigo-600" /> PatternEdge Forex Liquidity Safety Protocols
        </h4>
        <p className="leading-relaxed">
          The algorithmic scans provided by this module are based entirely on historical level calculations (Asia High/Low, Previous Day boundaries, and Round Numbers) combined with M5 wick penetration sweep analysis. Financial markets involve extreme volatility, leverage risks, and slippage. PatternEdge does not manage client funds or trigger broker-API live executions. Always consult with a licensed professional before trading.
        </p>
      </div>
    </div>
  );
}
