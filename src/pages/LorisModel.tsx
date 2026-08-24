import { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Play, Flame, ShieldAlert, List, CheckCircle, 
  TrendingUp, X, Gauge, LineChart, RotateCw, Activity, Info, BarChart3, HelpCircle
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface LorisPrediction {
  id: number;
  scan_run_id: string;
  symbol: string;
  timestamp: string;
  current_price: number;
  score: number;
  probability_1d: number;
  probability_2d: number;
  probability_3d: number;
  probability_1w: number;
  expected_gain_percent: number;
  expected_target_price: number;
  expected_duration: number;
  stop_loss_candidate: number;
  invalidation_level: number;
  risk_reward_ratio: number;
  signal_type: string;
  setup_type: string;
  explanation_json: string;
  created_at: string;
}

interface LorisRun {
  id: number;
  created_at: string;
  symbols: string;
  timeframes: string;
  periods: string;
  settings_json: string;
  status: string;
  metrics_json: string;
  logs: string;
}

interface LorisImportance {
  id: number;
  model_run_id: string;
  feature_name: string;
  importance_score: number;
  horizon: string;
}

interface LorisEvent {
  id: number;
  symbol: string;
  event_start: string;
  event_end: string;
  start_price: number;
  max_price: number;
  max_gain_percent: number;
  duration_days: number;
  time_to_max: number;
  max_adverse_excursion: number;
  event_strength_class: string;
}

export function LorisModel() {
  // Settings State
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ']);
  const [horizonDays, setHorizonDays] = useState<number>(10);
  const [minGrowth, setMinGrowth] = useState<number>(5.0);
  const [minScore, setMinScore] = useState<number>(70);
  
  const [enableBenchmark, setEnableBenchmark] = useState<boolean>(true);
  const [enableNeural, setEnableNeural] = useState<boolean>(true);
  const [enableFeatureModel, setEnableFeatureModel] = useState<boolean>(true);
  const [enableRules, setEnableRules] = useState<boolean>(true);
  
  const [wFeature, setWFeature] = useState<number>(0.40);
  const [wNeural, setWNeural] = useState<number>(0.40);
  const [wRules, setWRules] = useState<number>(0.20);

  // Status API State
  const [systemStatus, setSystemStatus] = useState<any>({ isProcessing: false, stage: 'Idle', progress: 0, phase: '' });
  const [modelRuns, setModelRuns] = useState<LorisRun[]>([]);
  const [activeRunLog, setActiveRunLog] = useState<string>('');
  
  // Predictions & Events State
  const [predictions, setPredictions] = useState<LorisPrediction[]>([]);
  const [importances, setImportances] = useState<LorisImportance[]>([]);
  const [growthEvents, setGrowthEvents] = useState<LorisEvent[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<LorisPrediction | null>(null);

  const [tickerSearch, setTickerSearch] = useState<string>('');
  const [isTrainingLoading, setIsTrainingLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'configs'>('history');

  const logEndRef = useRef<HTMLDivElement>(null);

  const exportModels = async () => {
    try {
      const res = await fetch('/api/loris/export');
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loris_models_backup_${new Date().getTime()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(e) {
      console.error(e);
      alert('Error exporting models');
    }
  };

  const importModels = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/loris/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Import failed');
      alert('Models and settings imported successfully! Please refresh.');
      fetchLorisData();
    } catch(err) {
      console.error(err);
      alert('Error importing models');
    }
  };

  // Load Initial Configurations
  useEffect(() => {
    fetchLorisData();
    const interval = setInterval(() => {
      fetchStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeRunLog]);

  const fetchLorisData = async () => {
    try {
      let mainPageSymbols: string[] = [];
      const savedStr = localStorage.getItem('dashboard_selected_symbols');
      if (savedStr) {
         try {
            const parsed = JSON.parse(savedStr);
            if (Array.isArray(parsed) && parsed.length > 0) mainPageSymbols = parsed;
         } catch(e) {}
      }
      
      if (mainPageSymbols.length === 0) {
        const dbSymbols = await fetch('/api/symbols').then(res => res.json());
        if (Array.isArray(dbSymbols)) {
          mainPageSymbols = dbSymbols.filter((s:any) => s.active === 1).map((s:any) => s.symbol);
        }
      }

      const sp = await fetch('/api/loris/predictions').then(res => res.json());
      
      // Step 3 sorting: greatest results so stronger growth signals that leads to a most probable growth
      let sortedPredictions = sp || [];
      sortedPredictions.sort((a: LorisPrediction, b: LorisPrediction) => {
          if (Math.abs(b.score - a.score) > 0.001) {
              return b.score - a.score;
          }
          if (Math.abs((b.expected_gain_percent || 0) - (a.expected_gain_percent || 0)) > 0.001) {
              return (b.expected_gain_percent || 0) - (a.expected_gain_percent || 0);
          }
          if (Math.abs((b.probability_1w || 0) - (a.probability_1w || 0)) > 0.001) {
              return (b.probability_1w || 0) - (a.probability_1w || 0);
          }
          return a.symbol.localeCompare(b.symbol);
      });
      setPredictions(sortedPredictions);

      const runs = await fetch('/api/loris/runs').then(res => res.json());
      setModelRuns(runs || []);
      if (runs && runs.length > 0) {
        setActiveRunLog(runs[0].logs || '');
      }

      const imps = await fetch('/api/loris/importance').then(res => res.json());
      setImportances(imps || []);

      const evs = await fetch('/api/loris/events').then(res => res.json());
      setGrowthEvents(evs || []);
      
      const sets = await fetch('/api/loris/settings').then(res => res.json());
      if (sets) {
        // ALWAYS force currently active symbols instead of relying on saved model settings
        if (mainPageSymbols.length > 0) {
           setSelectedSymbols(mainPageSymbols);
        } else if (sets.symbols && sets.symbols.length > 0) {
           setSelectedSymbols(sets.symbols);
        }
        
        if (sets.growthDaysHorizon) setHorizonDays(sets.growthDaysHorizon);
        if (sets.minGrowthThreshold) setMinGrowth(sets.minGrowthThreshold);
        if (sets.minScoreThreshold) setMinScore(sets.minScoreThreshold);
        if (sets.enableBenchmark !== undefined) setEnableBenchmark(sets.enableBenchmark);
        if (sets.enableNeural !== undefined) setEnableNeural(sets.enableNeural);
        if (sets.enableFeatureModel !== undefined) setEnableFeatureModel(sets.enableFeatureModel);
        if (sets.enableRules !== undefined) setEnableRules(sets.enableRules);
        if (sets.weightFeatureModel !== undefined) setWFeature(sets.weightFeatureModel);
        if (sets.weightNeural !== undefined) setWNeural(sets.weightNeural);
        if (sets.weightRules !== undefined) setWRules(sets.weightRules);
      } else if (mainPageSymbols.length > 0) {
         setSelectedSymbols(mainPageSymbols);
      }
    } catch(err) {
      
    }
  };

  const fetchStatus = async () => {
    try {
      const st = await fetch('/api/scanner/status').then(res => res.json());
      setSystemStatus(st || { isProcessing: false, stage: 'Idle', progress: 0, phase: '' });
      
      // If training is ongoing, refresh the latest run logs continuously
      if (st.isProcessing) {
        const runs = await fetch('/api/loris/runs').then(res => res.json());
        if (runs && runs.length > 0) {
          setModelRuns(runs);
          setActiveRunLog(runs[0].logs || '');
        }
      }
    } catch(e) {}
  };

  const handleToggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      setSelectedSymbols(selectedSymbols.filter(s => s !== sym));
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const handleAddTicker = () => {
    const sym = tickerSearch.trim().toUpperCase();
    if (sym && !selectedSymbols.includes(sym)) {
      setSelectedSymbols([...selectedSymbols, sym]);
      setTickerSearch('');
    }
  };

  const saveSettings = async () => {
    const settings = {
      symbols: selectedSymbols,
      timeframes: ['1d'],
      periods: ['1y'],
      minGrowthThreshold: minGrowth,
      growthDaysHorizon: horizonDays,
      minScoreThreshold: minScore,
      enableBenchmark,
      enableSector: true,
      enableNeural,
      enableFeatureModel,
      enableRules,
      weightFeatureModel: wFeature,
      weightNeural: wNeural,
      weightRules: wRules,
      eventThresholds: {
        small: { pct: 3, days: 5 },
        medium: { pct: 5, days: 10 },
        strong: { pct: 8, days: 20 },
        explosive: { pct: 12, days: 30 }
      }
    };
    await fetch('/api/loris/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  };

  const triggerTraining = async () => {
    setIsTrainingLoading(true);
    await saveSettings();
    try {
      const settings = {
        symbols: selectedSymbols,
        timeframes: ['1d'],
        periods: ['1y'],
        minGrowthThreshold: minGrowth,
        growthDaysHorizon: horizonDays,
        minScoreThreshold: minScore,
        enableBenchmark,
        enableSector: true,
        enableNeural,
        enableFeatureModel,
        enableRules,
        weightFeatureModel: wFeature,
        weightNeural: wNeural,
        weightRules: wRules,
        eventThresholds: {
          small: { pct: 3, days: 5 },
          medium: { pct: 5, days: 10 },
          strong: { pct: 8, days: 20 },
          explosive: { pct: 12, days: 30 }
        }
      };
      const res = await fetch('/api/loris/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: selectedSymbols, settings })
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch(e) {
      if (String(e).includes("Load failed") || String(e).includes("pattern")) { /* ignore */ } else { console.error(e); }
    } finally {
      setIsTrainingLoading(false);
    }
  };

  const triggerDailyScan = async () => {
    setIsTrainingLoading(true);
    await saveSettings();
    try {
      const settings = {
        symbols: selectedSymbols,
        timeframes: ['1d'],
        periods: ['1y'],
        minGrowthThreshold: minGrowth,
        growthDaysHorizon: horizonDays,
        minScoreThreshold: minScore,
        enableBenchmark,
        enableSector: true,
        enableNeural,
        enableFeatureModel,
        enableRules,
        weightFeatureModel: wFeature,
        weightNeural: wNeural,
        weightRules: wRules,
        eventThresholds: {
          small: { pct: 3, days: 5 },
          medium: { pct: 5, days: 10 },
          strong: { pct: 8, days: 20 },
          explosive: { pct: 12, days: 30 }
        }
      };
      const res = await fetch('/api/loris/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: selectedSymbols, settings })
      });
      if (res.ok) {
        fetchStatus();
      }
    } catch(e) {
      if (String(e).includes("Load failed") || String(e).includes("pattern")) { /* ignore */ } else { console.error(e); }
    } finally {
      setIsTrainingLoading(false);
    }
  };

  // Process Importance data for Recharts
  const chartData = importances
    .slice(0, 10)
    .map(i => ({
      name: i.feature_name
        .replace(/_/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      importance: Number((i.importance_score * 100).toFixed(1))
    }));

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* 1. Header with Status Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Advanced Growth Loris Model</h1>
            <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">PREMIUM ALGO</span>
          </div>
          <p className="text-xs text-slate-500">
            A high-conviction deep ensemble learning system calibrated to forecast likely equity growth parameters &ge;1 day in advance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button 
            onClick={triggerTraining}
            disabled={systemStatus.isProcessing || isTrainingLoading}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> (Step 1) Run Model Teaching
          </button>
          
          <button 
            onClick={triggerDailyScan}
            disabled={systemStatus.isProcessing || isTrainingLoading}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            <Activity className="h-4 w-4" /> (Step 2) Run Market Analysis
          </button>
          
          <button 
            onClick={fetchLorisData}
            title="Refresh statistics logs"
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. WARNING DISCLAIMER ALERT HEADER */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-900 text-xs">
        <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div>
          <span className="font-bold uppercase tracking-wider">Research and Support Disclaimer:</span>
          <p className="mt-0.5 opacity-90 leading-relaxed">
            This model outputs probabilistic trends for analytical and decision support only. It operates inside a simulated walk-forward validation matrix. It does NOT guarantee future performance and is not financial advice. Preserve risk management models strictly.
          </p>
        </div>
      </div>

      {/* A. Live Training Progress Card - Prominent and Persistently Visible Global Progress Bar */}
      {systemStatus.isProcessing && (
        <div className="bg-indigo-950 text-white rounded-2xl shadow-xl p-5 border border-indigo-900 space-y-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RotateCw className="h-5 w-5 animate-spin text-emerald-400" />
              <div>
                <h3 className="font-bold text-sm">Loris Neural Ensemble Calibrating & Scanning...</h3>
                <p className="text-[10px] text-indigo-300 uppercase tracking-widest font-mono font-bold">{systemStatus.phase || 'TRAINING STAGE'}</p>
              </div>
            </div>
            <span className="text-xl font-black text-emerald-400 font-mono">{systemStatus.progress}%</span>
          </div>
          
          {/* Progress Slider Bar */}
          <div className="w-full bg-indigo-900 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-400 h-full transition-all duration-300" 
              style={{ width: `${systemStatus.progress}%` }}
            ></div>
          </div>
          
          {/* Detail Log Text */}
          <div className="flex justify-between items-center text-xs text-slate-200 mt-1">
             <span className="italic font-medium">Current task: <span className="text-white font-semibold">{systemStatus.stage}</span></span>
             <span className="text-[10px] bg-indigo-900 text-indigo-300 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono">Running</span>
          </div>
        </div>
      )}

      {/* 3. Navigation Bar Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >
          Step 1 &amp; 2: Teaching &amp; Analysis {systemStatus.isProcessing && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
        </button>
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'dashboard' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >
          Step 3: Growth Signals (Active Dashboard)
        </button>
        <button 
          onClick={() => setActiveTab('configs')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${activeTab === 'configs' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
        >
          Architecture Weights
        </button>
      </div>

      {/* 4. CONTENT SWITCHER PANEL */}
      
      {activeTab === 'dashboard' && (
        <div className="space-y-6">

          {/* B. Core Predictions Signal Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-500" /> Step 3: Ranked Growth Signals ({predictions.length})
              </h3>
              <span className="text-xs text-slate-500 font-medium">Sorted by highest conviction score for most probable growth</span>
            </div>

            {predictions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 space-y-3">
                <Activity className="h-10 w-10 mx-auto text-slate-300 animate-pulse" />
                <p className="text-sm font-medium">No Loris scans found inside predictions registry.</p>
                <p className="text-xs max-w-sm mx-auto">Please trigger the &quot;Begin Walk-Forward Training&quot; algorithm or run a fresh scan using the header actions panel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {predictions.map((p) => {
                  const scoreColor = p.score >= 85 ? 'text-emerald-600 bg-emerald-50' : p.score >= 70 ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600 bg-slate-50';
                  
                  return (
                    <div 
                      key={p.id} 
                      className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col cursor-pointer"
                      onClick={() => setSelectedSignal(p)}
                    >
                      {/* Top banner tag */}
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-lg tracking-tight">{p.symbol}</span>
                          <span className="text-[10px] bg-slate-100 border text-slate-600 px-2 py-0.5 rounded uppercase font-bold tracking-wider">{p.setup_type}</span>
                        </div>
                        <div className={`px-2.5 py-1 rounded text-xs font-black tracking-tight ${scoreColor}`}>
                          Score: {p.score.toFixed(0)}
                        </div>
                      </div>

                      <div className="p-4 flex-1 space-y-4">
                        {/* 4 Multi-Horizon Probabilities Block */}
                        <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">PROBABILISTIC FORECAST BY HORIZON</span>
                          <div className="grid grid-cols-4 gap-1 text-center">
                            <div className="border-r border-slate-200 last:border-0">
                              <span className="text-[9px] text-slate-500 block">1 Day</span>
                              <span className="text-xs font-extrabold text-slate-900">{(p.probability_1d * 100).toFixed(0)}%</span>
                            </div>
                            <div className="border-r border-slate-200 last:border-0">
                              <span className="text-[9px] text-slate-500 block">2 Days</span>
                              <span className="text-xs font-extrabold text-slate-900">{(p.probability_2d * 100).toFixed(0)}%</span>
                            </div>
                            <div className="border-r border-slate-200 last:border-0">
                              <span className="text-[9px] text-slate-500 block">3 Days</span>
                              <span className="text-xs font-extrabold text-slate-900">{(p.probability_3d * 100).toFixed(0)}%</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-500 block">1 Week</span>
                              <span className="text-xs font-extrabold text-slate-900 text-indigo-600">{(p.probability_1w * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Estimated Parameters Row */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block uppercase font-bold tracking-widest text-[9px]">Expected Gain</span>
                            <span className="font-extrabold text-emerald-600 text-sm flex items-center gap-1">
                              +{p.expected_gain_percent.toFixed(1)}% <TrendingUp className="h-3.5 w-3.5" />
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block uppercase font-bold tracking-widest text-[9px]">Expected Target</span>
                            <span className="font-black text-slate-900 text-sm">${p.expected_target_price.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Invalidation levels / Stop zone info */}
                        <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-400 block text-[9px] font-bold tracking-widest uppercase">Stop / Invalidation</span>
                            <span className="font-bold text-rose-500">${p.stop_loss_candidate.toFixed(2)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block text-[9px] font-bold tracking-widest uppercase">Risk/Reward</span>
                            <span className="font-black text-indigo-600 text-sm">{p.risk_reward_ratio ? p.risk_reward_ratio.toFixed(2) : '-'}x</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer clickable bar */}
                      <div className="p-2 border-t border-slate-100 bg-slate-50 text-indigo-600 hover:bg-indigo-50 text-xs font-semibold text-center mt-auto">
                        Explore Explanatory Machine Reasoning &rarr;
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* C. Feature Importance & Historic Events Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Feature Importance panel */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4">
              <h3 className="text-sm font-bold tracking-tight text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-500" /> Feature-Importance Split Contributions (Random Forest Nodes)
              </h3>
              
              {chartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400">
                  Feature splits logs empty. Train models to see mathematical weights.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={110} style={{ fontSize: '10px', fontWeight: 'bold' }} stroke="#64748b" />
                      <Tooltip formatter={(value) => [`${value}%`, 'Importance']} />
                      <Bar dataKey="importance" fill="#4f46e5" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index < 3 ? '#6366f1' : '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Historic Growth events logged */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col">
              <h3 className="text-sm font-bold tracking-tight text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-4">
                <Flame className="h-4 w-4 text-rose-500 animate-pulse" /> Documented Historic High-Growth Events ({growthEvents.length})
              </h3>
              
              {growthEvents.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 p-10">
                  No historical growth occurrences filed for current parameters.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-64 space-y-2 pr-1.5 scrollbar-thin">
                  {growthEvents.slice(0, 50).map((ev) => {
                    const labelColor = ev.event_strength_class === 'explosive' ? 'bg-rose-100 text-rose-800' : ev.event_strength_class === 'strong' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
                    return (
                      <div key={ev.id} className="border border-slate-100 hover:border-slate-200 hover:bg-slate-50 rounded-xl p-3 flex justify-between items-center text-xs transition">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900">{ev.symbol}</span>
                            <span className="text-[10px] text-slate-400">{ev.event_start}</span>
                          </div>
                          <p className="text-[10px] text-slate-500">
                            Move duration: <span className="font-bold text-slate-800">{ev.time_to_max} / {ev.duration_days} Days</span> Peak drawdown: <span className="font-bold text-rose-500">-{ev.max_adverse_excursion.toFixed(1)}%</span>
                          </p>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="font-extrabold text-emerald-600 text-sm">+{ev.max_gain_percent.toFixed(1)}%</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${labelColor}`}>{ev.event_strength_class}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
          </div>

        </div>
      )}

      {/* EXPLORATORY REASONING MODAL */}
      {selectedSignal && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-indigo-950 text-white">
              <div className="space-y-1">
                <span className="text-[10px] bg-emerald-500 text-slate-950 font-black tracking-widest uppercase rounded px-2 py-0.5">MACHINE REASONING MATRIX</span>
                <h3 className="font-black text-xl tracking-tight mt-1">{selectedSignal.symbol} Forecast Analysis</h3>
              </div>
              <button 
                onClick={() => setSelectedSignal(null)}
                className="p-1 text-slate-200 hover:text-white rounded hover:bg-indigo-900 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Detailed probabilities block */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Horizon Forecast Probabilities</h4>
                <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 p-3 rounded-xl border">
                  <div>
                    <span className="text-[10px] text-slate-500 block">1 Day</span>
                    <span className="text-base font-black text-slate-900">{(selectedSignal.probability_1d * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">2 Days</span>
                    <span className="text-base font-black text-slate-900">{(selectedSignal.probability_2d * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">3 Days</span>
                    <span className="text-base font-black text-slate-900">{(selectedSignal.probability_3d * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">1 Week</span>
                    <span className="text-base font-black text-indigo-600">{(selectedSignal.probability_1w * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>

              {/* Explanatory Reasons from Neural network */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-emerald-500" /> Strategic Indicators Alignment Factors
                </h4>
                <ul className="space-y-2">
                  {selectedSignal.explanation_json ? (
                    (() => {
                      try {
                        const parsed = JSON.parse(selectedSignal.explanation_json);
                        return parsed.factors?.map((f: string, idx: number) => (
                          <li key={idx} className="text-xs text-slate-700 bg-emerald-50/50 border border-emerald-100 p-2 rounded-lg leading-relaxed flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></span>
                            <span>{f}</span>
                          </li>
                        )) || 'No technical features listed.';
                      } catch(e) {
                        return <li className="text-xs">No explain details processed.</li>;
                      }
                    })()
                  ) : <li className="text-xs">No explain details processed.</li>}
                </ul>
              </div>

              {/* Warnings / Fallback limits */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4 text-amber-500 animate-bounce" /> Risk Vectors & Invalidation Notes
                </h4>
                <ul className="space-y-2">
                  {selectedSignal.explanation_json ? (
                    (() => {
                      try {
                        const parsed = JSON.parse(selectedSignal.explanation_json);
                        return parsed.warnings?.map((f: string, idx: number) => (
                          <li key={idx} className="text-xs text-slate-700 bg-amber-50/50 border border-amber-100 p-2 rounded-lg leading-relaxed flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></span>
                            <span>{f}</span>
                          </li>
                        )) || 'No risk limitations listed.';
                      } catch(e) {
                        return <li className="text-xs">No risk parameters processed.</li>;
                      }
                    })()
                  ) : <li className="text-xs">No risk parameters processed.</li>}
                </ul>
              </div>

              {/* Core numbers metrics summaries */}
              <div className="border-t pt-4 grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-400 block uppercase font-bold tracking-widest text-[9px]">Calculated Target</span>
                  <p className="font-extrabold text-slate-800 text-sm">${selectedSignal.expected_target_price.toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 block uppercase font-bold tracking-widest text-[9px]">Stop Loss Threshold</span>
                  <p className="font-extrabold text-rose-500 text-sm">${selectedSignal.stop_loss_candidate.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
              <button 
                onClick={() => setSelectedSignal(null)}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 transition shadow-sm border-slate-200 cursor-pointer"
              >
                Close Explanation Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. HISTORY AND LOGS TAB */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Model Runs lists */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-4 lg:col-span-1">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <List className="h-4 w-4 text-indigo-500" /> Walk-Forward Sandbox Runs ({modelRuns.length})
              </h3>
              <p className="text-xs text-slate-400 mb-2">Logs for Model Teaching (Step 1) and Analysis Scans (Step 2).</p>
              
              <div className="space-y-2 overflow-y-auto max-h-96 pr-2">
                {modelRuns.map((r, i) => {
                  const isRunActive = activeRunLog === r.logs;
                  return (
                    <div 
                      key={r.id}
                      onClick={() => setActiveRunLog(r.logs || '')}
                      className={`p-3 border rounded-xl cursor-pointer text-xs transition ${isRunActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:bg-slate-50 bg-white'}`}
                    >
                      <div className="flex justify-between items-center font-bold mb-1">
                        <span>Run ID: #{r.id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${r.status === 'Success' ? 'bg-emerald-100 text-emerald-800' : r.status === 'Running' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{r.status}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">{r.created_at}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Core logs output screen */}
            <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 shadow-xl space-y-3 lg:col-span-2 flex flex-col min-h-[400px]">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-500" /> Loris Quantitative Terminal Output Output
                </span>
                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono font-bold">MODE: STABILIZED</span>
              </div>
              
              <div className="flex-1 font-mono text-[10px] space-y-1.5 overflow-y-auto max-h-96 pr-2 bg-slate-950 p-3 rounded-lg leading-relaxed text-emerald-400/90 whitespace-pre-wrap select-text">
                {activeRunLog ? activeRunLog : 'No machine run selected. Start walk-forward training in upper panels.'}
                <div ref={logEndRef}></div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 6. CONFIGURATIONS TAB */}
      {activeTab === 'configs' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="space-y-1.5 border-b pb-4">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Gauge className="h-5 w-5 text-indigo-500" /> Neural Architecture Weights &amp; Dynamic Settings
            </h3>
            <p className="text-xs text-slate-400">Configure parameters used to forecast likely growth trends before triggers are started.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Ticker Selector lists */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block">ACTIVE SCANNING PORTFOLIO</span>
              
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-600 font-medium mb-3">
                  Synchronized with Scan &amp; Train Engine ({selectedSymbols.length} equities selected). Configure equities from the main dashboard.
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {selectedSymbols.map((s) => (
                    <span 
                      key={s} 
                      className="inline-block bg-indigo-50 border border-indigo-100 text-indigo-900 px-2.5 py-1 rounded-md text-[10px] font-bold select-none cursor-default"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Threshold Parameters */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block">ENCORE HORIZONS & THRESHOLDS</span>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Growth Target (%)</label>
                  <input 
                    type="number" 
                    step="0.5"
                    value={minGrowth}
                    onChange={(e) => setMinGrowth(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Horizon (Days)</label>
                  <input 
                    type="number" 
                    value={horizonDays}
                    onChange={(e) => setHorizonDays(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Min Score Required</label>
                  <input 
                    type="number" 
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold bg-white"
                  />
                </div>
              </div>
            </div>
            
          </div>

          {/* Model Weights distributions */}
          <div className="space-y-4 border-t pt-5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 block">Ensemble Layer Distribution Weights</span>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1 bg-slate-50 p-3 rounded-xl border">
                <div className="flex justify-between font-black mb-1 text-slate-800">
                  <span>Layer 1: Random Forest Classifier</span>
                  <span>{(wFeature * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" value={wFeature}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setWFeature(val);
                    setWNeural(Number((1 - val - wRules).toFixed(2)));
                  }}
                  className="w-full accent-indigo-600"
                />
                <p className="text-[9px] text-slate-400">Decision-tree optimization splits computed out-of-sample.</p>
              </div>

              <div className="space-y-1 bg-slate-50 p-3 rounded-xl border">
                <div className="flex justify-between font-black mb-1 text-slate-800">
                  <span>Layer 2: Neural Time-Series</span>
                  <span>{(wNeural * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" value={wNeural}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setWNeural(val);
                    setWFeature(Number((1 - val - wRules).toFixed(2)));
                  }}
                  className="w-full accent-indigo-600"
                />
                <p className="text-[9px] text-slate-400">Sequential indicators memory representation matrix matching.</p>
              </div>

              <div className="space-y-1 bg-slate-50 p-3 rounded-xl border">
                <div className="flex justify-between font-black mb-1 text-slate-800">
                  <span>Layer 3: Deterministic Rules</span>
                  <span>{(wRules * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" value={wRules}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setWRules(val);
                    setWNeural(Number((1 - wFeature - val).toFixed(2)));
                  }}
                  className="w-full accent-indigo-600"
                />
                <p className="text-[9px] text-slate-400">Rigid validation technical filters logic.</p>
              </div>
            </div>
            
            <div className="flex justify-end pt-2 gap-2">
              <button
                onClick={exportModels}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg px-4 py-2 text-xs transition shadow-sm border border-transparent cursor-pointer"
              >
                Export Teached Models
              </button>
              
              <label className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg px-4 py-2 text-xs transition shadow-sm border border-transparent cursor-pointer flex items-center justify-center">
                Import Models
                <input type="file" accept=".json" className="hidden" onChange={importModels} />
              </label>

              <button 
                onClick={saveSettings}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg px-5 py-2 text-xs transition shadow-sm border border-transparent cursor-pointer"
              >
                Persist Settings Configuration
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
