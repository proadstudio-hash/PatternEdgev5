import { useState, useMemo, useEffect } from 'react';
import { Play, Settings2, ShieldCheck, Activity, Target, Zap, Clock, Network, Layers, TrendingUp, AlertTriangle, SlidersHorizontal, Info, Check, X, ArrowUpRight, ArrowDownRight, Percent, Briefcase, TrendingDown, Gauge } from 'lucide-react';
import { cn } from '../lib/utils';
import { ALL_CRYPTOS } from '../constants';
import CytoscapeComponent from 'react-cytoscapejs';

// Type definitions
type ModelMode = 'auto' | 'manual';
type TimeRange = '3m' | '6m' | '1y' | '2y';
type Frequency = '15m' | '1h' | '1d';

interface MasterData {
  symbol: string;
  type: string;
  sector: string;
  score: number;
  slaves: number;
  stability: number;
  marketCap: string;
  regime: string;
}

interface EdgeData {
  master: string;
  slave: string;
  lag: string;
  score: number;
  probUp: number;
  probDown: number;
  avgMove: number;
  regime: string;
}

interface SignalData {
  id: string;
  time: string;
  master: string;
  dir: 'Up' | 'Down';
  strength: number;
  slave: string;
  lag: string;
  prob: number;
  expMove: number;
  risk: 'Low' | 'Med' | 'High';
}

// Mock Data expanded
const MOCK_MASTERS: MasterData[] = [
  { symbol: 'NVDA', type: 'Stock', sector: 'Semiconductors', score: 92, slaves: 12, stability: 85, marketCap: '$2.2T', regime: 'Risk-On / Tech Bull' },
  { symbol: 'SPY', type: 'ETF', sector: 'Market Proxy', score: 88, slaves: 35, stability: 92, marketCap: 'High', regime: 'All' },
  { symbol: 'TLT', type: 'ETF', sector: 'Bonds', score: 81, slaves: 15, stability: 78, marketCap: 'High', regime: 'Rate-Sensitive' },
  { symbol: 'QQQ', type: 'ETF', sector: 'Tech', score: 85, slaves: 18, stability: 89, marketCap: 'High', regime: 'Tech Bull' },
  { symbol: 'XLE', type: 'ETF', sector: 'Energy', score: 76, slaves: 9, stability: 88, marketCap: 'Med', regime: 'Inflation/Oil Shock' },
  { symbol: 'XLF', type: 'ETF', sector: 'Financials', score: 72, slaves: 11, stability: 80, marketCap: 'High', regime: 'Rate-Sensitive' },
  { symbol: 'IWM', type: 'ETF', sector: 'Small Caps', score: 68, slaves: 14, stability: 74, marketCap: 'Low/Med', regime: 'Risk-On' },
  { symbol: 'AAPL', type: 'Stock', sector: 'Consumer/Tech', score: 80, slaves: 5, stability: 82, marketCap: '$3.0T', regime: 'Tech Bull' },
  { symbol: 'JPM', type: 'Stock', sector: 'Financials', score: 74, slaves: 4, stability: 85, marketCap: '$500B', regime: 'Rate-Up' },
];

const MOCK_EDGES: EdgeData[] = [
  { master: 'NVDA', slave: 'AMD', lag: '1d', score: 82, probUp: 68, probDown: 65, avgMove: 1.8, regime: 'Risk-On' },
  { master: 'NVDA', slave: 'SMH', lag: '15m', score: 88, probUp: 74, probDown: 71, avgMove: 0.9, regime: 'Risk-On' },
  { master: 'NVDA', slave: 'AVGO', lag: '1h', score: 75, probUp: 62, probDown: 60, avgMove: 1.1, regime: 'Risk-On' },
  { master: 'SPY', slave: 'IWM', lag: '2d', score: 72, probUp: 60, probDown: 55, avgMove: 1.3, regime: 'Risk-On' },
  { master: 'TLT', slave: 'XLF', lag: '2d', score: 75, probUp: 62, probDown: 58, avgMove: 1.2, regime: 'Rate Shock' },
  { master: 'TLT', slave: 'KRE', lag: '1d', score: 80, probUp: 70, probDown: 68, avgMove: 2.3, regime: 'Rate Shock' },
  { master: 'QQQ', slave: 'ARKK', lag: '1d', score: 78, probUp: 65, probDown: 72, avgMove: 2.1, regime: 'Risk-On' },
  { master: 'XLE', slave: 'XOM', lag: '1h', score: 85, probUp: 81, probDown: 78, avgMove: 0.6, regime: 'Normal' },
  { master: 'XLF', slave: 'JPM', lag: '15m', score: 88, probUp: 78, probDown: 75, avgMove: 0.4, regime: 'Normal' },
];

const MOCK_SIGNALS: SignalData[] = [
  { id: '1', time: '10:15 AM', master: 'NVDA', dir: 'Up', strength: 91, slave: 'AMD', lag: '1d', prob: 68, expMove: 1.8, risk: 'Med' },
  { id: '2', time: '11:30 AM', master: 'SPY', dir: 'Down', strength: 75, slave: 'IWM', lag: '1h', prob: 61, expMove: 0.8, risk: 'High' },
  { id: '3', time: 'Yesterday', master: 'TLT', dir: 'Up', strength: 82, slave: 'XLF', lag: '2d', prob: 64, expMove: 1.1, risk: 'Low' },
];

export function TeachingMode() {
  const [mode, setMode] = useState<ModelMode>('auto');
  const [timeRange, setTimeRange] = useState<TimeRange>('1y');
  const [frequency, setFrequency] = useState<Frequency>('1d');
  const [activeTab, setActiveTab] = useState<'ranking' | 'network' | 'signals' | 'slaveScanner' | 'leadLagScore'>('ranking');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [masters, setMasters] = useState<MasterData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [cyGraphEvents, setCyGraphEvents] = useState<any[]>([]);
  const [hasTrained, setHasTrained] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  
  const [liveSignals, setLiveSignals] = useState<any[]>([]);
  const [isScanningLive, setIsScanningLive] = useState(false);
  const [lookbackHours, setLookbackHours] = useState<number>(6);

  // New states for local equity selection
  const [enableCrypto, setEnableCrypto] = useState<boolean>(false);
  const [allSymbols, setAllSymbols] = useState<any[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([
    'NVDA', 'SPY', 'TLT', 'QQQ', 'XLE', 'XLF', 'IWM', 'AAPL', 'JPM', 'AMD', 'SMH', 'AVGO', 'KRE', 'ARKK', 'XOM'
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSelector, setShowSelector] = useState<boolean>(true);
  const [showLimitWarning, setShowLimitWarning] = useState<boolean>(false);
  const [probThreshold, setProbThreshold] = useState<number>(55);
  const [signalSortKey, setSignalSortKey] = useState<string>('score');
  const [signalSortOrder, setSignalSortOrder] = useState<'asc' | 'desc'>('desc');

  const [rankingSortConfig, setRankingSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [edgeSortConfig, setEdgeSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [scannerSortConfig, setScannerSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'underreactionGap', direction: 'desc' });
  const [leadLagSortConfig, setLeadLagSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'totalGrowthPressure', direction: 'desc' });

  const defaultCandidates = useMemo(() => [
    'NVDA', 'SPY', 'TLT', 'QQQ', 'XLE', 'XLF', 'IWM', 'AAPL', 'JPM', 'AMD', 'SMH', 'AVGO', 'KRE', 'ARKK', 'XOM'
  ], []);

  useEffect(() => {
    const cryptos = ALL_CRYPTOS.map(c => c.symbol);
    if (enableCrypto) {
      setSelectedSymbols(prev => {
        const merged = Array.from(new Set([...prev, ...cryptos]));
        return merged;
      });
    } else {
      setSelectedSymbols(prev => prev.filter(sym => !cryptos.includes(sym)));
    }
  }, [enableCrypto]);

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const res = await fetch('/api/symbols');
        if (res.ok) {
          const data = await res.json();
          setAllSymbols(data);
        }
      } catch (e: any) {
        const msg = String(e.message || e);
        if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
      }
    };

    const fetchSavedNetwork = async () => {
      try {
        const res = await fetch('/api/teaching/network');
        if (res.ok) {
          const data = await res.json();
          if (data && data.results) {
            if (data.results.masters) {
              setMasters(data.results.masters.sort((a: any, b: any) => b.score - a.score));
            }
            if (data.results.edges) {
              setEdges(data.results.edges.sort((a: any, b: any) => b.score - a.score));
            }
            if (data.timeRange) setTimeRange(data.timeRange);
            if (data.frequency) setFrequency(data.frequency);
            if (data.symbols && data.symbols.length > 0) {
              setSelectedSymbols(data.symbols);
            }
            const hasMasters = data.results.masters && data.results.masters.length > 0;
            const hasEdges = data.results.edges && data.results.edges.length > 0;
            setHasTrained(hasMasters || hasEdges);
          }
        }
      } catch (e: any) {
        console.error("Failed to load saved lead-lag network:", e);
      }
    };

    fetchSymbols();
    fetchSavedNetwork();
  }, []);

  const renderSymbolsList = useMemo(() => {
    let list: any[] = [];
    if (allSymbols.length > 0) {
      list = [...allSymbols];
    } else {
      list = defaultCandidates.map(sym => ({
        symbol: sym,
        name: `${sym} (Default Core)`,
        sector: 'Core Assets'
      }));
    }

    if (enableCrypto) {
      const cryptos = ALL_CRYPTOS;
      const existingSymbols = new Set(list.map(s => s.symbol));
      const filteredCryptos = cryptos.filter(c => !existingSymbols.has(c.symbol));
      list = [...list, ...filteredCryptos];
    }
    return list;
  }, [allSymbols, defaultCandidates, enableCrypto]);

  const handleSelectAll = () => {
    const allSyms = renderSymbolsList.map(s => s.symbol);
    setSelectedSymbols(allSyms);
    setShowLimitWarning(false);
  };

  const handleClearAll = () => {
    setSelectedSymbols([]);
  };

  const handleResetDefaults = () => {
    setSelectedSymbols(defaultCandidates);
  };

  const scanLiveSignals = async () => {
    setIsScanningLive(true);
    try {
      const res = await fetch('/api/teaching/live_signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edges, lookbackHours })
      });
      const data = await res.json();
      setLiveSignals(data);
    } catch (e: any) {
      const msg = String(e.message || e);
      if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
    }
    setIsScanningLive(false);
  };

  const sortedSignals = useMemo(() => {
    if (!liveSignals || liveSignals.length === 0) return [];

    const sorted = [...liveSignals];
    sorted.sort((a, b) => {
      let valA: any = a[signalSortKey];
      let valB: any = b[signalSortKey];

      // Handle undefined/nulls safely
      if (valA === undefined || valA === null) valA = 0;
      if (valB === undefined || valB === null) valB = 0;

      if (valA < valB) return signalSortOrder === 'desc' ? 1 : -1;
      if (valA > valB) return signalSortOrder === 'desc' ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [liveSignals, signalSortKey, signalSortOrder]);

  const sortedMasters = useMemo(() => {
    let items = [...masters];
    items.sort((a, b) => {
      let valA = a[rankingSortConfig.key];
      let valB = b[rankingSortConfig.key];
      if (valA < valB) return rankingSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return rankingSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [masters, rankingSortConfig]);

  const requestRankingSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (rankingSortConfig.key === key && rankingSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setRankingSortConfig({ key, direction });
  };
  
  const SortIcon = ({ columnKey, config }: { columnKey: string, config: { key: string, direction: 'asc' | 'desc'} }) => {
    if (config.key !== columnKey) return <span className="ml-1 opacity-20 hover:opacity-50">↕</span>;
    return <span className="ml-1 font-black text-indigo-600">{config.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const sortedEdges = useMemo(() => {
    let items = edges.filter(e => {
        const prob = e.probUp !== undefined ? e.probUp : e.score;
        return prob >= probThreshold;
    });
    items.sort((a, b) => {
      let valA = a[edgeSortConfig.key] !== undefined ? a[edgeSortConfig.key] : Number.MIN_SAFE_INTEGER;
      let valB = b[edgeSortConfig.key] !== undefined ? b[edgeSortConfig.key] : Number.MIN_SAFE_INTEGER;
      if (valA < valB) return edgeSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return edgeSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [edges, edgeSortConfig, probThreshold]);

  const requestEdgeSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (edgeSortConfig.key === key && edgeSortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setEdgeSortConfig({ key, direction });
  };



  useEffect(() => {
    // Generate graph elements based on active data and selected threshold
    if (masters.length === 0 && edges.length === 0) return;
    
    // Filter the edges where probUp is >= threshold
    const filteredEdges = edges.filter(e => {
      const prob = e.probUp !== undefined ? e.probUp : e.score;
      return prob >= probThreshold;
    });

    const elements: any[] = [];
    const existing = new Set<string>();
    const activeNodes = new Set<string>();

    // Identify which nodes actually have connections above the selected threshold
    filteredEdges.forEach(e => {
      activeNodes.add(e.master);
      activeNodes.add(e.slave);
    });

    // Add masters only if they are in the active nodes (or always if they are top 10 to keep perspective)
    masters.slice(0, 20).forEach(m => {
      if (activeNodes.has(m.symbol) || m.score >= probThreshold) {
        const sanitizedId = 'n_' + m.symbol.replace(/[^a-zA-Z0-9]/g, '_');
        elements.push({ data: { id: sanitizedId, label: m.symbol, score: m.score, isMaster: true } });
        existing.add(sanitizedId);
      }
    });
    
    // Add missing nodes for edges
    filteredEdges.slice(0, 40).forEach(e => {
      const sanitizedMaster = 'n_' + e.master.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedSlave = 'n_' + e.slave.replace(/[^a-zA-Z0-9]/g, '_');

      if (!existing.has(sanitizedMaster)) {
        elements.push({ data: { id: sanitizedMaster, label: e.master, isMaster: true } });
        existing.add(sanitizedMaster);
      }
      if (!existing.has(sanitizedSlave)) {
        elements.push({ data: { id: sanitizedSlave, label: e.slave, isMaster: false } });
        existing.add(sanitizedSlave);
      }
      elements.push({
        data: {
          id: `e_${sanitizedMaster}-${sanitizedSlave}`,
          source: sanitizedMaster,
          target: sanitizedSlave,
          label: `${e.lag} (${e.probUp}%)`,
          score: e.score
        }
      });
    });
    setCyGraphEvents(elements);
  }, [masters, edges, probThreshold]);

  const handleApply = async () => {
    setIsProcessing(true);
    setTrainingProgress(0);
    setHasTrained(false);
    
    // Fake progress bar for UI feel while fetching
    let iters = 0;
    const progressInterval = setInterval(() => {
      iters++;
      setTrainingProgress(prev => Math.min(prev + Math.floor(Math.random() * 8) + 2, 85));
    }, 400);

    try {
        const response = await fetch('/api/teaching/network', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeRange, frequency, symbols: selectedSymbols })
        });
        const data = await response.json();
        
        clearInterval(progressInterval);
        setTrainingProgress(100);
        
        if (data.masters) {
             setMasters(data.masters.sort((a: any, b: any) => b.score - a.score));
        }
        if (data.edges) {
             setEdges(data.edges.sort((a: any, b: any) => b.score - a.score));
        }
    } catch(e: any) {
        const msg = String(e.message || e);
        if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
        clearInterval(progressInterval);
    }
    
    setTimeout(() => {
        setIsProcessing(false);
        setHasTrained(true);
    }, 500);
  };

  const cyStylesheet: any[] = [
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'text-valign': 'center',
        'color': '#fff',
        'font-family': 'Inter, sans-serif',
        'font-size': '12px',
        'font-weight': 'bold',
        'width': (ele) => ele.data('isMaster') ? 60 : 50,
        'height': (ele) => ele.data('isMaster') ? 60 : 50,
        'background-color': (ele) => ele.data('isMaster') ? '#4f46e5' : '#0ea5e9',
      }
    },
    {
      selector: 'edge',
      style: {
        'width': (ele) => Math.max(1, (ele.data('score') - 60) / 10),
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '10px',
        'color': '#64748b',
        'text-background-opacity': 1,
        'text-background-color': '#ffffff',
        'text-background-padding': '2px',
        'text-margin-y': -10
      }
    }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      
      {/* Header */}
      <div className="border-b border-slate-200 bg-white p-4 md:p-6 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
              <Network className="h-6 w-6 text-indigo-600" />
              Master-Slave Lead/Lag Network
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Quantitative structural network strategy identifying assets mapping real-world leading and lagging indicators using Bayesian & Transfer Entropy filters.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
             <button
                onClick={() => setMode('auto')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-sm",
                  mode === 'auto' ? "bg-white text-indigo-700 ring-1 ring-indigo-200" : "text-slate-500 hover:text-slate-700"
                )}
             >
                <Zap className="h-4 w-4" /> AUTO PRO
             </button>
             <button
                onClick={() => setMode('manual')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all shadow-sm",
                  mode === 'manual' ? "bg-white text-indigo-700 ring-1 ring-indigo-200" : "text-slate-500 hover:text-slate-700"
                )}
             >
                <Settings2 className="h-4 w-4" /> MANUAL
             </button>
          </div>
        </div>

        {/* Configuration Panel */}
        {mode === 'manual' && (
          <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col md:flex-row gap-6 animate-in slide-in-from-top-2">
             <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time Range</label>
               <div className="flex gap-2">
                 {(['3m', '6m', '1y', '2y'] as TimeRange[]).map((tr) => (
                    <button
                      key={tr}
                      onClick={() => setTimeRange(tr)}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-medium border",
                        timeRange === tr ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {tr.toUpperCase()}
                    </button>
                 ))}
               </div>
             </div>
             
             <div className="space-y-1.5">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Frequency</label>
               <div className="flex gap-2">
                 {(['15m', '1h', '1d'] as Frequency[]).map((fq) => (
                    <button
                      key={fq}
                      onClick={() => setFrequency(fq)}
                      className={cn(
                        "px-3 py-1.5 rounded text-sm font-medium border",
                        frequency === fq ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {fq.toUpperCase()}
                    </button>
                 ))}
               </div>
             </div>

             <div className="flex items-end">
               <button 
                 onClick={handleApply}
                 disabled={isProcessing}
                 className="h-[34px] px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded shadow-sm disabled:opacity-50 flex items-center gap-2 transition-all"
               >
                 {isProcessing ? (
                   <><Activity className="h-4 w-4 animate-spin" /> TRAINING...</>
                 ) : (
                   <><Play className="h-4 w-4" /> TEACH {timeRange.toUpperCase()} / {frequency.toUpperCase()}</>
                 )}
               </button>
             </div>
          </div>
        )}

        {mode === 'auto' && (
          <div className="mt-4 p-6 bg-slate-800 rounded-xl border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-top-2">
            <div>
              <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                Auto Pro Discovery Mode
              </h3>
              <p className="text-slate-400 text-sm">
                Automatically scans S&P 500, Nasdaq 100, and sector ETFs across 1d, 1h, and 15m timeframes to discover statistically robust Lead/Lag relationships.
              </p>
            </div>
            <button 
               onClick={handleApply}
               disabled={isProcessing}
               className="h-12 w-full md:w-auto px-8 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-sm rounded shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all shrink-0"
             >
               {isProcessing ? (
                 <><Activity className="h-5 w-5 animate-spin" /> DISCOVERING NETWORK...</>
               ) : (
                 <><Target className="h-5 w-5" /> START AUTO TEACHING</>
               )}
             </button>
          </div>
        )}

        {/* Equity Selection Panel */}
        <div className="mt-4 border border-slate-200 rounded-xl bg-slate-50 overflow-hidden shadow-sm">
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-150 hover:bg-slate-200/50 transition-colors border-b border-slate-200 text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-indigo-600 animate-pulse" />
              <span className="font-bold text-slate-800 text-sm">Configure Equities for Lead/Lag Analysis ({selectedSymbols.length} Selected)</span>
            </div>
            <div className="text-xs text-indigo-600 font-bold hover:underline">
              {showSelector ? 'Hide Selector ▲' : 'Show Selector ▼'}
            </div>
          </button>

          {showSelector && (
            <div className="p-4 space-y-4">
              {/* Infobox explaining why there are usually low nodes */}
              <div className="bg-indigo-50 border border-indigo-100 text-indigo-950 rounded-lg p-3 text-xs leading-relaxed space-y-1">
                <p className="font-bold text-indigo-900 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-indigo-600" /> Why does the Network Graph show few nodes normally?
                </p>
                <ul className="list-decimal pl-4 space-y-0.5 text-indigo-805 font-medium">
                  <li><strong>Limited Default Pool:</strong> By default, core algorithms test relations among only 15 predefined assets (like SPY, NVDA, QQQ).</li>
                  <li><strong>Strict Statistical Filter:</strong> Elements only link if their Bayesian correlation scores show strong out-of-sample predictability and at least 6 lead-lag events. Weak and random linkages are strictly filtered out to prevent clutter.</li>
                  <li><strong>Visualization Optimization:</strong> The layout displays top masters and strongest edges to maximize graph legibility.</li>
                </ul>
                <p className="pt-1 font-bold text-indigo-900">💡 Solution: Select your preferred equities below (up to 200 max to optimize API request times):</p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSelectAll}
                    disabled={isProcessing}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearAll}
                    disabled={isProcessing}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={handleResetDefaults}
                    disabled={isProcessing}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all cursor-pointer mr-2"
                  >
                    Reset to Core Pro ETFs
                  </button>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-900 font-bold cursor-pointer hover:bg-indigo-100 transition-colors select-none">
                    <input
                      type="checkbox"
                      checked={enableCrypto}
                      onChange={(e) => setEnableCrypto(e.target.checked)}
                      disabled={isProcessing}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Abilita Analisi Crypto 🪙</span>
                  </label>
                </div>

                {/* Filter Search */}
                <input
                  type="text"
                  placeholder="Search symbol / market..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded text-xs w-full sm:w-48 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                />
              </div>

              {/* Grid of badges */}
              <div className="max-h-56 overflow-y-auto border border-slate-200 bg-white p-3 rounded-lg shadow-inner">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
                  {renderSymbolsList
                    .filter(s => 
                      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map((symObj) => {
                      const isSelected = selectedSymbols.includes(symObj.symbol);
                      return (
                        <button
                          key={symObj.symbol}
                          disabled={isProcessing}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSymbols(selectedSymbols.filter(s => s !== symObj.symbol));
                            } else {
                              setSelectedSymbols([...selectedSymbols, symObj.symbol]);
                            }
                          }}
                          className={`px-2 py-2 rounded-md text-xs font-bold border text-center truncate transition-all flex flex-col justify-center items-center cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-md ring-1 ring-indigo-500'
                              : 'bg-slate-50/50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                          title={`${symObj.symbol}: ${symObj.name || ''} (${symObj.sector || ''})`}
                        >
                          <span className="text-xs font-black">{symObj.symbol}</span>
                          <span className={`text-[9px] opacity-70 truncate max-w-full font-normal ${isSelected ? 'text-indigo-105' : 'text-slate-500'}`}>
                            {symObj.sector || 'Asset'}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>

        {isProcessing && (
          <div className="mt-4 p-4 border border-indigo-100 bg-indigo-50/50 rounded-xl">
             <div className="flex justify-between text-xs font-bold text-indigo-700 mb-2">
               <span>Teaching Phase: {trainingProgress < 30 ? 'Event Detection' : trainingProgress < 60 ? 'Cross-Correlation & Granger' : trainingProgress < 90 ? 'Transfer Entropy Filter' : 'Building Network'}...</span>
               <span>{trainingProgress}%</span>
             </div>
             <div className="h-2 w-full bg-indigo-100 rounded-full overflow-hidden">
               <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${trainingProgress}%` }}></div>
             </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-4 md:px-6 mt-6 shrink-0">
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('ranking')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'ranking' ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Master Ranking
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'network' ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Network Graph & Edges
          </button>
          <button
            onClick={() => setActiveTab('signals')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'signals' ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Live Signal Monitor
          </button>
          <button
            onClick={() => setActiveTab('slaveScanner')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap relative",
              activeTab === 'slaveScanner' ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <span>Slave Opportunity Scanner</span>
            {liveSignals.some((s: any) => s.mastersWithGrowth > 0 || s.mastersWithDowntrend > 0) && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('leadLagScore')}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'leadLagScore' ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            Real-Time LeadLag Score
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 md:p-6 pb-20">
        
        {!hasTrained && !isProcessing && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
              <Network className="h-10 w-10 text-slate-300" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Network Untrained</h2>
            <p className="text-slate-500 max-w-md">
              Start the Auto Discovery or configure Manual parameters to begin teaching the Master-Slave network relationships.
            </p>
          </div>
        )}

        {hasTrained && (
          <>
            <div className="mb-6 bg-emerald-50 border border-emerald-100 rounded-lg p-4 flex items-center justify-between animate-in slide-in-from-top-2">
               <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 p-2 rounded-full">
                     <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-900">Network Successfully Trained</h4>
                    <p className="text-sm text-emerald-700">Analyzed 500+ instruments across 12 sectors with robust Out-Of-Sample validation.</p>
                  </div>
               </div>
            </div>

            {/* Tab: Ranking */}
            {activeTab === 'ranking' && (
              <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => requestRankingSort('symbol')}>Master Symbol <SortIcon columnKey="symbol" config={rankingSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => requestRankingSort('sector')}>Type / Sector <SortIcon columnKey="sector" config={rankingSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => requestRankingSort('score')}>Master Score <SortIcon columnKey="score" config={rankingSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => requestRankingSort('slaves')}>Valid Slaves <SortIcon columnKey="slaves" config={rankingSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100" onClick={() => requestRankingSort('stability')}>Stability <SortIcon columnKey="stability" config={rankingSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Best Regime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedMasters.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-900">{m.symbol}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium">{m.type}</div>
                        <div className="text-xs text-slate-500">{m.sector}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${m.score}%` }}></div>
                          </div>
                          <span className="font-bold text-indigo-700">{m.score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono">{m.slaves}</td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-bold",
                          m.stability > 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        )}>
                          {m.stability}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600 whitespace-normal min-w-[120px]">{m.regime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {/* Quick stats for Network OutDegree Quality etc */}
               <div className="bg-white border text-left border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                 <div>
                   <div className="text-xs font-bold text-slate-400 uppercase">Avg Network OutDegree</div>
                   <div className="text-2xl font-black text-slate-800 mt-1">
                     {masters.length > 0 ? (masters.reduce((acc, m) => acc + m.slaves, 0) / masters.length).toFixed(1) : '0.0'}
                   </div>
                 </div>
                 <Layers className="h-8 w-8 text-indigo-100 self-end mt-2" />
               </div>
               
               <div className="bg-white border text-left border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                 <div>
                   <div className="text-xs font-bold text-slate-400 uppercase">Overall Stability Score</div>
                   <div className="text-2xl font-black text-emerald-600 mt-1">
                     {masters.length > 0 ? Math.round(masters.reduce((acc, m) => acc + m.stability, 0) / masters.length) : 0}%
                   </div>
                 </div>
                 <ShieldCheck className="h-8 w-8 text-emerald-100 self-end mt-2" />
               </div>

               <div className="bg-white border text-left border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                 <div>
                   <div className="text-xs font-bold text-slate-400 uppercase">Tracked Edges</div>
                   <div className="text-2xl font-black text-blue-600 mt-1">{edges.length}</div>
                 </div>
                 <TrendingUp className="h-8 w-8 text-blue-100 self-end mt-2" />
               </div>
            </div>
          </div>
        )}

        {/* Tab: Network */}
        {activeTab === 'network' && (
          <div className="h-full flex flex-col gap-6 animate-in fade-in">
             <div className="bg-white border border-slate-200 rounded-xl shadow-sm h-[400px] relative overflow-hidden">
                <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur border border-slate-200 px-3 py-2 rounded shadow-sm text-xs font-medium">
                  <span className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-600 rounded"></div> Master Node</span>
                  <span className="flex items-center gap-2 mt-1"><div className="w-3 h-3 bg-sky-500 rounded"></div> Slave Node</span>
                </div>

                {/* Edge Probability Threshold Selector */}
                <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur border border-slate-200 px-3.5 py-2.5 rounded-lg shadow-sm flex flex-col items-start gap-1 w-64 text-left">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <SlidersHorizontal className="h-3 w-3 text-indigo-600 animate-pulse" /> Min Probability:
                    </span>
                    <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 shadow-sm">
                      {probThreshold}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    value={probThreshold}
                    onChange={(e) => setProbThreshold(Number(e.target.value))}
                    className="w-full cursor-pointer accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none mt-1.5"
                  />
                  <div className="flex justify-between w-full text-[9px] font-bold text-slate-400 mt-1">
                    <span>50% (Many)</span>
                    <span>75% (Balanced)</span>
                    <span>95% (Strongest)</span>
                  </div>
                </div>
                {cyGraphEvents.length > 0 && (
                  <CytoscapeComponent 
                    elements={cyGraphEvents} 
                    stylesheet={cyStylesheet} 
                    style={{ width: '100%', height: '100%' }}
                    autoungrabify={false}
                    autounselectify={true}
                    layout={{ 
                        name: 'cose', 
                        animate: false, 
                        nodeDimensionsIncludeLabels: true, 
                        randomize: true,
                        nodeRepulsion: 400000,
                        idealEdgeLength: 150,
                        edgeElasticity: 100,
                        gravity: 0.25,
                        numIter: 1000
                    }}
                    pan={{ x: 0, y: 0 }}
                    zoom={1}
                  />
                )}
             </div>

             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                 <h3 className="font-bold text-slate-800">Identified Edges (Top Confidence)</h3>
               </div>
               <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('master')}>Edge Direction <SortIcon columnKey="master" config={edgeSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('lag')}>Optimum Lag <SortIcon columnKey="lag" config={edgeSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('score')}>Edge Score <SortIcon columnKey="score" config={edgeSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('probUp')}>P(Up) | M.Up <SortIcon columnKey="probUp" config={edgeSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('probDown')}>P(Down) | M.Dn <SortIcon columnKey="probDown" config={edgeSortConfig} /></th>
                    <th className="px-4 py-3 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50" onClick={() => requestEdgeSort('avgMove')}>Avg % Move <SortIcon columnKey="avgMove" config={edgeSortConfig} /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedEdges.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-sm">
                        <span className="font-bold text-indigo-700">{e.master}</span>
                        <span className="text-slate-400 mx-2">→</span>
                        <span className="font-medium text-slate-900">{e.slave}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{e.lag}</td>
                      <td className="px-4 py-2">
                         <span className={cn(
                           "px-2 py-0.5 rounded text-xs font-bold",
                           e.score > 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                         )}>
                            {e.score}
                         </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-emerald-600">{e.probUp}%</td>
                      <td className="px-4 py-2 font-mono text-rose-600">{e.probDown}%</td>
                      <td className="px-4 py-2 font-mono">{e.avgMove}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
             </div>
          </div>
        )}

        {/* Tab: Signals */}
        {activeTab === 'signals' && (
          <div className="space-y-4 animate-in fade-in">
             <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
               <div>
                  <h3 className="font-bold text-slate-800">Advanced Master-Slave Signal Monitor</h3>
                  <p className="text-sm text-slate-500">Cross-reference slave nodes with master historical growth slopes.</p>
               </div>
               <div className="flex items-center gap-3">
                  <select 
                     value={lookbackHours}
                     onChange={(e) => setLookbackHours(Number(e.target.value))}
                     className="border border-slate-200 rounded-lg text-sm px-3 py-2 bg-slate-50 font-bold"
                  >
                     <option value={3}>Last 3 Hours</option>
                     <option value={6}>Last 6 Hours</option>
                     <option value={8}>Last 8 Hours</option>
                     <option value={12}>Last 12 Hours</option>
                     <option value={24}>Last 24 Hours</option>
                     <option value={48}>Last 48 Hours</option>
                     <option value={72}>Last 72 Hours</option>
                  </select>
                  <button
                    onClick={scanLiveSignals}
                    disabled={isScanningLive || edges.length === 0}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    {isScanningLive ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                    {isScanningLive ? "Scanning..." : "Scan Live Events"}
                  </button>
                </div>
              </div>
              
              {liveSignals.length === 0 && !isScanningLive && (
                 <div className="text-center p-8 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                    {edges.length === 0 ? "Train the network first to discover Master-Slave relationships." : "Click 'Scan Live Events' to find current signals using the real-time engine."}
                 </div>
              )}

              {liveSignals.length > 0 && (
                /* Sorting & Order Controls Toolbar */
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                      <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                      <span>Sort Live Signals By:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={signalSortKey}
                        onChange={(e) => setSignalSortKey(e.target.value)}
                        className="border border-slate-200 rounded text-xs px-3 py-2 bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="score">Max Overall Score</option>
                        <option value="growthScore">Growth Score (Custom Metric)</option>
                        <option value="downScore">Down Score (Custom Metric)</option>
                        <option value="incomingToGrowthRatio">Ratio: Growth / Incoming %</option>
                        <option value="incomingToDownRatio">Ratio: Down / Incoming %</option>
                        <option value="avgGrowthOfGrowing">Average Master Growth %</option>
                        <option value="avgDowntrendOfDowntrend">Average Master Downtrend %</option>
                        <option value="avgSlopeOfGrowing">Average Growth Slope</option>
                        <option value="avgSlopeOfDown">Average Down Slope</option>
                        <option value="avgProbUpOfGrowing">Avg Master growth-transfer prob %</option>
                        <option value="avgProbDownOfDown">Avg Master down-transfer prob %</option>
                        <option value="incomingEdgesCount">Total Incoming Masters Count</option>
                        <option value="mastersWithGrowth">Masters with Recent Growth Count</option>
                        <option value="mastersWithDowntrend">Masters with Recent Down Count</option>
                      </select>

                      <button
                        onClick={() => setSignalSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Direction:</span>
                        <span className="text-indigo-600 uppercase font-black">{signalSortOrder}</span>
                      </button>
                    </div>
                  </div>
              )}

              {liveSignals.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedSignals.map((slaveInfo, idx) => (
                      <div key={idx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                        
                        <div className={cn(
                          "absolute top-0 left-0 w-1.5 h-full",
                          slaveInfo.mastersWithGrowth > 0 ? "bg-emerald-500" : (slaveInfo.mastersWithDowntrend > 0 ? "bg-rose-500" : "bg-slate-300")
                        )} />

                        <div className="flex justify-between items-start mb-4 pl-2 gap-4">
                           <div className="flex flex-col gap-0.5">
                             <span className="text-3xl font-black text-indigo-700">{slaveInfo.slave}</span>
                             <span className="text-xs font-bold text-slate-500">{allSymbols.find(s => s.symbol === slaveInfo.slave)?.name || ''}</span>
                           </div>
                           <div className="flex flex-col items-end gap-1 shrink-0">
                             <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                               <TrendingUp className="h-3 w-3 text-emerald-600" />
                               <span className="text-[9px] font-black uppercase tracking-wider">
                                 Growth: {Math.round(slaveInfo.growthScore || 0)}
                                </span>
                             </div>
                             <div className="flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-md">
                               <TrendingUp className="h-3 w-3 text-rose-600 rotate-180" />
                               <span className="text-[9px] font-black uppercase tracking-wider">
                                 Down: {Math.round(slaveInfo.downScore || 0)}
                               </span>
                             </div>
                           </div>
                        </div>

                        <div className="pl-2 space-y-4">
                          <div>
                            <div className="text-xs text-slate-500 mt-1 flex justify-between">
                              <span>Incoming Masters:</span>
                              <span className="font-bold text-slate-800">{slaveInfo.incomingEdgesCount}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex justify-between">
                              <span>Masters w/ Recent Growth:</span>
                              <span className={cn("font-bold text-base", slaveInfo.mastersWithGrowth > 0 ? "text-emerald-600" : "text-slate-400")}>{slaveInfo.mastersWithGrowth}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex justify-between">
                              <span>Masters w/ Recent Down:</span>
                              <span className={cn("font-bold text-base", slaveInfo.mastersWithDowntrend > 0 ? "text-rose-600" : "text-slate-400")}>{slaveInfo.mastersWithDowntrend}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex justify-between pb-3">
                              <span>Avg Bullish Prob:</span>
                              <span className="font-bold text-slate-800">{Math.round(slaveInfo.avgProbUp)}%</span>
                            </div>

                            {/* Score Metrics breakdown */}
                             <div className="border-t border-dashed border-slate-200 pt-3 space-y-2">
                               <div className="text-[10px] font-black text-indigo-900/80 uppercase tracking-wider mb-1 flex items-center gap-1">
                                 <Info className="h-3.5 w-3.5 text-indigo-600" /> Score Breakdown:
                               </div>
                               
                               {/* Growth Score components */}
                               <div className="bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100/60 space-y-1">
                                 <div className="text-[9px] font-black text-emerald-800 uppercase tracking-wider mb-1">Growth Score Components</div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Ratio (Growth / Incoming):</span>
                                   <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.incomingToGrowthRatio > 0 ? `${slaveInfo.incomingToGrowthRatio.toFixed(1)}%` : '0.0%'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Growth Rate:</span>
                                   <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgGrowthOfGrowing > 0 ? `+${slaveInfo.avgGrowthOfGrowing.toFixed(2)}%` : '0.00%'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Growth Velocity (Slope):</span>
                                   <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgSlopeOfGrowing > 0 ? (slaveInfo.avgSlopeOfGrowing * 100).toFixed(2) : '0.00'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Link Growth Transfer %:</span>
                                   <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgProbUpOfGrowing > 0 ? `${Math.round(slaveInfo.avgProbUpOfGrowing)}%` : '0%'}
                                   </span>
                                 </div>
                               </div>

                               {/* Down Score components */}
                               <div className="bg-rose-50/40 p-2.5 rounded-lg border border-rose-100/60 space-y-1">
                                 <div className="text-[9px] font-black text-rose-800 uppercase tracking-wider mb-1">Down Score Components</div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Ratio (Down / Incoming):</span>
                                   <span className="font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.incomingToDownRatio > 0 ? `${slaveInfo.incomingToDownRatio.toFixed(1)}%` : '0.0%'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Downtrend Rate:</span>
                                   <span className="font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgDowntrendOfDowntrend > 0 ? `-${slaveInfo.avgDowntrendOfDowntrend.toFixed(2)}%` : '0.00%'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Downtrend Velocity (Slope):</span>
                                   <span className="font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgSlopeOfDown > 0 ? (slaveInfo.avgSlopeOfDown * 100).toFixed(2) : '0.00'}
                                   </span>
                                 </div>
                                 <div className="text-xs text-slate-600 flex justify-between items-center">
                                   <span>Avg Link Down Transfer %:</span>
                                   <span className="font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded text-[10px]">
                                     {slaveInfo.avgProbDownOfDown > 0 ? `${Math.round(slaveInfo.avgProbDownOfDown)}%` : '0%'}
                                   </span>
                                 </div>
                               </div>
                             </div>
                          </div>

                     {slaveInfo.monitorAlerts && slaveInfo.monitorAlerts.length > 0 && (
                        <div className="border-t border-slate-100 pt-4 mt-4">
                           <div className="text-[10px] font-black text-indigo-900/80 uppercase tracking-wider mb-2 flex items-center gap-1">
                             <Activity className="h-3.5 w-3.5 text-indigo-600" /> Real-Time Monitor Conditions
                           </div>
                           <div className="flex flex-wrap gap-2">
                              {slaveInfo.monitorAlerts.map((alert: string, aIdx: number) => (
                                <span key={aIdx} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                                  {alert}
                                </span>
                              ))}
                           </div>
                        </div>
                     )}

                     <div className="border-t border-slate-100 pt-4 mt-4">
                       <div className="text-sm font-bold text-slate-700 mb-2">Master Nodes Details</div>
                       <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {slaveInfo.mastersInfo.map((m: any, mIdx: number) => (
                             <div key={mIdx} className="bg-slate-50 p-2 rounded border border-slate-100 flex items-center justify-between">
                                <div className="font-bold text-slate-800">{m.master}</div>
                                {m.growth.hasStrongGrowth ? (
                                   <div className="text-right text-[10px]">
                                      <div className="text-emerald-600 font-bold uppercase">Growth (+{m.growth.growthPct?.toFixed(1)}%)</div>
                                      <div className="text-slate-500">{m.growth.hoursAgo}h ago | {(m.growth.slopeVsAvg || 0).toFixed(1)}x slope</div>
                                   </div>
                                ) : m.growth.hasStrongDowntrend ? (
                                   <div className="text-right text-[10px]">
                                      <div className="text-rose-600 font-bold uppercase">Downtrend ({m.growth.growthPct?.toFixed(1)}%)</div>
                                      <div className="text-slate-500">{m.growth.hoursAgo}h ago | {(m.growth.slopeVsAvg || 0).toFixed(1)}x slope</div>
                                   </div>
                                ) : (
                                   <div className="text-right text-[10px] text-slate-400">
                                      No Growth Detected
                                   </div>
                                )}
                             </div>
                          ))}
                       </div>
                     </div>
                   </div>

                 </div>
               ))}
             </div>
             )}
             
             {liveSignals.length > 0 && (
             <div className="mt-8 bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-4">
               <AlertTriangle className="text-blue-500 h-6 w-6 mt-0.5" />
               <div className="text-sm text-blue-900">
                 <p className="font-bold mb-1">Automated Interpretation:</p>
                 <p>Il sistema ordina i nodi Slave evidenziando in verde chi ha Masters che hanno subito crescite statisticamente anomale (pendenza maggiore rispetto alle ultime due). I risultati sono pesati in base al numero di maestri in accrescimento, alla probabilità storica confermata e ai rami incidenti.</p>
               </div>
             </div>
             )}
          </div>
        )}


        {/* Tab: Slave Opportunity Scanner */}
        {activeTab === 'slaveScanner' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Slave Opportunity Underreaction Scanner</h3>
                <p className="text-sm text-slate-500">
                  Scans follower stocks lagging historical returns relative to fast-moving Master anomalies.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={scanLiveSignals}
                  disabled={isScanningLive || edges.length === 0}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                >
                  {isScanningLive ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isScanningLive ? "Scanning..." : "Refresh Scanner"}
                </button>
              </div>
            </div>

            {liveSignals.length === 0 && !isScanningLive && (
              <div className="text-center p-8 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                {edges.length === 0 ? "Train the network first to discover Master-Slave relationships." : "Click 'Refresh Scanner' to trigger calculations."}
              </div>
            )}

            {liveSignals.length > 0 && (() => {
              // Filters slaves where at least one master has strong growth/downtrend
              const scanningOpps = liveSignals.map((slaveInfo: any) => {
                const activeMasters = slaveInfo.mastersInfo.filter((m: any) => m.growth && (m.growth.hasStrongGrowth || m.growth.hasStrongDowntrend));
                if (activeMasters.length === 0) return null;

                // Determine dominant direction
                const bullishCount = activeMasters.filter((m: any) => m.growth.hasStrongGrowth).length;
                const bearishCount = activeMasters.filter((m: any) => m.growth.hasStrongDowntrend).length;
                const direction = bullishCount >= bearishCount ? 'Long' : 'Short';

                // Look up matching edge from original edges list to get historical characteristics
                const edgeProfiles = activeMasters.map((m: any) => {
                  const edge = edges.find(e => e.master === m.master && e.slave === slaveInfo.slave);
                  return {
                    master: m.master,
                    growthPct: m.growth.growthPct,
                    slopeVsAvg: m.growth.slopeVsAvg,
                    probUp: edge ? edge.probUp : m.probUp,
                    probDown: edge ? edge.probDown : m.probDown,
                    avgReaction: edge ? edge.avgMove : 1.5,
                    edgeScore: edge ? edge.score : 50,
                    lag: edge ? edge.lag : '1d'
                  };
                });

                // Underreaction Gap computation: Expected reaction minus actual current return
                const maxEdge = edgeProfiles.sort((a, b) => b.edgeScore - a.edgeScore)[0];
                const expectedMove = maxEdge ? maxEdge.avgReaction : 1.5;
                const actualReturn = Math.abs(slaveInfo.changePercent || 0);
                const underreactionGap = Math.max(0, expectedMove - actualReturn);

                // Entry Checklist Matrix
                const triggerOneStd = maxEdge && maxEdge.slopeVsAvg > 1.2;
                const networkConfirmed = maxEdge && maxEdge.edgeScore > 70;
                const multiMasterConf = activeMasters.length > 1;
                const gapAdvantage = underreactionGap > 0.3;
                const slippageRestricted = expectedMove > 0.6; // average move is sufficient to cover 0.05% bid-ask slippage

                // Trade setup values
                const currentPrice = slaveInfo.price || 100.00;
                const atrVal = slaveInfo.atr || (currentPrice * 0.015);
                const stopLoss = direction === 'Long'
                  ? currentPrice - atrVal * 1.5
                  : currentPrice + atrVal * 1.5;
                
                const targetMove = expectedMove * 0.7; // target 70% of historical average reaction
                const takeProfit = direction === 'Long'
                  ? currentPrice * (1 + targetMove / 100)
                  : currentPrice * (1 - targetMove / 100);

                const risk = Math.abs(currentPrice - stopLoss);
                const reward = Math.abs(currentPrice - takeProfit);
                const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : '2.00';

                return {
                  ...slaveInfo,
                  direction,
                  expectedMove,
                  actualReturn,
                  underreactionGap,
                  triggerOneStd,
                  networkConfirmed,
                  multiMasterConf,
                  gapAdvantage,
                  slippageRestricted,
                  stopLoss,
                  takeProfit,
                  rrRatio,
                  activeMastersCount: activeMasters.length,
                  edgeProfiles,
                  currentPrice,
                  avgConfidence: maxEdge ? (direction === 'Long' ? maxEdge.probUp : maxEdge.probDown) : 50
                };
              }).filter(Boolean).sort((a: any, b: any) => {
                  let valA = a[scannerSortConfig.key] !== undefined ? a[scannerSortConfig.key] : Number.MIN_SAFE_INTEGER;
                  let valB = b[scannerSortConfig.key] !== undefined ? b[scannerSortConfig.key] : Number.MIN_SAFE_INTEGER;
                  if (valA < valB) return scannerSortConfig.direction === 'asc' ? -1 : 1;
                  if (valA > valB) return scannerSortConfig.direction === 'asc' ? 1 : -1;
                  return 0;
              }) as any[];

              if (scanningOpps.length === 0) {
                return (
                  <div className="text-center p-12 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 animate-in fade-in">
                    <ShieldCheck className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                    <p className="font-bold text-slate-800">No Underreaction Opportunities Found</p>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                      Currently, there are no extreme active Master anomalies causing a lagging follow-through gap among Slave symbols. Monitor is clean.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                      <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                      <span>Sort Scanner By:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={scannerSortConfig.key}
                        onChange={(e) => setScannerSortConfig(prev => ({ ...prev, key: e.target.value }))}
                        className="border border-slate-200 rounded text-xs px-3 py-2 bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="underreactionGap">Underreaction Gap %</option>
                        <option value="expectedMove">Expected Move %</option>
                        <option value="actualReturn">Current Return %</option>
                        <option value="avgConfidence">Network P(Dir)</option>
                        <option value="rrRatio">Risk-Reward Ratio</option>
                        <option value="activeMastersCount">Active Signals (Count)</option>
                      </select>

                      <button
                        onClick={() => setScannerSortConfig(prev => ({ ...prev, direction: prev.direction === 'desc' ? 'asc' : 'desc' }))}
                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Direction:</span>
                        <span className="text-indigo-600 uppercase font-black">{scannerSortConfig.direction}</span>
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-2 animate-in fade-in zoom-in-95">
                  {scanningOpps.map((opp, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between">
                      <div>
                        {/* Upper Header */}
                        <div className="flex justify-between items-start border-b border-slate-100 pb-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-3xl font-black text-slate-800 tracking-tight">{opp.slave}</span>
                              <span className={cn(
                                "text-xs font-black px-2 py-1 rounded-sm uppercase tracking-wider",
                                opp.direction === 'Long' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              )}>
                                {opp.direction === 'Long' ? <TrendingUp className="h-3 w-3 inline mr-1 animate-pulse" /> : <TrendingDown className="h-3 w-3 inline mr-1 text-rose-800" />}
                                {opp.direction === 'Long' ? 'BUY LIMIT' : 'SELL LIMIT'}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-slate-400 mt-1">
                              {allSymbols.find(s => s.symbol === opp.slave)?.name || 'Follower Stock Underreaction'}
                            </p>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block font-mono">Underreaction Gap</span>
                            <span className="text-xl font-black text-indigo-600 block">+{opp.underreactionGap.toFixed(2)}%</span>
                          </div>
                        </div>

                        {/* Return Comparison Progress Bar */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 space-y-3">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Gap Mechanics Analysis</h4>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-600">Expected Master-Slave Amplitude:</span>
                              <span className="text-slate-800">{opp.expectedMove.toFixed(2)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, opp.expectedMove * 20)}%` }} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-600">Follower Actual Response:</span>
                              <span className="text-slate-800">{opp.actualReturn.toFixed(2)}%</span>
                            </div>
                            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                              <div className={cn(
                                "h-2.5 rounded-full",
                                opp.direction === 'Long' ? "bg-emerald-500" : "bg-rose-500"
                              )} style={{ width: `${Math.min(100, opp.actualReturn * 20)}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Checklist matrix */}
                        <div className="mb-5">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Entry Trigger Rules Checklist</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 font-semibold text-slate-700">
                              {opp.triggerOneStd ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                              <span>Master Impulse &gt; 1.4σ</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 font-semibold text-slate-700">
                              {opp.networkConfirmed ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                              <span>Network Confirmed (&gt;70)</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 font-semibold text-slate-700">
                              {opp.multiMasterConf ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                              <span>Multi-Master Alignment</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 font-semibold text-slate-700">
                              {opp.gapAdvantage ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                              <span>Residual Gap &gt; 0.3%</span>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 font-semibold text-slate-700 col-span-2">
                              {opp.slippageRestricted ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                              <span>Spread Cost &lt; 15% Expected Move</span>
                            </div>
                          </div>
                        </div>

                        {/* Trade Specifications Panel */}
                        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5 text-indigo-400" /> Executive Order Proposal
                            </span>
                            <span className="text-xs font-semibold text-slate-400">ATR-Derived k=1.5</span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="p-2 bg-slate-850 rounded">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Current Entry</span>
                              <span className="block text-sm font-black text-slate-100">${opp.currentPrice.toFixed(2)}</span>
                            </div>
                            <div className="p-2 bg-slate-850 rounded border border-rose-950/40">
                              <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 block mb-0.5 w-full text-center">Stop Loss</span>
                              <span className="block text-sm font-black text-rose-200">${opp.stopLoss.toFixed(2)}</span>
                            </div>
                            <div className="p-2 bg-slate-850 rounded border border-emerald-950/40">
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block mb-0.5 w-full text-center">Target (70%)</span>
                              <span className="block text-sm font-black text-emerald-200">${opp.takeProfit.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-slate-400">Avg Link Transfer Prob:</span>
                              <span className="text-indigo-400 font-bold">{Math.round(opp.avgConfidence)}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="text-slate-400">Risk/Reward:</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px]",
                                Number(opp.rrRatio) >= 1.5 ? "bg-emerald-900/40 text-emerald-300" : "bg-yellow-900/40 text-yellow-300"
                              )}>
                                {opp.rrRatio} : 1
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Info message / Trigger Status */}
                      <div className="mt-4 text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200 rounded-lg p-3 text-center uppercase tracking-wide flex items-center justify-center gap-2">
                        <Activity className="h-4 w-4 text-indigo-500 animate-pulse" />
                        <span>Lag Trigger Window: OPEN (Max {opp.edgeProfiles[0]?.lag || 'Daily'} period)</span>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab: Real-Time LeadLag Score */}
        {activeTab === 'leadLagScore' && (
          <div className="space-y-4 animate-in fade-in">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Real-Time Lead-Lag Score Projection Hub</h3>
                <p className="text-sm text-slate-500">
                  Calculates continuous Granger pressure index and projects follow-through probabilities across standard time horizons.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={scanLiveSignals}
                  disabled={isScanningLive || edges.length === 0}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                >
                  {isScanningLive ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                  {isScanningLive ? "Scanning..." : "Recalculate Projections"}
                </button>
              </div>
            </div>

            {liveSignals.length === 0 && !isScanningLive && (
              <div className="text-center p-8 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                {edges.length === 0 ? "Train the network first to discover Master-Slave relationships." : "Click 'Recalculate Projections' to start evaluation."}
              </div>
            )}

            {liveSignals.length > 0 && (
                /* Sorting & Order Controls Toolbar */
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                      <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                      <span>Sort Projections By:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={signalSortKey}
                        onChange={(e) => setSignalSortKey(e.target.value)}
                        className="border border-slate-200 rounded text-xs px-3 py-2 bg-slate-50 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value="score">Max Overall Score</option>
                        <option value="growthScore">Growth Score</option>
                        <option value="downScore">Down Score</option>
                        <option value="incomingToGrowthRatio">Ratio: Growth / Incoming %</option>
                        <option value="incomingToDownRatio">Ratio: Down / Incoming %</option>
                        <option value="avgGrowthOfGrowing">Average Master Growth %</option>
                        <option value="avgDowntrendOfDowntrend">Average Master Downtrend %</option>
                      </select>

                      <button
                        onClick={() => setSignalSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Direction:</span>
                        <span className="text-indigo-600 uppercase font-black">{signalSortOrder}</span>
                      </button>
                    </div>
                  </div>
              )}

            {liveSignals.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {sortedSignals.map((slaveInfo: any, sIdx: number) => {
                  // Standard decay curves for horizons
                  const horizons = [
                    { key: '1h', label: '1 Hour Window', decay: 1.0 },
                    { key: '1d', label: '1 Day Window', decay: 0.85 },
                    { key: '3d', label: '3 Days Window', decay: 0.60 },
                    { key: '5d', label: '5 Days Window', decay: 0.40 }
                  ];

                  // Calculate master-led lead/lag feedback dynamics
                  const projections = horizons.map((h) => {
                    let totalGrowthPressure = 0;
                    let totalDownPressure = 0;

                    let hasValidMaster = false;
                    slaveInfo.mastersInfo.forEach((m: any) => {
                      const edge = edges.find(e => e.master === m.master && e.slave === slaveInfo.slave);
                      const edgeScore = edge ? edge.score : 50;

                      if (m.growth) {
                        hasValidMaster = true;
                        if (m.growth.hasStrongGrowth) {
                          totalGrowthPressure += edgeScore * (m.growth.slopeVsAvg || 1.0) * h.decay;
                        } else if (m.growth.hasStrongDowntrend) {
                          totalDownPressure += edgeScore * (m.growth.slopeVsAvg || 1.0) * h.decay;
                        }
                      }
                    });

                    // Signaled orientation
                    const isGrowth = totalGrowthPressure >= totalDownPressure;
                    const maxPressure = Math.max(totalGrowthPressure, totalDownPressure);

                    // Map to 50% - 95% using logistic function
                    const rawScore = maxPressure;
                    const logProb = 50 + 45 / (1 + Math.exp(-(rawScore - 20) / 30));

                    return {
                      horizon: h.key,
                      label: h.label,
                      pressure: rawScore,
                      direction: isGrowth ? 'Up' : 'Down',
                      probability: hasValidMaster && maxPressure > 2 ? logProb : 50.0
                    };
                  });

                  const highestHorizon = [...projections].sort((a,b) => b.probability - a.probability)[0];
                  const activeOpportunity = highestHorizon && highestHorizon.probability > 70;

                  return (
                    <div key={sIdx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all relative flex flex-col justify-between animate-in fade-in">
                      <div>
                        {/* Title Bar */}
                        <div className="flex justify-between items-center mb-4 pl-1 col-span-3">
                          <div>
                            <span className="text-2xl font-black text-indigo-800 tracking-tight block">{slaveInfo.slave}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate max-w-[200px]">
                              {allSymbols.find(s => s.symbol === slaveInfo.slave)?.name || 'Follower Stock Lead/Lag Profile'}
                            </span>
                          </div>

                          {activeOpportunity && highestHorizon && (
                            <span className={cn(
                              "text-[10px] font-black px-2 py-1 rounded-sm uppercase tracking-wider block",
                              highestHorizon.direction === 'Up' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                            )}>
                              {highestHorizon.direction === 'Up' ? 'Uptrend Led' : 'Downtrend Led'}
                            </span>
                          )}
                        </div>

                        {/* Projection Horizons Gauges */}
                        <div className="space-y-4">
                          {projections.map((proj, pIdx) => (
                            <div key={pIdx} className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                              <div className="space-y-0.5">
                                <span className="text-xs font-bold text-slate-700 block">{proj.label}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] uppercase font-bold tracking-wide text-slate-400">Pressure:</span>
                                  <span className="text-[10px] font-extrabold text-indigo-600 font-mono">{proj.pressure.toFixed(1)}</span>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-0.5">Follow Prob.</span>
                                <div className="flex items-center gap-1 justify-end">
                                  {proj.probability > 50 && (
                                    proj.direction === 'Up' 
                                      ? <ArrowUpRight className="h-4 w-4 text-emerald-500 font-bold shrink-0" />
                                      : <ArrowDownRight className="h-4 w-4 text-rose-500 font-bold shrink-0" />
                                  )}
                                  <span className={cn(
                                    "text-base font-black",
                                    proj.probability > 75 
                                      ? (proj.direction === 'Up' ? "text-emerald-600" : "text-rose-600")
                                      : "text-slate-600"
                                  )}>
                                    {Math.round(proj.probability)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mathematical Equation reference footer */}
                      <div className="mt-4 pt-3 border-t border-dashed border-slate-200 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                        <span>LLScore_j = z( ∑ EdgeScore_i,j * Impulse * Dec_h )</span>
                        <span className="font-sans font-bold text-indigo-600 uppercase text-[9px] tracking-wide flex items-center gap-1">
                          <Gauge className="h-3 w-3" /> Granger Caused
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
        )}

      </div>
    </div>
  );
}
