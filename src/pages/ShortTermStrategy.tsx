import React, { useState, useEffect } from 'react';
import { 
  Zap, TrendingUp, TrendingDown, Layers, Activity, ChevronDown, ChevronUp, 
  Percent, CheckCircle2, XCircle, AlertTriangle, Clock, ArrowRight, Search, 
  RefreshCw, Info, ShieldCheck, Gauge, Check, Play
} from 'lucide-react';
import { OrderBookPanel } from '../components/OrderBookPanel';

export function ShortTermStrategy() {
  const [interval, setInterval] = useState<string>('1h');
  const [enableCrypto, setEnableCrypto] = useState<boolean>(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  // Fetch results when interval changes or when refleshed
  const fetchStrategyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/short-term?interval=${interval}&includeCrypto=${enableCrypto}`);
      if (!res.ok) {
        throw new Error('Impossibile recuperare i dati dall\'API della strategia.');
      }
      const json = await res.json();
      setData(json);
      // Automatically expand first element if results exist
      if (json.length > 0) {
        setExpandedSymbol(json[0].symbol);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStrategyData();
  }, [interval, enableCrypto]);

  const toggleExpand = (symbol: string) => {
    if (expandedSymbol === symbol) {
      setExpandedSymbol(null);
    } else {
      setExpandedSymbol(symbol);
    }
  };

  // Filters results
  const filteredData = data.filter(item => {
    const s = search.toLowerCase();
    return (
      item.symbol.toLowerCase().includes(s) ||
      (item.name && item.name.toLowerCase().includes(s)) ||
      (item.sector && item.sector.toLowerCase().includes(s))
    );
  });

  // Quantities for metrics dashboard cards
  const totalTickers = data.length;
  const setupCandidates = data.filter(d => d.finalScore >= 65).length;
  const validSignals = data.filter(d => d.finalScore >= 75).length;
  const strongSetups = data.filter(d => d.finalScore >= 85).length;

  const formatCurrency = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    return val.toLocaleString('it-IT', { style: 'currency', currency: 'USD' });
  };

  return (
    <div className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full text-left">
      {/* Title Header with custom spacing */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white rounded p-1.5 flex items-center justify-center">
              <Zap className="h-5 w-5 text-amber-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Analizzatore Strategia Short-Term L2
            </h1>
          </div>
          <p className="text-sm text-slate-500">
            Filtri avanzati su profondità di mercato (Level 2), spread, assorbimento di liquidità e indicatori tecnici con orizzonte operativo swing (1-5 giorni).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Interval Selector */}
          <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 px-2 uppercase tracking-wider">Interval:</span>
            {['15m', '1h', '1d'].map((timeframe) => (
              <button
                key={timeframe}
                onClick={() => setInterval(timeframe)}
                className={`px-3 py-1 text-xs font-black rounded-md transition-all ${
                  interval === timeframe
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {timeframe.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Crypto Toggle Button */}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 font-bold cursor-pointer hover:bg-indigo-100 transition-colors select-none">
            <input
              type="checkbox"
              checked={enableCrypto}
              onChange={(e) => setEnableCrypto(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Crypto 🪙</span>
          </label>
          {/* Refresh Button */}
          <button
            onClick={fetchStrategyData}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-600 px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Info Boxes & Strategy Alert warnings */}
      <div className="bg-gradient-to-r from-indigo-950 to-slate-900 text-indigo-100 rounded-xl p-5 shadow-sm border border-indigo-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-indigo-900 p-2 rounded-lg text-indigo-300 flex-shrink-0 mt-0.5">
            <Info className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Approccio Statistico Rigido</h4>
            <p className="text-xs text-indigo-200 leading-relaxed max-w-3xl">
              I migliori trade non si aprono per sentiment arbitrario, ma quando il prezzo dimostra l’assorbimento reale dei book wall di Level 2. Questa pagina analizza lo sbilanciamento del book (OBI), volume relativo e indicatori su tutti i titoli. Il sistema ordina i risultati in modo decrescente in base al punteggio strategico ottenuto (Score 0-100).
            </p>
          </div>
        </div>
        <div className="bg-indigo-900/40 p-3 rounded-lg border border-indigo-800/50 flex flex-col items-center justify-center text-center flex-shrink-0 min-w-40 font-mono">
          <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300">Minimum Score</span>
          <span className="text-2xl font-black text-emerald-400">&ge; 65</span>
          <span className="text-[9px] text-indigo-200 uppercase tracking-wider font-semibold">da operare</span>
        </div>
      </div>

      {/* Strategy Summary Statistics Bento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Titoli Monitorati</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{totalTickers}</h3>
          </div>
          <div className="h-10 w-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-500 border border-slate-100">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setup Candidati (&ge;65)</p>
            <h3 className="text-2xl font-black text-indigo-600 mt-1">{setupCandidates}</h3>
          </div>
          <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 border border-indigo-100 animate-pulse">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Segnali validi (&ge;75)</p>
            <h3 className="text-2xl font-black text-teal-600 mt-1">{validSignals}</h3>
          </div>
          <div className="h-10 w-10 bg-teal-50 rounded-lg flex items-center justify-center text-teal-600 border border-teal-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setup Molto Forti (&ge;85)</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">{strongSetups}</h3>
          </div>
          <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 border border-emerald-100">
            <Zap className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Control Tools Bar - Search and Sorting overview */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per ticker, azienda o settore..."
            className="w-full bg-slate-50 text-slate-800 text-xs pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium font-mono">
          Visualizzati: <span className="font-bold text-indigo-600">{filteredData.length}</span> di {totalTickers} titoli
        </div>
      </div>

      {/* Main Results Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Analisi rigorosa della strategia in corso...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-100 rounded-xl text-left space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-bold">
            <AlertTriangle className="h-5 w-5" />
            <span>Si è verificato un errore durante l'analisi.</span>
          </div>
          <p className="text-xs text-rose-600 leading-relaxed font-mono bg-white p-3 rounded border border-rose-100">{error}</p>
          <button 
            onClick={fetchStrategyData} 
            className="mt-2 text-xs bg-rose-800 text-white font-bold px-4 py-2 rounded-lg shadow hover:bg-rose-900 transition-colors cursor-pointer"
          >
            Riprova ad analizzare
          </button>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">Nessun titolo corrisponde ai criteri di ricerca.</p>
          <p className="text-xs text-slate-450 mt-1">Prova a cambiare il filtro per visualizzare più asset.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map((item) => {
            const isExpanded = expandedSymbol === item.symbol;
            
            // Visual badges according to final operational score intensity
            let scoreBgColor = "bg-rose-50 text-rose-700 border-rose-100";
            if (item.finalScore >= 85) scoreBgColor = "bg-emerald-500 text-white border-emerald-600";
            else if (item.finalScore >= 75) scoreBgColor = "bg-teal-500 text-white border-teal-600";
            else if (item.finalScore >= 65) scoreBgColor = "bg-amber-400 text-slate-900 border-amber-500";

            // Visual badge according to action types
            let actionBadge = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
            if (item.action === "BUY") actionBadge = "bg-emerald-100 text-emerald-800 border-emerald-200 font-black";
            if (item.action === "SELL") actionBadge = "bg-rose-100 text-rose-800 border-rose-200 font-black";

            return (
              <div 
                key={item.symbol}
                className={`bg-white rounded-xl border ${
                  isExpanded ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/10' : 'border-slate-200 hover:border-slate-300 shadow-sm'
                } transition-all duration-250 overflow-hidden text-left`}
              >
                {/* Main Visible Summary Row */}
                <div 
                  onClick={() => toggleExpand(item.symbol)}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none bg-white transition-colors hover:bg-slate-50/50"
                >
                  <div className="flex items-start gap-4 flex-1">
                    {/* Symbol Logo Block */}
                    <div className="h-12 w-12 rounded-lg bg-slate-900 flex flex-col items-center justify-center font-bold font-mono text-white flex-shrink-0 shadow-sm border border-slate-700">
                      <span className="text-xs">{item.symbol}</span>
                      <span className="text-[7px] text-slate-400 font-semibold">{item.sector ? item.sector.substring(0, 8).toUpperCase() : "-"}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-lg leading-tight">{item.symbol}</span>
                        <span className="text-xs text-slate-400 font-semibold truncate max-w-[150px] md:max-w-none">{item.name}</span>
                        {item.sector && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-slate-200">
                            {item.sector}
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 md:flex flex-wrap md:items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-450 uppercase font-black text-[9px] tracking-widest">Price:</span>
                          <span className="font-bold text-slate-800">{formatCurrency(item.currentPrice)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-450 uppercase font-black text-[9px] tracking-widest">OBI:</span>
                          <span className={`font-bold ${item.obi >= 0.55 ? 'text-emerald-600' : 'text-rose-600'}`}>{Math.round(item.obi * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-450 uppercase font-black text-[9px] tracking-widest">Vol. Rel:</span>
                          <span className={`font-bold ${item.relativeVolume >= 1.5 ? 'text-emerald-500' : 'text-slate-600'}`}>{item.relativeVolume.toFixed(2)}x</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-450 uppercase font-black text-[9px] tracking-widest">Spread:</span>
                          <span className={`font-black uppercase text-[10px] ${item.spreadQuality === 'OTTIMALE' ? 'text-emerald-500' : (item.spreadQuality === 'ACCETTABILE' ? 'text-teal-500' : 'text-rose-500')}`}>
                            {item.spreadQuality} ({Math.round(item.spreadPct * 10000) / 100}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Operational Score, Action status and dropdown icons */}
                  <div className="flex items-center justify-between lg:justify-end gap-3.5 border-t lg:border-t-0 border-slate-100 pt-3 lg:pt-0">
                    <div className="flex items-center gap-3">
                      {/* Action trigger */}
                      <div className={`px-3 py-1 rounded-lg text-xs font-black border uppercase tracking-wider ${actionBadge}`}>
                        {item.action === "BUY" ? "BUY / LONG" : (item.action === "SELL" ? "SELL / SHORT" : "NEUTRAL / HOLD")}
                      </div>

                      {/* Matching score progress label */}
                      <div className={`p-1 pl-3 pr-3.5 rounded-full border flex items-center gap-1.5 font-mono ${scoreBgColor}`}>
                        <span className="text-[10px] uppercase font-bold tracking-wider">Score:</span>
                        <span className="text-sm font-black font-mono">{item.finalScore}</span>
                      </div>
                    </div>

                    <div className="text-slate-400 font-light hover:text-slate-700">
                      {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Highly Expandable Detailed Strategy Modules (Accordion Content) */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-6">
                    {/* Setup Diagnosis & Key Actions Header */}
                    <div className="bg-slate-900 text-white rounded-xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow border border-slate-800">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${item.action === 'BUY' ? 'bg-emerald-400' : (item.action === 'SELL' ? 'bg-rose-400' : 'bg-slate-400')} animate-pulse`}></div>
                          <h3 className="text-xs uppercase font-bold tracking-widest text-slate-300">
                            Diagnosi Operativa: <span className="text-white font-mono">{item.scoreStatus} ({item.finalScore} pts)</span>
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 font-medium">
                          Trigger primario: <span className="text-slate-200 font-black italic">{item.trigger}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        <span className="font-mono text-xs bg-slate-950 text-slate-300 border border-slate-800 px-3 py-1 rounded-lg font-bold">
                          Orizzonte: <span className="text-amber-400">{item.holdingPeriod}</span>
                        </span>
                        <span className="font-mono text-xs bg-slate-950 text-slate-350 border border-slate-800 px-3 py-1 rounded-lg font-bold">
                          Fattore Rischio: <span className="text-indigo-400">1 : {item.riskReward.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      {/* Column 1 - L2 Real-Time Order Book Portafoglio */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-250 pb-2">
                          <Layers className="h-4 w-4 text-indigo-600" />
                          <h4 className="text-xs uppercase tracking-wider">Profondità Book L2</h4>
                        </div>
                        <OrderBookPanel 
                          symbol={item.symbol}
                          currentPrice={item.currentPrice}
                          orderBook={item.depth}
                        />
                        {/* Instant Absorption diagnosis widget */}
                        <div className={`p-4 rounded-xl border flex flex-col gap-1.5 ${
                          item.scoreLong >= item.scoreShort && item.obi >= 0.65 && (item.depth.resistancePrice - item.currentPrice) / item.currentPrice < 0.015
                            ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800'
                            : (item.scoreShort > item.scoreLong && item.obi <= 0.35 && (item.currentPrice - item.depth.supportPrice) / item.currentPrice < 0.015
                              ? 'bg-rose-50/50 border-rose-100 text-rose-800'
                              : 'bg-slate-100/50 border-slate-200 text-slate-600')
                        }`}>
                          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px]">
                            <Activity className="h-3.5 w-3.5 animate-pulse" />
                            <span>Stato Assorbimento Volumi (Time &amp; Sales)</span>
                          </div>
                          <p className="text-xs leading-relaxed font-semibold">
                            {item.scoreLong >= item.scoreShort && item.obi >= 0.65 && (item.depth.resistancePrice - item.currentPrice) / item.currentPrice < 0.015 ? (
                              <span><strong>Bullish Ask Squeeze:</strong> Gli ordini di vendita (Ask) su ${item.depth.resistancePrice.toFixed(2)} vengono assorbiti vigorosamente con transazioni sul prezzo bid-ask in accelerazione. Breakout altissima probabilità.</span>
                            ) : item.scoreShort > item.scoreLong && item.obi <= 0.35 && (item.currentPrice - item.depth.supportPrice) / item.currentPrice < 0.015 ? (
                              <span><strong>Bearish Bid Squeeze:</strong> I muri di acquisto (Bid) su ${item.depth.supportPrice.toFixed(2)} subiscono forte erosione. I venditori continuano a spingere con trades su bid eseguiti. Breakdown imminente.</span>
                            ) : (
                              <span><strong>Distribuzione Fluida:</strong> I volumi transitati a mercato non mostrano assorbimento anomalo a ridosso dei livelli primari al momento. Situazione ordinata dei buffer.</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Column 2 - Comprehensive Checklist Verification (Section 17/18) */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-250 pb-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <h4 className="text-xs uppercase tracking-wider">Verifica Filtri Strategia ({item.side})</h4>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm font-sans">
                          <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2 border-b border-slate-100 pb-2">
                            Checklist di Validazione Rigida ({item.checklist.filter((c: any) => c.checked).length} / 12)
                          </div>
                          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                            {item.checklist.map((clause: any, index: number) => (
                              <div key={index} className="flex items-start gap-2 text-xs">
                                {clause.checked ? (
                                  <Check className="h-4 w-4 text-emerald-500 bg-emerald-50 border border-emerald-100 rounded-full p-0.5 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                                )}
                                <span className={`font-semibold leading-normal ${clause.checked ? 'text-slate-800 font-black' : 'text-slate-400 line-through decoration-slate-200/50'}`}>
                                  {clause.label}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 pt-3 leading-relaxed font-medium">
                            * La strategia sconsiglia l'operatività d'impulso se non sono soddisfatte almeno il 60% delle condizioni chiave.
                          </div>
                        </div>
                      </div>

                      {/* Column 3 - Risk Management, Pricing and Trigger Indicators */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-250 pb-2">
                          <TrendingUp className="h-4 w-4 text-indigo-600" />
                          <h4 className="text-xs uppercase tracking-wider">Traguardi Operativi &amp; Indicatori</h4>
                        </div>

                        {/* Calculated Levels Panel */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-sm text-xs font-mono">
                          <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100 pb-2 flex justify-between font-sans">
                            <span>Pianificazione Stop &amp; Target</span>
                            <span className="text-indigo-600 font-bold">R:R {item.riskReward.toFixed(2)}</span>
                          </div>
                          
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-center py-1 border-b border-slate-50">
                              <span className="text-slate-500 font-semibold font-sans">PREZZO INGRESSO (Close):</span>
                              <span className="font-black text-slate-900 text-sm">{formatCurrency(item.currentPrice)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-50">
                              <span className="text-rose-500 uppercase font-black font-sans flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                                Stop Loss Rigido:
                              </span>
                              <span className="font-black text-rose-600 text-sm">{formatCurrency(item.stopPrice)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                              <span className="text-emerald-500 uppercase font-black font-sans flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                Target Teorico stimato:
                              </span>
                              <span className="font-black text-emerald-600 text-sm">{formatCurrency(item.targetPrice)}</span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-2.5 rounded-lg text-[10px] text-slate-500 font-sans leading-relaxed border border-slate-100 font-medium">
                            <strong className="text-slate-700">Gestione Overnight (Sezione 16):</strong> Mantenere oltre la seduta intraday solo se chiude vicino ai massimi del livello di breakout, il volume conferma, e l'indice di mercato generale non è contrario.
                          </div>
                        </div>

                        {/* Fast technical grid readout */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm text-xs">
                          <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100 pb-2 font-sans flex items-center gap-1">
                            <Gauge className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Contesto Tecnico di Supporto</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="text-slate-400 text-[9px] uppercase font-bold block mb-0.5">RSI 14</span>
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800">{Math.round(item.rsi)}</span>
                                <span className={`text-[9px] font-black uppercase ${item.rsiStatus === "Ottimale" ? "text-emerald-600" : "text-rose-500"}`}>
                                  {item.rsiStatus}
                                </span>
                              </div>
                            </div>

                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="text-slate-400 text-[9px] uppercase font-bold block mb-0.5">ADX 14</span>
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-800">{Math.round(item.adx)}</span>
                                <span className={`text-[9px] font-black uppercase ${item.adx > 20 ? "text-indigo-600" : "text-slate-400"}`}>
                                  {item.adx > 20 ? "Forte" : "Debole"}
                                </span>
                              </div>
                            </div>

                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 col-span-2 space-y-1">
                              <span className="text-slate-450 text-[9px] uppercase font-black block border-b border-slate-100/50 pb-0.5 font-sans">
                                Pivot di Riferimento EMA/VWAP
                              </span>
                              <div className="flex justify-between text-[11px] py-0.5">
                                <span className="text-slate-400">EMA9:</span>
                                <span className="font-black text-slate-700">${item.ema9.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] py-0.5">
                                <span className="text-slate-400">EMA20:</span>
                                <span className="font-black text-slate-700">${item.ema20.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] py-0.5">
                                <span className="text-slate-400">EMA50:</span>
                                <span className="font-black text-slate-700">${item.ema50.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[11px] py-0.5 border-t border-slate-150 pt-0.5">
                                <span className="font-black text-slate-600">VWAP:</span>
                                <span className="font-black text-slate-800">${item.vwap.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Trailing disclaimer card */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1 text-xs text-amber-800 font-medium">
          <p className="font-black uppercase tracking-wider text-[10px]">Attenzione sul rischio di slippage e stop-limit</p>
          <p className="leading-relaxed">
            I stop-loss aiutano a gestire rigorosamente il rischio capitale (0.5% - 1% max per operazione), ma possono comportare slippage o mancata esecuzione nel caso degli stop-limit in presenza di gap di apertura o fast-moving markets dovuti a news e dati di macroeconomia. Utilizzare sizing conservativo per ciascun trade.
          </p>
        </div>
      </div>
    </div>
  );
}
