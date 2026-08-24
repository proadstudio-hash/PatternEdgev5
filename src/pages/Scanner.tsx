import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../lib/utils';
import { ShieldAlert, BarChart2, Settings2, ChevronUp, ChevronDown } from 'lucide-react';
import { OrderBookPanel } from '../components/OrderBookPanel';

export function Scanner() {
  const [results, setResults] = useState<any[]>([]);
  const [ensembleResults, setEnsembleResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [shortTimeframe, setShortTimeframe] = useState('PRO AUTO');
  const [selectedModels, setSelectedModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('scanner_last_selected_models');
      return saved ? JSON.parse(saved) : ['pattern', 'timeseries', 'signals', 'learning_trend'];
    } catch (e) {
      return ['pattern', 'timeseries', 'signals', 'learning_trend'];
    }
  });

  const [showSettings, setShowSettings] = useState(false);
  const [weights, setWeights] = useState(() => {
    try {
      const saved = localStorage.getItem('scanner_last_weights');
      return saved ? JSON.parse(saved) : {
        generic: 1.0,
        specific: 1.5,
        sampleSize: 0.5,
        winRate: 2.0,
        patternsFound: 0.5,
        teachingQuality: 1.0,
        modelFitting: 1.0
      };
    } catch (e) {
      return {
        generic: 1.0,
        specific: 1.5,
        sampleSize: 0.5,
        winRate: 2.0,
        patternsFound: 0.5,
        teachingQuality: 1.0,
        modelFitting: 1.0
      };
    }
  });

  const [sortConfig, setSortConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('scanner_last_sort_config');
      return saved ? JSON.parse(saved) : { key: 'finalScore', direction: 'desc' };
    } catch (e) {
      return { key: 'finalScore', direction: 'desc' };
    }
  });
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const [isTsMethod, setIsTsMethod] = useState(false);
  const [isSignalsMethod, setIsSignalsMethod] = useState(false);
  const [isLearningTrendMethod, setIsLearningTrendMethod] = useState(false);

  const fetchResults = () => {
    setLoading(true);
    fetch('/api/trained-patterns')
      .then(r => {
        if (!r.ok) throw new Error("Failed to load patterns");
        return r.json();
      })
      .then(d => {
        if (d && d.settings && d.settings.training_settings) {
           let sets = null;
           try { sets = JSON.parse(d.settings.training_settings); } catch(e){}
           
           setIsTsMethod(sets?.method === 'timeseries');
           setIsSignalsMethod(sets?.method === 'signals');
           setIsLearningTrendMethod(sets?.method === 'learning_trend');
        }
      }).catch(e => {
        const msg = String(e.message || e);
        if (!msg.includes('Load failed') && !msg.includes('pattern')) {
           console.error("Patterns fetch error:", e);
        }
      });

    fetch('/api/scanner/results')
      .then(r => {
        if (!r.ok) throw new Error("Failed to load scanner results");
        return r.json();
      })
      .then(d => {
        if (Array.isArray(d)) setResults(d);
        else setResults([]);
        
        fetch('/api/ensemble/results')
          .then(r => {
            if (!r.ok) throw new Error("Failed to load ensemble results");
            return r.json();
          })
          .then(ed => {
            if (Array.isArray(ed)) setEnsembleResults(ed);
            else setEnsembleResults([]);
            setLoading(false);
          }).catch((e) => {
            console.error("Ensemble fetch error:", e);
            setLoading(false);
          });
      })
      .catch(e => {
        const msg = String(e.message || e);
        if (!msg.includes('Load failed') && !msg.includes('pattern')) {
           console.error("Scanner results fetch error:", e);
        }
        setResults([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const runShortTermAnalysis = async () => {
    setIsScanning(true);
    try {
      const r = await fetch('/api/trained-patterns');
      const data = await r.json();
      let trainedSymbols: string[] = [];
      if (data && Array.isArray(data.patterns)) {
         trainedSymbols = data.patterns.map((x: any) => x.symbol);
      }
      
      const activeSymbols = Array.from(new Set(trainedSymbols));
      
      if (activeSymbols.length === 0) {
          alert("No symbols have been taught yet. Please complete the Teaching Phase first.");
          setIsScanning(false);
          return;
      }

      await fetch('/api/scanner/short-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbols: activeSymbols,
          indicators: ['sma200', 'ema50', 'ema20', 'supertrend', 'adx', 'rsi14', 'macd', 'atr', 'bbw', 'sr', 'fibonacci'],
          timeframe: shortTimeframe,
          frequency: shortTimeframe === 'PRO AUTO' ? 'PRO AUTO' : (shortTimeframe.includes('Day') ? '15m' : (shortTimeframe.includes('Hour') ? '1m' : '1h')),
          selectedModels
        })
      });
      let attempts = 0;
      const poll = setInterval(async () => {
         attempts++;
         const statRes = await fetch('/api/scanner/status');
         const statData = await statRes.json();
         if (!statData.isProcessing || attempts > 60) {
            clearInterval(poll);
            fetchResults();
            setIsScanning(false);
         }
      }, 2000);
    } catch (e) {
      if (String(e).includes("Load failed") || String(e).includes("pattern")) { /* ignore */ } else { console.error(e); }
      setIsScanning(false);
    }
  };

      const processedResults = useMemo(() => {
    return results.map(r => {
        let modelType = 'pattern'; // fallback
        const nm = r.setup_name || '';
        
        if (nm.includes('Advanced Loris') || nm.includes('Advanced Growth')) {
            modelType = 'advanced_loris';
        } else if (nm.includes('Time Series') || nm.includes('TS Multi') || nm.includes('TS Trend')) {
            modelType = 'timeseries';
        } else if (nm.includes('Learning Trend') || nm.includes('LT ')) {
            modelType = 'learning_trend';
        } else if (nm.includes('Bullish') || nm.includes('Bearish') || nm.includes('Pattern Search') || nm.includes('Double Top') || nm.includes('Double Bottom') || nm.includes('Head and Shoulders')) {
            modelType = 'pattern';
        } else {
            modelType = 'signals'; 
        }
        return { ...r, modelType };
    }).filter(r => {
        if (!selectedModels || selectedModels.length === 0) return true;
        return selectedModels.includes(r.modelType);
    }).map(r => {
      let generic = r.generic_score || 0;
      let specific = r.specific_score || 0;
      let winRate = r.winRate || 0;
      
      if (generic > 1.0) generic /= 100;
      if (specific > 1.0) specific /= 100;
      // Normalize specific score if it was multiplied by tiny expectancy
      if (specific > 0 && specific < 0.2 && generic > 0.5) {
         specific = Math.min(specific * 5, 1.0);
      }
      if (winRate > 1.0) winRate /= 100;

      const sampleSize = r.teaching_sampleSize || r.sample_size || 0;
      const patternsFound = r.patternsFound || 0;
      const teachingQuality = (r.teachingQuality || 0) / 100;
      const modelFitting = (r.modelFittingPerformance || 0) / 100;

      const hasProbability = r.probability !== undefined && r.probability !== null;
      const isTsOrSignals = r.setup_name?.includes('Time Series') || r.setup_name?.includes('Signals') || r.setup_name?.includes('Learning Trend') || r.setup_name?.includes('Advanced Loris');
      
      const weightSum = weights.generic + weights.specific + weights.sampleSize + weights.winRate + weights.patternsFound + weights.teachingQuality + weights.modelFitting;
      
      let rawScore = (generic * weights.generic +
        specific * weights.specific +
        Math.min(sampleSize / 200, 1.0) * weights.sampleSize +
        Math.min(winRate * 2.5, 1.0) * weights.winRate +
        Math.min(patternsFound / 10, 1.0) * weights.patternsFound +
        teachingQuality * weights.teachingQuality +
        modelFitting * weights.modelFitting);

      // Give a boost to pattern scores to align them with ML probability thresholds (0-100 range)
      const patternBoost = isTsOrSignals ? 1 : 1.25;
      
      const score = (hasProbability && isTsOrSignals) ? 
        ((r.probability || 0) * 100) :
        Math.min((rawScore / weightSum) * 100 * patternBoost, 100);

      return {
        ...r,
        finalScore: score,
        teaching_sampleSize: sampleSize,
        winRate,
        patternsFound,
        teachingQuality: r.teachingQuality || 0,
        modelFittingPerformance: r.modelFittingPerformance || 0
      };
    });
  }, [results, weights, selectedModels]);

  const sortedResults = useMemo(() => {
    let sortableItems = [...processedResults];
    sortableItems.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [processedResults, sortConfig]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, any[]>();
    processedResults.forEach(r => {
      if (!map.has(r.symbol)) map.set(r.symbol, []);
      map.get(r.symbol)!.push(r);
    });
    
    let grouped = Array.from(map.entries()).map(([symbol, setups]) => {
      let imminentGrowthSignals = 0;
      
      let sumBars = 0;
      let sumWinRate = 0;
      let sumPattEval = 0;
      let sumTeachQ = 0;
      let sumFit = 0;

      let modelGroups: Record<string, {
           scoreSum: number,
           count: number,
           entrySum: number,
           stopSum: number,
           targetSum: number,
           estCount: number,
           expectancySum: number,
           riskRewardSum: number,
           expectancyCount: number,
           riskRewardCount: number
      }> = {};

      setups.forEach((s: any) => {
          const isBull = s.setup_name?.toLowerCase().includes("bull") || s.setup_name?.includes("UP") || s.setup_name?.includes("LONG") || s.classification?.toLowerCase().includes("long") || s.classification?.includes("UP") || s.classification?.includes("Trend") || s.direction === 'LONG' || s.action === 'BUY' || s.setup_name?.toLowerCase().includes('advanced');
          if (isBull && s.finalScore > 50) {
              imminentGrowthSignals++;
          }
          
          sumBars += (Number(s.teaching_sampleSize) || 0);
          sumWinRate += (Number(s.winRate) || 0);
          sumPattEval += (Number(s.patternsFound) || 0);
          sumTeachQ += (Number(s.teachingQuality) || 0);
          sumFit += (Number(s.modelFittingPerformance) || 0);
          
          const t = s.modelType || 'pattern';
          if (!modelGroups[t]) modelGroups[t] = { scoreSum: 0, count: 0, entrySum: 0, stopSum: 0, targetSum: 0, estCount: 0, expectancySum: 0, riskRewardSum: 0, expectancyCount: 0, riskRewardCount: 0 };
          
          modelGroups[t].scoreSum += s.finalScore || 0;
          modelGroups[t].count++;
          
          if (typeof s.entry_price === 'number' && typeof s.stop_price === 'number') {
              modelGroups[t].entrySum += s.entry_price;
              modelGroups[t].stopSum += s.stop_price;
              modelGroups[t].targetSum += s.target_1 || 0;
              modelGroups[t].estCount++;
          }
          
          if (typeof s.expectancy === 'number' && !isNaN(s.expectancy)) {
              modelGroups[t].expectancySum += s.expectancy;
              modelGroups[t].expectancyCount++;
          }
          if (typeof s.risk_reward === 'number' && !isNaN(s.risk_reward)) {
              modelGroups[t].riskRewardSum += s.risk_reward;
              modelGroups[t].riskRewardCount++;
          }
      });

      const len = setups.length;
      
      let finalAvgScoreSum = 0;
      let finalAvgScoreCount = 0;
      let globEntrySum = 0; let globStopSum = 0; let globTargetSum = 0; let globEstCount = 0;
      let globExpectancySum = 0; let globExpectancyCount = 0; 
      let globRiskRewardSum = 0; let globRiskRewardCount = 0;
      let prob1dSum = 0, prob1dCount = 0;
      let prob2dSum = 0, prob2dCount = 0;
      let prob3dSum = 0, prob3dCount = 0;
      let prob1wSum = 0, prob1wCount = 0;
      
      setups.forEach((s: any) => {
          if (typeof s.probability_1d === 'number') { prob1dSum += s.probability_1d; prob1dCount++; }
          if (typeof s.probability_2d === 'number') { prob2dSum += s.probability_2d; prob2dCount++; }
          if (typeof s.probability_3d === 'number') { prob3dSum += s.probability_3d; prob3dCount++; }
          if (typeof s.probability_1w === 'number') { prob1wSum += s.probability_1w; prob1wCount++; }
      });

      Object.keys(modelGroups).forEach(k => {
          const g = modelGroups[k];
          if (g.count > 0) {
              finalAvgScoreSum += g.scoreSum / g.count;
              finalAvgScoreCount++;
          }
          if (g.estCount > 0) {
              globEntrySum += (g.entrySum / g.estCount);
              globStopSum += (g.stopSum / g.estCount);
              globTargetSum += (g.targetSum / g.estCount);
              globEstCount++;
          }
          if (g.expectancyCount > 0) {
              globExpectancySum += (g.expectancySum / g.expectancyCount);
              globExpectancyCount++;
          }
          if (g.riskRewardCount > 0) {
              globRiskRewardSum += (g.riskRewardSum / g.riskRewardCount);
              globRiskRewardCount++;
          }
      });
      
      const finalScore = finalAvgScoreCount > 0 ? (finalAvgScoreSum / finalAvgScoreCount) : 0;
      
      return { 
        symbol, 
        name: setups[0]?.name || symbol, 
        imminentGrowthSignals,
        finalScore, 
        avgBars: sumBars / len,
        avgWinRate: sumWinRate / len,
        avgPattEval: sumPattEval / len,
        avgTeachQ: sumTeachQ / len,
        avgFit: sumFit / len,
        avgEntry: globEstCount > 0 ? globEntrySum / globEstCount : undefined,
        avgStop: globEstCount > 0 ? globStopSum / globEstCount : undefined,
        avgTarget: globEstCount > 0 ? globTargetSum / globEstCount : undefined,
        avgExpectancy: globExpectancyCount > 0 ? globExpectancySum / globExpectancyCount : undefined,
        avgRiskReward: globRiskRewardCount > 0 ? globRiskRewardSum / globRiskRewardCount : undefined,
        prob1d: prob1dCount > 0 ? prob1dSum / prob1dCount : undefined,
        prob2d: prob2dCount > 0 ? prob2dSum / prob2dCount : undefined,
        prob3d: prob3dCount > 0 ? prob3dSum / prob3dCount : undefined,
        prob1w: prob1wCount > 0 ? prob1wSum / prob1wCount : undefined,
        setups 
      };
    });

    grouped.sort((a, b) => {
      let key = sortConfig.key;
      if (key === 'winRate') key = 'avgWinRate';
      if (key === 'patternsFound') key = 'avgPattEval';
      if (key === 'teachingQuality') key = 'avgTeachQ';
      if (key === 'modelFittingPerformance') key = 'avgFit';
      if (key === 'avgBars') key = 'avgBars';

      let valA = (a as any)[key];
      let valB = (b as any)[key];
      
      if (valA === undefined && valB === undefined) return 0;
      if (valA === undefined) return sortConfig.direction === 'asc' ? 1 : -1;
      if (valB === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
      
      if (valA !== valB) {
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      }

      // Tie-breaker when primary sorting keys are equal (especially for finalScore)
      if (sortConfig.key === 'finalScore') {
         if (a.imminentGrowthSignals !== b.imminentGrowthSignals) {
            return sortConfig.direction === 'asc'
                ? a.imminentGrowthSignals - b.imminentGrowthSignals
                : b.imminentGrowthSignals - a.imminentGrowthSignals;
         }
      }
      return 0;
    });

    return grouped;
  }, [processedResults, sortConfig, sortedResults]);

  const sortedEnsembleResults = useMemo(() => {
    let sortableItems = [...ensembleResults];
    sortableItems.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [ensembleResults, sortConfig]);

  useEffect(() => {
    if (groupedResults && groupedResults.length > 0) {
      try {
        // Create a minimized representation of groupedResults to prevent QuotaExceededError from large datasets/depth profiles
        const minimizedGroupedResults = groupedResults.map((g: any) => ({
          symbol: g.symbol,
          name: g.name,
          imminentGrowthSignals: g.imminentGrowthSignals,
          finalScore: g.finalScore,
          avgBars: g.avgBars,
          avgWinRate: g.avgWinRate,
          avgPattEval: g.avgPattEval,
          avgTeachQ: g.avgTeachQ,
          avgFit: g.avgFit,
          avgEntry: g.avgEntry,
          avgStop: g.avgStop,
          avgTarget: g.avgTarget,
          avgExpectancy: g.avgExpectancy,
          avgRiskReward: g.avgRiskReward,
          prob1d: g.prob1d,
          prob2d: g.prob2d,
          prob3d: g.prob3d,
          prob1w: g.prob1w,
          setups: (g.setups || []).map((s: any) => ({
            setup_name: s.setup_name,
            classification: s.classification,
            direction: s.direction,
            action: s.action,
            entry_price: s.entry_price,
            current_price: s.current_price,
            currentPrice: s.currentPrice,
            target_1: s.target_1,
            expected_target_price: s.expected_target_price
          }))
        }));

        localStorage.setItem('scanner_last_grouped_results', JSON.stringify(minimizedGroupedResults));
        localStorage.setItem('scanner_last_selected_models', JSON.stringify(selectedModels));
        localStorage.setItem('scanner_last_sort_config', JSON.stringify(sortConfig));
        localStorage.setItem('scanner_last_weights', JSON.stringify(weights));
      } catch (e) {
        console.warn('Could not save scanner State to localStorage (quota potentially exceeded):', e);
      }
    }
  }, [groupedResults, selectedModels, sortConfig, weights]);

  const requestSort = (key: string) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  const isProAuto = shortTimeframe === 'PRO AUTO' && !isTsMethod && !isSignalsMethod && !isLearningTrendMethod;

  return (
    <div className="p-4 md:p-8 flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Daily Scanner</h1>
          <p className="text-slate-500 mt-1">Real-time setup detection based on learned weights.</p>
        </div>
        <div className="flex items-center gap-3">
           {!isProAuto && (
             <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg border border-slate-200 shadow-sm transition-colors ${showSettings ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                title="Configure Score Weights"
             >
                <Settings2 className="w-5 h-5" />
             </button>
           )}
           <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
             <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3 mr-1">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Models:</span>
               <div className="flex gap-1">
                 {[
                   { id: 'pattern', label: 'Basic' },
                   { id: 'timeseries', label: 'TS' },
                   { id: 'signals', label: 'Signals' },
                   { id: 'learning_trend', label: 'Trend' },
                   { id: 'advanced_loris', label: 'Advanced Loris' }
                 ].map(model => (
                   <button
                     key={model.id}
                     disabled={isScanning}
                     onClick={() => {
                       if (selectedModels.includes(model.id)) {
                         if (selectedModels.length > 1) {
                           setSelectedModels(selectedModels.filter(m => m !== model.id));
                         }
                       } else {
                         setSelectedModels([...selectedModels, model.id]);
                       }
                     }}
                     className={`px-2 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                       selectedModels.includes(model.id)
                         ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                         : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                     }`}
                   >
                     {model.label}
                   </button>
                 ))}
               </div>
             </div>
             <select 
                value={shortTimeframe} 
                onChange={e => setShortTimeframe(e.target.value)}
                disabled={isScanning}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded focus:ring-indigo-500 focus:border-indigo-500 p-2 uppercase tracking-widest"
             >
                <option value="PRO AUTO">PRO AUTO (Multi-Timeframe)</option>
                <option value="1 Hour">1 Hour (1m data)</option>
                <option value="1 Day">1 Day (15m data)</option>
                <option value="2 Days">2 Days (15m data)</option>
                <option value="3 Days">3 Days (15m data)</option>
                <option value="5 Days">5 Days (15m data)</option>
                <option value="2 Weeks">2 Weeks (1h data)</option>
                <option value="4 Weeks">4 Weeks (1h data)</option>
                <option value="6 Weeks">6 Weeks (1h data)</option>
             </select>
             <button 
               onClick={runShortTermAnalysis}
               disabled={isScanning}
               className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-xs shadow-sm hover:bg-indigo-700 transition-colors uppercase tracking-widest flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
             >
               {isScanning ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Analyzing...
                  </>
               ) : (
                  <>
                    <BarChart2 className="w-3 h-3" />
                    Run Short-Term Scan
                  </>
               )}
             </button>
           </div>
        </div>
      </div>

      {showSettings && !isProAuto && (
         <div className="bg-white border border-slate-200 rounded-xl p-6 mb-4 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-widest border-b border-slate-100 pb-2">Score Weights Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Generic Match</label>
                  <input type="number" step="0.1" min="0" value={weights.generic} onChange={e => setWeights({...weights, generic: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Specific Match</label>
                  <input type="number" step="0.1" min="0" value={weights.specific} onChange={e => setWeights({...weights, specific: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Dataset Bars</label>
                  <input type="number" step="0.1" min="0" value={weights.sampleSize} onChange={e => setWeights({...weights, sampleSize: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Teach Win Rate</label>
                  <input type="number" step="0.1" min="0" value={weights.winRate} onChange={e => setWeights({...weights, winRate: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Patt. Evaluated</label>
                  <input type="number" step="0.1" min="0" value={weights.patternsFound} onChange={e => setWeights({...weights, patternsFound: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Teach Quality</label>
                  <input type="number" step="0.1" min="0" value={weights.teachingQuality} onChange={e => setWeights({...weights, teachingQuality: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Model Fitting</label>
                  <input type="number" step="0.1" min="0" value={weights.modelFitting} onChange={e => setWeights({...weights, modelFitting: parseFloat(e.target.value) || 0})} className="border border-slate-300 rounded p-1.5 text-sm bg-slate-50 outline-none focus:border-indigo-500 font-mono shadow-inner" />
               </div>
            </div>
         </div>
      )}

      {loading ? (
         <div className="text-slate-500 flex items-center gap-2 font-bold p-4">
            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            Loading scan results...
         </div>
      ) : results.length === 0 ? (
         <div className="text-slate-500 bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
            No results found. Run the scanner from the Home dashboard or above.
         </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col flex-grow">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h2 className="font-bold text-slate-800">Scan Results <span className="font-normal text-slate-400 ml-2">Latest Batch</span></h2>
            <div className="flex gap-2">
               <button className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded hover:bg-slate-200 shadow-sm border border-slate-200 transition-colors uppercase tracking-widest">Export CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto flex-grow h-0 custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-[#f8fafc] border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('symbol')} rowSpan={2}>
                      Symbol <SortIcon columnKey="symbol" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('name')} rowSpan={2}>
                      Company <SortIcon columnKey="name" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('setup_name')} rowSpan={2}>
                      Pattern <SortIcon columnKey="setup_name" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-emerald-700 uppercase tracking-widest cursor-pointer bg-emerald-50 border-x border-emerald-100 transition-colors shadow-sm" onClick={() => requestSort('imminentGrowthSignals')} rowSpan={2}>
                      GROW SIGS <SortIcon columnKey="imminentGrowthSignals" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-widest cursor-pointer bg-indigo-50 border-x border-indigo-100 transition-colors shadow-sm" onClick={() => requestSort('finalScore')} rowSpan={2}>
                      GLOBAL SCORE <SortIcon columnKey="finalScore" />
                    </th>
                    <th colSpan={4} className="px-4 py-2 text-[10px] font-bold text-teal-800 uppercase tracking-widest text-center bg-teal-100/50 border-b border-teal-200">
                      PROBABILISTIC FORECAST Growth
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('avgExpectancy')} rowSpan={2}>
                      Proj. Gain <SortIcon columnKey="avgExpectancy" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('avgRiskReward')} rowSpan={2}>
                      Risk/Reward <SortIcon columnKey="avgRiskReward" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('avgBars')} rowSpan={2}>
                      Bars <SortIcon columnKey="avgBars" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('winRate')} rowSpan={2}>
                      Win Rate <SortIcon columnKey="winRate" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('patternsFound')} rowSpan={2}>
                      Patt. Eval <SortIcon columnKey="patternsFound" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('teachingQuality')} rowSpan={2}>
                      Teach Q. <SortIcon columnKey="teachingQuality" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('modelFittingPerformance')} rowSpan={2}>
                      Fit <SortIcon columnKey="modelFittingPerformance" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-[#f8fafc]" rowSpan={2}>Entry/Stop/Target</th>
                    <th className="px-4 py-3 bg-[#f8fafc]" rowSpan={2}></th>
                  </tr>
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-teal-700 uppercase tracking-widest cursor-pointer bg-teal-50 hover:bg-teal-100 border-x border-teal-100 transition-colors shadow-sm" onClick={() => requestSort('prob1d')}>
                      1 Day <SortIcon columnKey="prob1d" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-teal-700 uppercase tracking-widest cursor-pointer bg-teal-50 hover:bg-teal-100 border-x border-teal-100 transition-colors shadow-sm" onClick={() => requestSort('prob2d')}>
                      2 Days <SortIcon columnKey="prob2d" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-teal-700 uppercase tracking-widest cursor-pointer bg-teal-50 hover:bg-teal-100 border-x border-teal-100 transition-colors shadow-sm" onClick={() => requestSort('prob3d')}>
                      3 Days <SortIcon columnKey="prob3d" />
                    </th>
                    <th className="px-4 py-3 text-[10px] font-bold text-teal-700 uppercase tracking-widest cursor-pointer bg-teal-50 hover:bg-teal-100 border-x border-teal-100 transition-colors shadow-sm" onClick={() => requestSort('prob1w')}>
                      1 Week <SortIcon columnKey="prob1w" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedResults.map((g: any, i: number) => (
                    <React.Fragment key={i}>
                      <tr className={`hover:bg-slate-50 transition-colors group cursor-pointer ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`} onClick={() => setExpandedSymbol(expandedSymbol === g.symbol ? null : g.symbol)}>
                         <td className="px-4 py-3 font-bold text-slate-900 border-l-2 border-transparent group-hover:border-indigo-600">{g.symbol}</td>
                         <td className="px-4 py-3 text-xs text-slate-600 font-medium">{g.name}</td>
                         <td className="px-4 py-3 text-xs font-bold text-slate-500">
                            <div className="font-bold text-slate-500 mb-1">{g.setups.length} Setup(s)</div>
                             <div className="flex flex-wrap gap-1 mt-0.5 max-w-[240px]">
                                {g.setups.map((s: any, idx: number) => {
                                   let shortName = s.setup_name;
                                   if (s.setup_name.includes('Advanced Loris')) shortName = 'Loris';
                                   else if (s.setup_name.includes('Learning Trend')) shortName = 'Trend';
                                   else if (s.setup_name.includes('Time Series')) shortName = 'TS';
                                   else if (s.setup_name.includes('Signals')) shortName = 'Sig';
                                   else if (s.setup_name.includes('Trend Alignment')) shortName = 'Basic';
                                   else shortName = s.setup_name.split(' (')[0].substring(0, 12);
                                   
                                   const isBull = s.setup_name?.includes("Bullish") || s.setup_name?.includes("UP") || s.setup_name?.includes("LONG") || s.classification?.includes("Long") || s.classification?.includes("UP") || s.classification?.includes("Trend");
                                   
                                   return (
                                      <span key={idx} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                                         isBull 
                                            ? 'bg-emerald-50 border-emerald-100/50 text-emerald-700' 
                                            : 'bg-rose-50 border-rose-100/50 text-rose-700'
                                      }`} title={s.setup_name}>
                                         {shortName}: <span className="font-mono">{s.finalScore.toFixed(0)}</span>
                                      </span>
                                   );
                                })}
                             </div>
                         </td>
                         <td className="px-4 py-3 font-bold text-sm text-emerald-700 bg-emerald-50/50 border-x border-emerald-50 shadow-[inset_0_0_10px_rgba(0,0,0,0.01)] text-center">
                            {g.imminentGrowthSignals}
                         </td>
                         <td className="px-4 py-3 font-bold text-sm text-indigo-700 bg-indigo-50/50 border-x border-indigo-50 shadow-[inset_0_0_10px_rgba(0,0,0,0.01)] text-center">
                            {g.finalScore.toFixed(2)}
                         </td>
                         <td className="px-4 py-3 text-[10px] font-mono text-teal-700 bg-teal-50/30 text-center">{g.prob1d !== undefined ? `${(g.prob1d * 100).toFixed(1)}%` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-teal-700 bg-teal-50/30 text-center">{g.prob2d !== undefined ? `${(g.prob2d * 100).toFixed(1)}%` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-teal-700 bg-teal-50/30 text-center">{g.prob3d !== undefined ? `${(g.prob3d * 100).toFixed(1)}%` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-teal-700 bg-teal-50/30 text-center">{g.prob1w !== undefined ? `${(g.prob1w * 100).toFixed(1)}%` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{g.avgExpectancy !== undefined ? `+${g.avgExpectancy.toFixed(1)}%` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{g.avgRiskReward !== undefined ? `${g.avgRiskReward.toFixed(2)}x` : '-'}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{(g.avgBars || 0).toFixed(0)}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{((g.avgWinRate || 0) * 100).toFixed(1)}%</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{(g.avgPattEval || 0).toFixed(1)}</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{(g.avgTeachQ || 0).toFixed(1)}%</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-500 bg-slate-50/20">{(g.avgFit || 0).toFixed(1)}%</td>
                         <td className="px-4 py-3 text-[10px] font-mono text-slate-400 text-center bg-slate-50/20">
                            {g.avgEntry !== undefined ? (
                                <div className="flex flex-col items-center gap-0.5">
                                    <span className="text-emerald-600 font-semibold" title="Avg Entry">E: {formatCurrency(g.avgEntry)}</span>
                                    {g.avgTarget !== undefined && <span className="text-teal-600" title="Avg Target">T: {formatCurrency(g.avgTarget)}</span>}
                                    {g.avgStop !== undefined && <span className="text-rose-600" title="Avg Stop">S: {formatCurrency(g.avgStop)}</span>}
                                </div>
                            ) : (
                                <span className="italic">Expand for Entry</span>
                            )}
                         </td>
                         <td className="px-4 py-3 text-right">
                            <Link to={`/ticker/${g.symbol}`} className="text-indigo-600 font-bold text-xs uppercase tracking-widest hover:text-indigo-800 transition-colors" onClick={(e) => e.stopPropagation()}>View</Link>
                         </td>
                      </tr>
                      {expandedSymbol === g.symbol && g.setups.map((r: any, j: number) => (
                        <tr key={`sub_${j}`} className="bg-slate-50/80 border-b border-slate-100/50">
                           <td className="px-4 py-3 pl-8 text-slate-500 font-mono text-xs">↳</td>
                           <td className="px-4 py-3 text-xs text-slate-400">Model Details</td>
                           <td className="px-4 py-3 text-xs font-bold">
                              <span className={r.setup_name?.includes("Bullish") ? "text-emerald-600" : (r.setup_name?.includes("Bearish") ? "text-rose-600" : "text-slate-600")}>
                                 {r.setup_name?.replace('Bullish', 'Bull').replace('Bearish', 'Bear') || 'Unknown'}
                              </span>
                           </td>
                           <td className="px-4 py-3 text-xs font-bold text-center">
                              {(() => {
                                  const isBull = r.setup_name?.includes("Bullish") || r.setup_name?.includes("UP") || r.setup_name?.includes("LONG") || r.classification?.includes("Long") || r.classification?.includes("UP") || r.classification?.includes("Trend") || r.direction === 'LONG' || r.action === 'BUY';
                                  return (isBull && r.finalScore > 50) ? <span className="text-emerald-500">1</span> : <span className="text-slate-300">0</span>;
                              })()}
                           </td>
                           <td className="px-4 py-3 font-bold text-sm text-indigo-700 bg-indigo-50/30 border-x border-indigo-50/50 text-center">
                              {r.finalScore.toFixed(2)}
                           </td>
                           <td className="px-4 py-3 text-[10px] font-mono text-center text-teal-700">{r.probability_1d !== undefined ? `${(r.probability_1d * 100).toFixed(1)}%` : '-'}</td>
                           <td className="px-4 py-3 text-[10px] font-mono text-center text-teal-700">{r.probability_2d !== undefined ? `${(r.probability_2d * 100).toFixed(1)}%` : '-'}</td>
                           <td className="px-4 py-3 text-[10px] font-mono text-center text-teal-700">{r.probability_3d !== undefined ? `${(r.probability_3d * 100).toFixed(1)}%` : '-'}</td>
                           <td className="px-4 py-3 text-[10px] font-mono text-center text-teal-700">{r.probability_1w !== undefined ? `${(r.probability_1w * 100).toFixed(1)}%` : '-'}</td>
                           <td className="px-4 py-3 text-xs font-mono">{r.expectancy !== undefined ? `+${Number(r.expectancy).toFixed(1)}%` : '-'}</td>
                           <td className="px-4 py-3 text-xs font-mono">{r.risk_reward !== undefined ? `${Number(r.risk_reward).toFixed(2)}x` : '-'}</td>
                           <td className="px-4 py-3 text-xs font-mono">{r.teaching_sampleSize}</td>
                           <td className="px-4 py-3 text-xs font-mono">
                              <span className={(r.winRate || 0) >= 0.5 ? "text-emerald-600 font-bold" : "text-slate-600"}>
                                 {((Number(r.winRate) || 0) * 100).toFixed(1)}%
                              </span>
                           </td>
                           <td className="px-4 py-3 text-xs font-mono">{r.patternsFound}</td>
                           <td className="px-4 py-3 text-xs font-mono">{(Number(r.teachingQuality) || 0).toFixed(1)}%</td>
                           <td className="px-4 py-3 text-xs font-mono">{(Number(r.modelFittingPerformance) || 0).toFixed(1)}%</td>
                           <td className="px-4 py-3">
                              <div className="flex gap-2 text-[10px] font-mono whitespace-nowrap">
                                 <span className="text-slate-600 font-bold bg-slate-100 px-1 rounded">E:{formatCurrency(r.entry_price)}</span>
                                 <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">S:{formatCurrency(r.stop_price)}</span>
                                 <span className="text-emerald-600 font-bold bg-emerald-50 px-1 rounded">T:{formatCurrency(r.target_1)}</span>
                              </div>
                           </td>
                           <td className="px-4 py-3"></td>
                        </tr>
                      ))}
                      {expandedSymbol === g.symbol && (
                        <tr className="bg-slate-100/30 dark:bg-slate-800/10 border-b border-slate-250">
                           <td colSpan={17} className="px-8 py-4 bg-slate-50/10 dark:bg-slate-900/10">
                              <div className="max-w-4xl mx-auto space-y-4 my-2">
                                 <OrderBookPanel 
                                     symbol={g.symbol} 
                                     currentPrice={g.lastClosePrice || g.avgEntry || 100} 
                                     orderBook={g.setups[0]?.orderBook} 
                                 />

                                 <div className="bg-slate-900 text-white rounded-xl p-5 shadow-md border border-slate-800">
                                    <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                                       <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                                       <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">
                                          Squeeze & Dynamic Trajectory Forecast (ML Learned)
                                       </h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                                       {g.setups.map((s: any, idx: number) => {
                                          const hasMetrics = s.growth_strength !== undefined && s.growth_strength !== null;
                                          return (
                                             <div key={idx} className="bg-slate-950 border border-slate-800/60 rounded-lg p-3 space-y-2">
                                                <div className="text-[10px] font-bold text-slate-400 border-b border-slate-900 pb-2 flex justify-between">
                                                   <span>{s.setup_name.split(' (')[0]}</span>
                                                   <span className="text-emerald-400 font-mono">{(s.finalScore || 0).toFixed(0)}% Match</span>
                                                </div>
                                                <div className="space-y-1">
                                                   <div className="flex justify-between text-xs py-0.5">
                                                      <span className="text-slate-500 font-semibold">Growth Force / Strength:</span>
                                                      <span className="font-mono font-bold text-emerald-400">
                                                         {hasMetrics ? `${s.growth_strength} Pts` : 'N/A (Teeing up)'}
                                                      </span>
                                                   </div>
                                                   <div className="flex justify-between text-xs py-0.5">
                                                      <span className="text-slate-500 font-semibold">Growth Velocity / Speed:</span>
                                                      <span className="font-mono font-bold text-teal-400">
                                                         {hasMetrics ? `+${(s.growth_speed * 1).toFixed(3)}% / bar` : 'N/A'}
                                                      </span>
                                                   </div>
                                                   <div className="flex justify-between text-xs py-0.5">
                                                      <span className="text-slate-500 font-semibold">Growth Duration:</span>
                                                      <span className="font-mono font-bold text-indigo-400">
                                                         {hasMetrics ? `${s.growth_duration} Bars` : 'N/A'}
                                                      </span>
                                                   </div>
                                                   <div className="flex justify-between text-xs py-0.5 border-t border-slate-900/40 mt-1 pt-1">
                                                      <span className="text-slate-300 font-semibold">Est. Trajectory Peak Closures:</span>
                                                      <span className="font-mono font-bold text-orange-400">
                                                         {hasMetrics ? formatCurrency(s.max_estimated_value) : 'N/A'}
                                                      </span>
                                                   </div>
                                                </div>
                                             </div>
                                          );
                                       })}
                                    </div>
                                 </div>
                              </div>
                           </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      )}
    </div>
  );
}
