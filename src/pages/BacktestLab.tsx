import React, { useState, useEffect } from 'react';
import { Play, Download, Upload, TrendingUp, TrendingDown, AlignLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

export function BacktestLab() {
  const [simulations, setSimulations] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('backtest_simulations');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [ensembleResults, setEnsembleResults] = useState<any[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('backtest_simulations');
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.length === 0;
    } catch (e) {
      return true;
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

  const requestSort = (key: string) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    const newConfig = { key, direction };
    setSortConfig(newConfig);
    try {
      localStorage.setItem('scanner_last_sort_config', JSON.stringify(newConfig));
    } catch (e) {}
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  const sortedEnsembleResults = React.useMemo(() => {
    let items = [...ensembleResults];
    items.sort((a, b) => {
      let key = sortConfig.key;
      // Map sort config keys to actual keys in candidate stock objects in BacktestLab
      if (key === 'avgBars' || key === 'teaching_sampleSize') key = 'sampleSize';
      if (key === 'avgWinRate') key = 'winRate';

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
    return items;
  }, [ensembleResults, sortConfig]);

  useEffect(() => {
    try {
      localStorage.setItem('backtest_simulations', JSON.stringify(simulations));
    } catch (e) {
      console.error("BacktestLab localStorage save error:", e);
    }
  }, [simulations]);

  useEffect(() => {
    // 1. Try to load saved grouped results from localStorage to MATCH EXACTLY what the user saw
    const savedGroupedResultsStr = localStorage.getItem('scanner_last_grouped_results');
    if (savedGroupedResultsStr) {
      try {
        const parsed = JSON.parse(savedGroupedResultsStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped = parsed.map((g: any) => {
            const bullCount = (g.setups || []).filter((s: any) => {
              return s.setup_name?.toLowerCase().includes("bull") || s.setup_name?.includes("UP") || s.setup_name?.includes("LONG") || s.classification?.toLowerCase().includes("long") || s.classification?.includes("UP") || s.classification?.includes("Trend") || s.direction === 'LONG' || s.action === 'BUY' || s.setup_name?.toLowerCase().includes('advanced');
            }).length;
            const bearCount = (g.setups || []).length - bullCount;
            const direction = bullCount >= bearCount ? 'bullish' : 'bearish';

            const entryPrice = g.avgEntry !== undefined ? g.avgEntry : ((g.setups && g.setups[0]) ? (g.setups[0].entry_price || g.setups[0].current_price || g.setups[0].currentPrice || 0) : 0);
            const targetPrice = g.avgTarget !== undefined ? g.avgTarget : ((g.setups && g.setups[0]) ? (g.setups[0].target_1 || g.setups[0].expected_target_price || 0) : 0);

            return {
              ...g,
              currentPrice: entryPrice,
              targetPrice: targetPrice,
              direction,
              winRate: g.avgWinRate !== undefined ? g.avgWinRate : 0.85,
              sampleSize: g.avgBars !== undefined ? g.avgBars : 100,
              confidence: g.finalScore ? Math.abs(g.finalScore - 50) * 2 : 50
            };
          });
          setEnsembleResults(mapped);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to parse saved grouped results:", e);
      }
    }

    // 2. Fallback: Re-compute exactly like Scanner.tsx if localStorage is empty
    setLoading(true);
    
    // Retrieve model settings/weights
    let selectedModels = ['pattern', 'timeseries', 'signals', 'learning_trend'];
    try {
      const savedModels = localStorage.getItem('scanner_last_selected_models');
      if (savedModels) selectedModels = JSON.parse(savedModels);
    } catch(e){}

    let weights = {
      generic: 1.0,
      specific: 1.5,
      sampleSize: 0.5,
      winRate: 2.0,
      patternsFound: 0.5,
      teachingQuality: 1.0,
      modelFitting: 1.0
    };
    try {
      const savedWeights = localStorage.getItem('scanner_last_weights');
      if (savedWeights) weights = JSON.parse(savedWeights);
    } catch(e){}

    let sortConfig = { key: 'finalScore', direction: 'desc' };
    try {
      const savedSort = localStorage.getItem('scanner_last_sort_config');
      if (savedSort) sortConfig = JSON.parse(savedSort);
    } catch(e){}

    Promise.all([
      fetch('/api/scanner/results').then(r => r.json()),
      fetch('/api/trained-patterns').then(r => r.ok ? r.json() : {patterns: []})
    ])
      .then(([scannerData, trainedPatternsData]) => {
         // Create same mapping / processing as Scanner.tsx
         if (Array.isArray(scannerData)) {
            const processed = scannerData.map(r => {
               let modelType = 'pattern';
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
               return selectedModels.includes(r.modelType);
            }).map(r => {
               let generic = r.generic_score || 0;
               let specific = r.specific_score || 0;
               let winRate = r.winRate || 0;
               if (generic > 1.0) generic /= 100;
               if (specific > 1.0) specific /= 100;
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

            // Group by symbol
            const map = new Map<string, any[]>();
            processed.forEach(r => {
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

              let modelGroups: Record<string, any> = {};

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
                  if (!modelGroups[t]) modelGroups[t] = { scoreSum: 0, count: 0, entrySum: 0, stopSum: 0, targetSum: 0, estCount: 0 };
                  modelGroups[t].scoreSum += s.finalScore || 0;
                  modelGroups[t].count++;
                  
                  if (typeof s.entry_price === 'number' && typeof s.stop_price === 'number') {
                      modelGroups[t].entrySum += s.entry_price;
                      modelGroups[t].stopSum += s.stop_price;
                      modelGroups[t].targetSum += s.target_1 || 0;
                      modelGroups[t].estCount++;
                  }
              });

              const len = setups.length;
              let finalAvgScoreSum = 0;
              let finalAvgScoreCount = 0;
              let globEntrySum = 0; let globStopSum = 0; let globTargetSum = 0; let globEstCount = 0;

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
              });

              const finalScore = finalAvgScoreCount > 0 ? (finalAvgScoreSum / finalAvgScoreCount) : 0;
              const bullCount = setups.filter((s: any) => {
                return s.setup_name?.toLowerCase().includes("bull") || s.setup_name?.includes("UP") || s.setup_name?.includes("LONG") || s.classification?.toLowerCase().includes("long") || s.classification?.includes("UP") || s.classification?.includes("Trend") || s.direction === 'LONG' || s.action === 'BUY' || s.setup_name?.toLowerCase().includes('advanced');
              }).length;
              const bearCount = setups.length - bullCount;
              const direction = bullCount >= bearCount ? 'bullish' : 'bearish';

              const entryPrice = globEstCount > 0 ? globEntrySum / globEstCount : (setups[0]?.entry_price || setups[0]?.currentPrice || setups[0]?.current_price || 0);
              const targetPrice = globEstCount > 0 ? globTargetSum / globEstCount : (setups[0]?.target_1 || setups[0]?.expected_target_price || 0);

              let sumExpect = 0;
              let countExpect = 0;
              setups.forEach((s: any) => {
                  const val = s.expectancy !== undefined ? s.expectancy : s.expected_gain_percent;
                  if (typeof val === 'number' && !isNaN(val)) {
                      sumExpect += val;
                      countExpect++;
                  }
              });
              const avgExpectancy = countExpect > 0 ? sumExpect / countExpect : null;

              return {
                symbol,
                name: setups[0]?.name || symbol,
                imminentGrowthSignals,
                finalScore,
                currentPrice: entryPrice,
                targetPrice: targetPrice,
                direction,
                winRate: sumWinRate / len,
                sampleSize: sumBars / len,
                confidence: finalScore ? Math.abs(finalScore - 50) * 2 : 50,
                avgExpectancy,
                setups
              };
            });

            // Sort exactly like sortConfig
            grouped.sort((a, b) => {
              let valA = (a as any)[sortConfig.key];
              let valB = (b as any)[sortConfig.key];
              
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

            setEnsembleResults(grouped);
         }
         setLoading(false);
      })
      .catch((e) => {
         console.error("Ensemble fetch with fallback error:", e);
         setLoading(false);
      });
  }, []);

  const toggleSymbolSelection = (symbol: string) => {
    const next = new Set(selectedSymbols);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setSelectedSymbols(next);
  };

  const createSimulation = async () => {
    if (selectedSymbols.size === 0) return;
    setLoading(true);
    try {
      const symbolsToInclude = ensembleResults.filter(r => selectedSymbols.has(r.symbol));
      
      // Fetch current real-time data from the market
      const symbolsQuery = encodeURIComponent(symbolsToInclude.map(s => s.symbol).filter(s => !!s).join(','));
      let realTimePrices: Record<string, number> = {};
      if (symbolsQuery) {
        const res = await fetch(`/api/quotes?symbols=${symbolsQuery}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.forEach((q: any) => {
              if (q.symbol && q.price !== null && q.price !== undefined) {
                realTimePrices[q.symbol] = Number(q.price);
              }
            });
          }
        }
      }

      const newSimulations = symbolsToInclude.map(r => {
        const realStartPrice = realTimePrices[r.symbol] !== undefined ? realTimePrices[r.symbol] : (r.currentPrice || 0);
        const entryPrice = realStartPrice;
        
        let expectancyPct = 0.05;
        if (r.avgExpectancy !== undefined && r.avgExpectancy !== null) {
           expectancyPct = Math.abs(r.avgExpectancy) / 100;
        } else if (r.avgGain !== undefined && r.avgGain !== null) {
           expectancyPct = Math.abs(r.avgGain);
        }

        const isBull = r.direction === 'bullish';
        const targetPrice = isBull 
          ? entryPrice * (1 + expectancyPct) 
          : entryPrice * (1 - expectancyPct);

        return {
          symbol: r.symbol,
          name: r.name || r.symbol,
          savedAt: new Date().toISOString(),
          savedPrice: entryPrice,
          direction: r.direction,
          finalScore: r.finalScore,
          targetPrice: targetPrice,
          realCurrentPrice: entryPrice,
          realEvolutionPct: 0,
          accuracy: 0,
          winRate: r.winRate || 0.85,
          sampleSize: r.sampleSize || 100,
          confidence: r.confidence || (r.finalScore ? Math.abs(r.finalScore - 50) * 2 : null),
          setups: r.setups || []
        };
      });

      setSimulations(prev => [...prev, ...newSimulations]);
      setIsSelectionMode(false);
      setSelectedSymbols(new Set());
    } catch (e) {
      console.error("Error creating simulation with real-time start price:", e);
    } finally {
      setLoading(false);
    }
  };

  const trackRealTrend = async () => {
    if (!Array.isArray(simulations) || simulations.length === 0) return;
    setLoading(true);
    try {
      const symbols = encodeURIComponent(simulations.map(s => s.symbol).filter(s => !!s).join(','));
      if (!symbols) {
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/quotes?symbols=${symbols}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      const updated = simulations.map(sim => {
        const quote = data.find((q: any) => q.symbol === sim.symbol);
        if (quote && quote.price !== undefined && quote.price !== null) {
          const currentReal = Number(quote.price);
          const savedPrice = Number(sim.savedPrice) || 1;
          const evolutionPct = ((currentReal - savedPrice) / savedPrice) * 100;
          
          let accuracy = 0;
          let targetPrice = Number(sim.targetPrice) || (savedPrice * 1.05);

          if (sim.direction === 'bullish') {
             if (currentReal >= savedPrice) accuracy = Math.min(((currentReal - savedPrice) / Math.max(targetPrice - savedPrice, 0.001)) * 100, 100);
          } else if (sim.direction === 'bearish') {
             if (currentReal <= savedPrice) accuracy = Math.min(((savedPrice - currentReal) / Math.max(savedPrice - targetPrice, 0.001)) * 100, 100);
          }

          return { ...sim, realCurrentPrice: currentReal, realEvolutionPct: evolutionPct, accuracy };
        }
        return sim;
      });
      setSimulations([...updated]);
    } catch (e: any) {
      const msg = String(e.message || e);
      if (!msg.includes("Load failed") && !msg.includes("pattern")) { console.error("Error:", msg); }
    } finally {
      setLoading(false);
    }
  };

  const saveJson = () => {
    try {
      const arr = Array.isArray(simulations) ? simulations : [];
      const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const exportNode = document.createElement('a');
      exportNode.setAttribute("href", url);
      exportNode.setAttribute("download", `backtest_simulation_${new Date().getTime()}.json`);
      document.body.appendChild(exportNode);
      exportNode.click();
      exportNode.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Save JSON Error:", e);
      alert("Failed to save simulation data.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        let parsedList: any[] = [];
        if (Array.isArray(json)) {
          parsedList = json;
        } else if (json && typeof json === 'object' && Array.isArray(json.simulations)) {
          parsedList = json.simulations;
        } else if (json && typeof json === 'object') {
          parsedList = [json];
        }

        const normalized = parsedList.map((item: any) => {
          const symbol = String(item.symbol || item.ticker || '').trim().toUpperCase();
          const name = String(item.name || item.company || symbol);
          const savedPrice = Number(item.savedPrice || item.entryPrice || item.entry_price || item.currentPrice || item.current_price || item.price || 100.0);
          const direction = String(item.direction || item.trend || 'bullish').toLowerCase();
          const finalScore = Number(item.finalScore || item.score || 50.0);
          
          let targetPrice = item.targetPrice || item.target_price || item.target_1 || item.target;
          if (targetPrice === undefined || targetPrice === null) {
            targetPrice = direction === 'bullish' ? savedPrice * 1.05 : savedPrice * 0.95;
          } else {
            targetPrice = Number(targetPrice);
          }
          
          const realCurrentPrice = Number(item.realCurrentPrice || item.currentPrice || item.price || savedPrice);
          const realEvolutionPct = item.realEvolutionPct !== undefined && item.realEvolutionPct !== null 
            ? Number(item.realEvolutionPct) 
            : ((realCurrentPrice - savedPrice) / savedPrice) * 100;
            
          const accuracy = item.accuracy !== undefined && item.accuracy !== null
            ? Number(item.accuracy)
            : 0;

          return {
            symbol,
            name,
            savedAt: item.savedAt || new Date().toISOString(),
            savedPrice,
            direction,
            finalScore,
            targetPrice,
            realCurrentPrice,
            realEvolutionPct,
            accuracy,
            winRate: Number(item.winRate || item.win_rate || 0.85),
            sampleSize: Number(item.sampleSize || item.sample_size || item.n || 100),
            confidence: Number(item.confidence || 50.0),
            setups: Array.isArray(item.setups) ? item.setups : []
          };
        }).filter(item => item.symbol !== '');

        if (normalized.length > 0) {
          setSimulations(normalized);
          setIsSelectionMode(false);
        } else {
          alert("Could not extract any valid symbols/simulations from the JSON.");
        }
      } catch(err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 md:p-8 flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Backtest Lab</h1>
          <p className="text-slate-500 mt-1">
            {isSelectionMode 
              ? "Select symbols from scanner results to include in your simulation." 
              : "Simulate and track your custom symbol selection against real market data."}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
          {isSelectionMode ? (
            <>
              <button 
                onClick={() => {
                   if (selectedSymbols.size === ensembleResults.length) {
                       setSelectedSymbols(new Set());
                   } else {
                       setSelectedSymbols(new Set(ensembleResults.map(r => r.symbol)));
                   }
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-widest rounded hover:bg-slate-200 transition-colors"
               >
                 {selectedSymbols.size === ensembleResults.length && ensembleResults.length > 0 ? 'Deselect All' : 'Select All'}
               </button>
              <button 
                onClick={createSimulation} 
                disabled={selectedSymbols.size === 0} 
                className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                Start Simulation ({selectedSymbols.size})
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsSelectionMode(true)} 
              className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs uppercase tracking-widest rounded hover:bg-indigo-100 transition-colors"
            >
              Add Symbols
            </button>
          )}

          {!isSelectionMode && (
            <>
              <button onClick={trackRealTrend} disabled={!Array.isArray(simulations) || simulations.length === 0 || loading} className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest flex items-center gap-2 rounded hover:bg-indigo-700 transition-colors disabled:opacity-50">
                {loading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Play className="w-3 h-3" />}
                Track Real Trend
              </button>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <button onClick={saveJson} disabled={!Array.isArray(simulations) || simulations.length === 0} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-widest flex items-center gap-2 rounded hover:bg-slate-200 transition-colors disabled:opacity-50">
                <Download className="w-3 h-3" /> Save
              </button>
            </>
          )}

          <label className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-widest flex items-center gap-2 rounded hover:bg-slate-200 transition-colors cursor-pointer">
            <Upload className="w-3 h-3" />
            Load
            <input type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-grow flex flex-col">
        {isSelectionMode ? (
          <div className="flex-grow overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-slate-200 sticky top-0 z-10 select-none">
                <tr>
                  <th className="px-4 py-3 w-12 bg-[#f8fafc]"></th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('symbol')}>
                    Symbol <SortIcon columnKey="symbol" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('name')}>
                    Company <SortIcon columnKey="name" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest bg-[#f8fafc]">
                    Pattern
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-widest cursor-pointer hover:bg-indigo-100 transition-colors bg-indigo-50/50" onClick={() => requestSort('finalScore')}>
                    Total Score <SortIcon columnKey="finalScore" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('direction')}>
                    Direction <SortIcon columnKey="direction" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('currentPrice')}>
                    Price <SortIcon columnKey="currentPrice" />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest cursor-pointer hover:bg-slate-200 transition-colors bg-[#f8fafc]" onClick={() => requestSort('winRate')}>
                    WR/Confidence <SortIcon columnKey="winRate" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ensembleResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">No scanner results found. Ensure the scanner has been run.</td>
                  </tr>
                ) : (
                  sortedEnsembleResults.map((r, i) => (
                    <tr 
                      key={i} 
                      className={`hover:bg-indigo-50/30 transition-colors cursor-pointer ${selectedSymbols.has(r.symbol) ? 'bg-indigo-50/50' : ''}`}
                      onClick={() => toggleSymbolSelection(r.symbol)}
                    >
                      <td className="px-4 py-3">
                        <input 
                           type="checkbox" 
                           checked={selectedSymbols.has(r.symbol)} 
                           readOnly 
                           className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                        />
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{r.symbol}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.name || r.symbol}</td>
                      <td className="px-4 py-3 text-xs">
                          <div className="flex flex-wrap gap-1 mt-0.5 max-w-[240px]">
                                {(r.setups || []).map((s: any, idx: number) => {
                                   let shortName = s.setup_name || '';
                                   if (shortName.includes('Advanced Loris')) shortName = 'Loris';
                                   else if (shortName.includes('Learning Trend')) shortName = 'Trend';
                                   else if (shortName.includes('Time Series')) shortName = 'TS';
                                   else if (shortName.includes('Signals')) shortName = 'Sig';
                                   else if (shortName.includes('Trend Alignment')) shortName = 'Basic';
                                   else shortName = shortName.split(' (')[0].substring(0, 12);
                                   
                                   const isBull = s.setup_name?.includes("Bullish") || s.setup_name?.includes("UP") || s.setup_name?.includes("LONG") || s.classification?.includes("Long") || s.classification?.includes("UP") || s.classification?.includes("Trend");
                                   
                                   return (
                                      <span key={idx} className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                                         isBull 
                                            ? 'bg-emerald-50 border-emerald-100/50 text-emerald-700' 
                                            : 'bg-rose-50 border-rose-100/50 text-rose-700'
                                      }`} title={s.setup_name}>
                                         {shortName}: <span className="font-mono">{s.finalScore?.toFixed(0) || 0}</span>
                                      </span>
                                   );
                                })}
                          </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded font-bold text-sm">
                          {r.finalScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold uppercase">
                        <span className={r.direction === "bullish" ? "text-emerald-600" : (r.direction === "bearish" ? "text-rose-600" : "text-slate-600")}>
                          {r.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{formatCurrency(r.currentPrice)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {r.winRate !== undefined && `WR: ${(r.winRate * 100).toFixed(1)}% `}
                        {r.confidence !== undefined && `Conf: ${r.confidence.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (!Array.isArray(simulations) || simulations.length === 0) ? (
          <div className="p-8 text-center text-slate-500">
            No active simulation. Click "Add Symbols" to select from scanner results.
          </div>
        ) : (
          <div className="flex-grow overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Symbol / Name</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Score / Stats</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Direction</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Saved Price</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Target</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-widest bg-indigo-50">Real Current</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-widest bg-indigo-50">Evolution</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-widest bg-indigo-50">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.isArray(simulations) && simulations.map((sim, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-l-2 border-transparent hover:border-indigo-600">
                      <div className="font-bold text-slate-900">{sim.symbol}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{sim.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-indigo-600">Score: {sim.finalScore?.toFixed(1)}</span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          WR: {(sim.winRate * 100).toFixed(0)}% | N: {sim.sampleSize}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold">
                      <span className={sim.direction === "bullish" ? "text-emerald-600" : (sim.direction === "bearish" ? "text-rose-600" : "text-slate-600")}>
                        {sim.direction.toUpperCase()}
                        {sim.direction === "bullish" ? <TrendingUp className="w-3 h-3 inline ml-1" /> : (sim.direction === "bearish" ? <TrendingDown className="w-3 h-3 inline ml-1" /> : <AlignLeft className="w-3 h-3 inline ml-1" />)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{formatCurrency(sim.savedPrice)}</td>
                    <td className="px-4 py-3 text-xs font-mono">{formatCurrency(sim.targetPrice)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800 bg-indigo-50/30">
                      {sim.realCurrentPrice ? formatCurrency(sim.realCurrentPrice) : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold bg-indigo-50/30">
                      {sim.realEvolutionPct !== null ? (
                        <span className={sim.realEvolutionPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {sim.realEvolutionPct >= 0 ? "+" : ""}{sim.realEvolutionPct.toFixed(2)}%
                        </span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono bg-indigo-50/30">
                      {sim.accuracy !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-200 rounded overflow-hidden">
                                <div className="h-full bg-indigo-500" style={{width: `${sim.accuracy}%`}}></div>
                            </div>
                            <span>{sim.accuracy.toFixed(0)}%</span>
                          </div>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
