import { Application, Request, Response } from 'express';
import { getDb } from './db.js';
import { runFullWorkflow } from './engine/scanner.js';
import { calculateFeatures, ema } from './engine/indicators.js';
import { systemStatus } from './engine/status.js';
import { runEnsembleTraining, runEnsembleScan } from './engine/ensembleRunner.js';
import { runTimeSeriesTraining } from './engine/timeseriesRunner.js';
import { runSignalsTraining } from './engine/signalsRunner.js';
import { runLearningTrendTraining } from './engine/learningTrendRunner.js';
import { analyzeLeadLagNetwork, analyzeLiveSignals } from './engine/networkTeaching.js';
import { processRealTimeMonitor, processLocalMonitorScan } from './engine/monitorRunner.js';
import { runAdvancedLorisTeaching, runAdvancedLorisScan, exportGlobalLorisModels, loadGlobalLorisModels, DEFAULT_LORIS_SETTINGS } from './engine/advancedGrowthLoris.js';
import { syncRealData } from './engine/dataSync.js';
import { getCachedQuote } from './engine/yfCache.js';
import { 
  scanLiquidity, 
  generateAiExplanation, 
  saveBacktestLog, 
  getBacktestLogs, 
  deleteBacktestLog, 
  getProvider 
} from './engine/forexLiquidityRunner.js';
import yahooFinanceDefault from 'yahoo-finance2';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
import { generateMarketDepth } from './utils/orderbook.js';

let isGlobalWorkflowRunning = false;

export function setupRoutes(app: Application) {
  const db = getDb();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/symbols', (req, res) => {
    try {
      const symbols = db.prepare('SELECT * FROM symbols ORDER BY sector, symbol').all();
      res.json(symbols);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/scanner/results', (req, res) => {
    try {
      // Get the latest result for EACH symbol / frequency
      const results = db.prepare(`
        SELECT s1.*, sym.name as name,
               t.patternsFound, t.winRate, t.sampleSize as teaching_sampleSize, 
               t.teachingQuality, t.modelFittingPerformance
        FROM scanner_results s1
        LEFT JOIN symbols sym ON s1.symbol = sym.symbol
        INNER JOIN (
            SELECT symbol, setup_name, MAX(date) as max_date
            FROM scanner_results
            GROUP BY symbol, setup_name
        ) s2 ON s1.symbol = s2.symbol AND s1.setup_name = s2.setup_name AND s1.date = s2.max_date
        LEFT JOIN (
           SELECT symbol, MAX(patternsFound) as patternsFound, MAX(winRate) as winRate, MAX(sampleSize) as sampleSize, MAX(teachingQuality) as teachingQuality, MAX(modelFittingPerformance) as modelFittingPerformance
           FROM trained_patterns
           GROUP BY symbol
        ) t ON s1.symbol = t.symbol
        ORDER BY s1.probability DESC
      `).all() as any[];

      const advancedPreds = db.prepare(`
        SELECT p1.*, sym.name as name
        FROM advanced_predictions p1
        LEFT JOIN symbols sym ON p1.symbol = sym.symbol
        INNER JOIN (
            SELECT symbol, MAX(id) as max_id
            FROM advanced_predictions
            GROUP BY symbol
        ) p2 ON p1.id = p2.max_id
      `).all() as any[];

      const mappedAdvanced = advancedPreds.map(p => {
        let parsedExplain = p.explanation_json;
        if (typeof parsedExplain === 'string') {
          try {
             const data = JSON.parse(parsedExplain);
             parsedExplain = (data.factors || []).join(' | ');
          } catch(e) {}
        }
        return {
          id: 'adv_' + p.id,
          date: p.timestamp,
          symbol: p.symbol,
          name: p.name,
          setup_name: 'Advanced Loris Neural',
          generic_score: (p.score || 0) / 100,
          specific_score: (p.score || 0) / 100,
          classification: p.signal_type,
          probability: Math.min(1, p.probability_1w || 0),
          probability_1d: p.probability_1d,
          probability_2d: p.probability_2d,
          probability_3d: p.probability_3d,
          probability_1w: p.probability_1w,
          expectancy: p.expected_gain_percent,
          risk_reward: p.risk_reward_ratio,
          entry_price: p.current_price,
          stop_price: p.stop_loss_candidate,
          target_1: p.expected_target_price,
          holding_period: (p.expected_duration || 7) + 'd',
          explanation: parsedExplain,
          patternsFound: 1,
          winRate: 85, // estimate based on thresholds
          teaching_sampleSize: 100
        };
      });

      const combined = [...results, ...mappedAdvanced].sort((a,b) => (b.probability || 0) - (a.probability || 0));

      const combinedEnriched = combined.map(item => {
        let referencePrice = item.entry_price || 100;
        const depth = generateMarketDepth(referencePrice, item.symbol);
        return {
          ...item,
          supportPrice: depth.supportPrice,
          resistancePrice: depth.resistancePrice,
          orderBook: depth
        };
      });

      res.json(combinedEnriched);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/trained-patterns', (req, res) => {
    try {
      const settingsRows = db.prepare('SELECT * FROM settings').all() as any[];
      const settings = settingsRows.reduce((acc, row) => ({...acc, [row.key]: row.value}), {});
      
      let trainingSettings = null;
      if (settings.training_settings) {
         try { trainingSettings = JSON.parse(settings.training_settings); } catch (e) {}
      }

      let patterns = db.prepare('SELECT * FROM trained_patterns').all();

      res.json({ patterns, settings });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/scanner/status', (req, res) => {
    res.json({
      ...systemStatus,
      isProcessing: isGlobalWorkflowRunning || systemStatus.isProcessing
    });
  });

  app.post('/api/scanner/train', (req, res) => {
    try {
      const { symbols, indicators, timeframe, frequency, method } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of symbols' });
      }
      if (systemStatus.isProcessing) {
        return res.status(409).json({ error: 'Scanner is already running' });
      }
      
      const insertSettings = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      insertSettings.run('training_settings', JSON.stringify({
        symbols,
        indicators,
        training_timeframe: timeframe,
        training_frequency: frequency,
        method: method || 'pattern',
        last_run: new Date().toISOString()
      }));

      if (timeframe === 'PRO AUTO') {
        const runProAutoLoop = async () => {
           isGlobalWorkflowRunning = true;
           const combinations = [
             { t: 'Last 3 Months', f: '15 Minutes' },
             { t: 'Last 3 Months', f: '1 Hour' },
             { t: 'Last 3 Months', f: '1 Day' },
             { t: 'Last 6 Months', f: '15 Minutes' },
             { t: 'Last 6 Months', f: '1 Hour' },
             { t: 'Last 6 Months', f: '1 Day' },
             { t: 'Last 1 Year', f: '1 Hour' },
             { t: 'Last 1 Year', f: '1 Day' },
             { t: 'Last 2 Years', f: '1 Day' }
           ];
           systemStatus.isProcessing = true;
           for (let i = 0; i < combinations.length; i++) {
               const { t, f } = combinations[i];
               systemStatus.stage = `PRO AUTO ${i+1}/${combinations.length}: ${t} / ${f}`;
               systemStatus.progress = Math.round((i / combinations.length) * 100);
               try {
                   systemStatus.isProcessing = false;
                   if (method === 'timeseries') {
                       await runTimeSeriesTraining(symbols, { timeframe: t, frequency: f, isShortTerm: false });
                   } else if (method === 'signals') {
                       await runSignalsTraining(symbols, { timeframe: t, frequency: f, isShortTerm: false });
                   } else if (method === 'learning_trend') {
                       await runLearningTrendTraining(symbols, { timeframe: t, frequency: f });
                   } else {
                       await runFullWorkflow(symbols, { indicators, timeframe: t, frequency: f, isShortTerm: false });
                   }
                   systemStatus.isProcessing = true;
               } catch (err) {
                   console.error(`Error in PRO AUTO combination ${t} / ${f}:`, err);
               }
           }
           isGlobalWorkflowRunning = false;
           systemStatus.isProcessing = false;
           systemStatus.stage = 'Idle';
           systemStatus.progress = 100;
           systemStatus.details = 'PRO AUTO sequence complete';
        };
        runProAutoLoop().catch(console.error);
        res.json({ status: 'started' });
        return;
      }
      
      if (method === 'timeseries') {
        runTimeSeriesTraining(symbols, { timeframe, frequency, isShortTerm: false })?.catch(console.error);
      } else if (method === 'signals') {
        runSignalsTraining(symbols, { timeframe, frequency, isShortTerm: false })?.catch(console.error);
      } else if (method === 'learning_trend') {
        runLearningTrendTraining(symbols, { timeframe, frequency })?.catch(console.error);
      } else {
         runFullWorkflow(symbols, { indicators, timeframe, frequency, isShortTerm: false }).catch(console.error);
      }
      res.json({ status: 'started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/scanner/clear-training', (req, res) => {
    try {
      db.prepare("DELETE FROM trained_patterns").run();
      db.prepare("DELETE FROM settings WHERE key LIKE 'training_%'").run();
      db.prepare("DELETE FROM ensemble_models").run();
      db.prepare("DELETE FROM feature_snapshots").run();
      db.prepare("DELETE FROM scanner_results").run();
      db.prepare("DELETE FROM ensemble_ohlcv").run();
      
      // Also clear in-memory results
      systemStatus.teachingResults = {};
      systemStatus.ensembleAggregatedResults = [];
      
      res.json({ status: 'cleared' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/scanner/short-term', (req, res) => {
    try {
      const { symbols, indicators, timeframe, frequency, selectedModels } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Please provide an array of symbols' });
      }
      if (systemStatus.isProcessing) {
        return res.status(409).json({ error: 'Scanner is already running' });
      }
      
      if (timeframe === 'PRO AUTO') {
         const rows = db.prepare("SELECT DISTINCT setup_name, training_timeframe FROM trained_patterns").all() as any[];
         if (rows.length === 0) {
            return res.status(400).json({ error: 'No models trained yet' });
         }
         
         const filteredRows = rows.filter(r => {
             const setup = r.setup_name || '';
             let kind = 'signals';
             if (setup === 'Learning Trend') kind = 'learning_trend';
             else if (setup.includes('Time Series') || setup.includes('TS Multi')) kind = 'timeseries';
             else if (setup === 'Pattern Search') kind = 'pattern';
             
             if (selectedModels && Array.isArray(selectedModels)) {
                 return selectedModels.includes(kind);
             }
             return true;
         });

         if (filteredRows.length === 0) {
             return res.status(400).json({ error: 'No trained models match the selected filters' });
         }
         
         db.prepare("DELETE FROM scanner_results").run();
         
         const runProAutoScanner = async () => {
             isGlobalWorkflowRunning = true;
             systemStatus.isProcessing = true;
             for (let i = 0; i < filteredRows.length; i++) {
                 const setup = filteredRows[i].setup_name || '';
                 const tfString = filteredRows[i].training_timeframe || '';
                 let t = 'Last 1 Year';
                 let f = '1d';
                 if (tfString.includes(' / ')) {
                     const parts = tfString.split(' / ');
                     t = parts[0];
                     f = parts[1];
                 } else {
                     t = tfString;
                 }
                 
                 systemStatus.stage = `Daily Scanner ${i+1}/${filteredRows.length}: ${setup} (${t} / ${f})`;
                 systemStatus.progress = Math.round((i / filteredRows.length) * 100);
                 
                 try {
                     systemStatus.isProcessing = false;
                     if (setup.includes('Time Series') || setup.includes('TS Multi')) {
                         await runTimeSeriesTraining(symbols, { timeframe: t, frequency: f, isShortTerm: true });
                     } else if (setup.includes('Signals [') || (!setup.includes('Time Series') && !setup.includes('TS Multi') && setup !== 'Learning Trend' && setup !== 'Pattern Search')) {
                         await runSignalsTraining(symbols, { timeframe: t, frequency: f, isShortTerm: true });
                     } else if (setup === 'Learning Trend') {
                         await runLearningTrendTraining(symbols, { timeframe: t, frequency: f, isShortTerm: true });
                     } else {
                         await runFullWorkflow(symbols, { indicators, timeframe: t, frequency: f, isShortTerm: true });
                     }
                     systemStatus.isProcessing = true;
                 } catch(err) {
                     console.error(`Error scanning short term for ${setup} ${tfString}:`, err);
                 }
	     }
             isGlobalWorkflowRunning = false;
             systemStatus.isProcessing = false;
             systemStatus.stage = 'Idle';
             systemStatus.progress = 100;
             systemStatus.details = 'PRO AUTO short-term scan complete';
         };
         runProAutoScanner().catch(console.error);
         res.json({ status: 'started' });
         return;
      }
      
      const rows = db.prepare("SELECT DISTINCT setup_name FROM trained_patterns").all() as any[];
      const setups = rows.map((r: any) => r.setup_name || '');
      
      const hasTimeSeries = setups.some((s: string) => s.includes('Time Series') || s.includes('TS Multi')) && (!selectedModels || selectedModels.includes('timeseries'));
      const hasLearningTrend = setups.some((s: string) => s === 'Learning Trend') && (!selectedModels || selectedModels.includes('learning_trend'));
      const hasBasic = setups.some((s: string) => s === 'Pattern Search') && (!selectedModels || selectedModels.includes('pattern'));
      const hasSignals = setups.some((s: string) => !s.includes('Time Series') && !s.includes('TS Multi') && s !== 'Learning Trend' && s !== 'Pattern Search') && (!selectedModels || selectedModels.includes('signals'));

      db.prepare("DELETE FROM scanner_results").run();

      (async () => {
         try {
             isGlobalWorkflowRunning = true;

             // Dynamic real-time data sync before scanning starts
             const syncInterval = frequency === '15m' ? '15m' : (frequency === '1m' ? '1m' : '1h');
             systemStatus.isProcessing = true;
             systemStatus.stage = `Syncing real-time market data (${syncInterval})...`;
             await syncRealData(symbols, syncInterval, timeframe);
             if (hasBasic) {
                systemStatus.isProcessing = false;
                systemStatus.stage = 'Running Basic Patterns';
                await runFullWorkflow(symbols, { indicators, timeframe, frequency, isShortTerm: true });
             }
             if (hasLearningTrend) {
                systemStatus.isProcessing = false;
                systemStatus.stage = 'Running Learning Trend';
                await runLearningTrendTraining(symbols, { timeframe, frequency, isShortTerm: true });
             }
             if (hasTimeSeries) {
                systemStatus.isProcessing = false;
                systemStatus.stage = 'Running Time Series';
                await runTimeSeriesTraining(symbols, { timeframe, frequency, isShortTerm: true });
             }
             if (hasSignals) {
                systemStatus.isProcessing = false;
                systemStatus.stage = 'Running Signals';
                await runSignalsTraining(symbols, { timeframe, frequency, isShortTerm: true });
             }
         } catch(e) {
             console.error(e);
         } finally {
             isGlobalWorkflowRunning = false;
             systemStatus.isProcessing = false;
             systemStatus.stage = 'Idle';
             systemStatus.progress = 100;
             systemStatus.details = 'Scan complete';
         }
      })();

      res.json({ status: 'started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ensemble/results', (req, res) => {
    try {
      const results = systemStatus.ensembleAggregatedResults || [];
      if (results.length === 0) return res.json([]);
      
      const symbols = db.prepare('SELECT symbol, name FROM symbols').all() as any[];
      const nameMap = new Map(symbols.map(s => [s.symbol, s.name]));
      
      const enriched = results.map(r => ({
        ...r,
        name: nameMap.get(r.symbol) || r.symbol
      }));
      
      res.json(enriched);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/strategy/short-term', async (req, res) => {
    try {
      const interval = (req.query.interval as string) || '1h';
      const includeCrypto = req.query.includeCrypto === 'true';
      
      let symbols = db.prepare('SELECT * FROM symbols ORDER BY sector, symbol').all() as any[];
      if (includeCrypto) {
        const cryptos = [
          { symbol: 'BTC-USD', name: 'Bitcoin', sector: 'Cryptocurrency' },
          { symbol: 'ETH-USD', name: 'Ethereum', sector: 'Cryptocurrency' },
          { symbol: 'SOL-USD', name: 'Solana', sector: 'Cryptocurrency' },
          { symbol: 'BNB-USD', name: 'Binance Coin', sector: 'Cryptocurrency' },
          { symbol: 'XRP-USD', name: 'Ripple', sector: 'Cryptocurrency' },
          { symbol: 'ADA-USD', name: 'Cardano', sector: 'Cryptocurrency' },
          { symbol: 'DOGE-USD', name: 'Dogecoin', sector: 'Cryptocurrency' },
          { symbol: 'AVAX-USD', name: 'Avalanche', sector: 'Cryptocurrency' },
          { symbol: 'LINK-USD', name: 'Chainlink', sector: 'Cryptocurrency' },
          { symbol: 'DOT-USD', name: 'Polkadot', sector: 'Cryptocurrency' },
          { symbol: 'HYPE-USD', name: 'Hype', sector: 'Cryptocurrency' },
          { symbol: 'ONDO-USD', name: 'Ondo', sector: 'Cryptocurrency' },
          { symbol: 'TAO-USD', name: 'Bittensor', sector: 'Cryptocurrency' },
          { symbol: 'NEAR-USD', name: 'Near Protocol', sector: 'Cryptocurrency' },
          { symbol: 'RENDER-USD', name: 'Render', sector: 'Cryptocurrency' },
          { symbol: 'AAVE-USD', name: 'Aave', sector: 'Cryptocurrency' },
          { symbol: 'SUI-USD', name: 'Sui', sector: 'Cryptocurrency' },
          { symbol: 'PENDLE-USD', name: 'Pendle', sector: 'Cryptocurrency' },
          { symbol: 'AERO-USD', name: 'Aerodrome Finance', sector: 'Cryptocurrency' },
          { symbol: 'TRX-USD', name: 'TRON', sector: 'Cryptocurrency' },
          { symbol: 'TON-USD', name: 'The Open Network', sector: 'Cryptocurrency' },
          { symbol: 'HBAR-USD', name: 'Hedera', sector: 'Cryptocurrency' },
          { symbol: 'MNT-USD', name: 'Mantle', sector: 'Cryptocurrency' },
          { symbol: 'INJ-USD', name: 'Injective', sector: 'Cryptocurrency' },
          { symbol: 'JUP-USD', name: 'Jupiter', sector: 'Cryptocurrency' },
          { symbol: 'PYTH-USD', name: 'Pyth Network', sector: 'Cryptocurrency' },
          { symbol: 'JTO-USD', name: 'Jito', sector: 'Cryptocurrency' },
          { symbol: 'UNI-USD', name: 'Uniswap', sector: 'Cryptocurrency' },
          { symbol: 'MORPHO-USD', name: 'Morpho', sector: 'Cryptocurrency' },
          { symbol: 'ENA-USD', name: 'Ethena', sector: 'Cryptocurrency' },
          { symbol: 'LDO-USD', name: 'Lido DAO', sector: 'Cryptocurrency' },
          { symbol: 'EIGEN-USD', name: 'EigenLayer', sector: 'Cryptocurrency' },
          { symbol: 'ARB-USD', name: 'Arbitrum', sector: 'Cryptocurrency' },
          { symbol: 'OP-USD', name: 'Optimism', sector: 'Cryptocurrency' },
          { symbol: 'SEI-USD', name: 'Sei', sector: 'Cryptocurrency' },
          { symbol: 'APT-USD', name: 'Aptos', sector: 'Cryptocurrency' },
          { symbol: 'ICP-USD', name: 'Internet Computer', sector: 'Cryptocurrency' },
          { symbol: 'FIL-USD', name: 'Filecoin', sector: 'Cryptocurrency' },
          { symbol: 'KAS-USD', name: 'Kaspa', sector: 'Cryptocurrency' },
          { symbol: 'ATOM-USD', name: 'Cosmos', sector: 'Cryptocurrency' },
          { symbol: 'ZEC-USD', name: 'Zcash', sector: 'Cryptocurrency' },
          { symbol: 'XMR-USD', name: 'Monero', sector: 'Cryptocurrency' },
          { symbol: 'WLD-USD', name: 'Worldcoin', sector: 'Cryptocurrency' },
          { symbol: 'VIRTUAL-USD', name: 'Virtual Protocol', sector: 'Cryptocurrency' },
          { symbol: 'FET-USD', name: 'Artificial Superintelligence Alliance', sector: 'Cryptocurrency' },
          { symbol: 'AKT-USD', name: 'Akash Network', sector: 'Cryptocurrency' },
          { symbol: 'GRASS-USD', name: 'Grass', sector: 'Cryptocurrency' },
          { symbol: 'AIOZ-USD', name: 'AIOZ Network', sector: 'Cryptocurrency' },
          { symbol: 'IO-USD', name: 'io.net', sector: 'Cryptocurrency' },
          { symbol: 'STX-USD', name: 'Stacks', sector: 'Cryptocurrency' }
        ];
        const symbolsMap = new Set(symbols.map(s => s.symbol));
        const filteredCryptos = cryptos.filter(c => !symbolsMap.has(c.symbol));
        symbols = [...symbols, ...filteredCryptos];
      }
      const symbolNames = symbols.map(s => s.symbol);
      
      // Pre-sync fresh live real-time market data before evaluating conditions
      try {
        await syncRealData(symbolNames, interval, 'Last 3 Months');
      } catch (syncErr) {
        console.warn("Failed to pre-sync real-time data for short-term strategy:", syncErr);
      }
      
      const analyzedTickers: any[] = [];
      
      for (const symObj of symbols) {
        const sym = symObj.symbol;
        
        const bars = db.prepare('SELECT * FROM ohlcv WHERE symbol = ? AND interval = ? ORDER BY datetime ASC').all(sym, interval) as any[];
        if (bars.length < 20) {
          continue;
        }
        
        const features = calculateFeatures(bars);
        const latestFeature = features[features.length - 1];
        const prevFeature = features[features.length - 2] || latestFeature;
        
        const currentPrice = latestFeature.bar.close;
        const lastClose = latestFeature.bar.close;
        const openPrice = latestFeature.bar.open;
        const highPrice = latestFeature.bar.high;
        const lowPrice = latestFeature.bar.low;
        const currentVolume = latestFeature.bar.volume;
        const avgVolume = latestFeature.volSma20 || 1;
        const relVol = currentVolume / avgVolume;
        const atrVal = latestFeature.atr14 || (currentPrice * 0.02);
        
        const closes = bars.map(b => b.close);
        const ema9Values = ema(closes, 9);
        const ema9Val = ema9Values[ema9Values.length - 1];
        
        let totalPV = 0;
        let totalV = 0;
        const vwapValues = bars.map(b => {
          const tp = (b.high + b.low + b.close) / 3;
          totalPV += tp * b.volume;
          totalV += b.volume;
          return totalV > 0 ? totalPV / totalV : b.close;
        });
        const vwapVal = vwapValues[vwapValues.length - 1];
        
        const depth = generateMarketDepth(currentPrice, sym);
        
        const bidDepth = depth.bids.reduce((sum, b) => sum + b.size, 0);
        const askDepth = depth.asks.reduce((sum, a) => sum + a.size, 0);
        const obi = bidDepth / (bidDepth + askDepth || 1);
        
        const spreadPct = depth.spread / currentPrice;
        let spreadQuality = "ELEVATO (EVITARE)";
        if (spreadPct <= 0.002) spreadQuality = "OTTIMALE";
        else if (spreadPct <= 0.003) spreadQuality = "ACCETTABILE";
        
        let scoreLong = 0;
        const checklistLong: { label: string; checked: boolean }[] = [];
        
        // --- 1. Trend Tecnico (Max 25 pts) ---
        let trendPtsLong = 0;
        const isPriceAboveEma9 = currentPrice > ema9Val;
        const isPriceAboveEma20 = currentPrice > latestFeature.ema20;
        const isPriceAboveEma50 = currentPrice > latestFeature.ema50;
        const isPriceAboveVwap = currentPrice > vwapVal;
        const isSupertrendBullish = (latestFeature.supertrendDir as any) === 1 || (latestFeature.supertrendDir as any) === 'bullish' || (latestFeature.supertrendDir as any) === 'buy'; 
        const isAdxStrong = latestFeature.adx > 20 && (latestFeature.adx > prevFeature.adx);
        
        if (isPriceAboveEma9 && isPriceAboveEma20) trendPtsLong += 5;
        if (isPriceAboveEma50) trendPtsLong += 5;
        if (isPriceAboveVwap) trendPtsLong += 5;
        if (isSupertrendBullish) trendPtsLong += 5;
        if (isAdxStrong) trendPtsLong += 5;
        scoreLong += trendPtsLong;
        
        checklistLong.push({ label: "Trend Tecnico favorevole (EMA 9/20, VWAP, Supertrend)", checked: trendPtsLong >= 15 });
        checklistLong.push({ label: "Prezzo sopra VWAP", checked: isPriceAboveVwap });
        checklistLong.push({ label: "ADX > 20 e crescente per forza trend", checked: isAdxStrong });
        
        // --- 2. Volume (Max 15 pts) ---
        let volPtsLong = 0;
        if (relVol >= 2.0) volPtsLong = 15;
        else if (relVol >= 1.5) volPtsLong = 10;
        else if (relVol >= 1.0) volPtsLong = 5;
        scoreLong += volPtsLong;
        
        checklistLong.push({ label: "Volume Relativo > 1.5x rispetto alla media", checked: relVol >= 1.5 });
        
        // --- 3. Book Imbalance (Max 15 pts) ---
        let obiPtsLong = 0;
        if (obi >= 0.75) obiPtsLong = 15;
        else if (obi >= 0.65) obiPtsLong = 10;
        else if (obi >= 0.55) obiPtsLong = 5;
        scoreLong += obiPtsLong;
        
        checklistLong.push({ label: "Prevalenza Acquirenti nel Book (OBI > 55%)", checked: obi >= 0.55 });
        checklistLong.push({ label: "Book Imbalance Forte (OBI > 65% o 75%)", checked: obi >= 0.65 });
        
        // --- 4. Absorption (Max 20 pts) ---
        const isNearResistance = (depth.resistancePrice - currentPrice) / currentPrice < 0.01;
        const isAbsorbingBull = isNearResistance && obi >= 0.65;
        let absorbPtsLong = 0;
        if (isAbsorbingBull) absorbPtsLong = 20;
        else if (isNearResistance) absorbPtsLong = 10;
        scoreLong += absorbPtsLong;
        
        checklistLong.push({ label: "Prezzo vicino a Resistenza L2 per rottura", checked: isNearResistance });
        checklistLong.push({ label: "Assorbimento Bullish confermato (OBI alto vicino a resistenza)", checked: isAbsorbingBull });
        
        // --- 5. Breakout / Retest (Max 15 pts) ---
        const isBreakoutLong = currentPrice >= depth.resistancePrice || currentPrice > prevFeature.bar.high;
        const isRetestLong = lastClose > depth.resistancePrice && (highPrice - depth.resistancePrice) / depth.resistancePrice < 0.02;
        let breakoutPtsLong = 0;
        if (isRetestLong) breakoutPtsLong = 15;
        else if (isBreakoutLong) breakoutPtsLong = 10;
        scoreLong += breakoutPtsLong;
        
        checklistLong.push({ label: "Breakout L2 confermato", checked: isBreakoutLong });
        checklistLong.push({ label: "Retest positivo del livello rotto", checked: isRetestLong });
        
        // --- 6. Risk / Reward (Max 10 pts) ---
        const entryLong = currentPrice;
        const stopLong = currentPrice - Math.max(1.5 * atrVal, currentPrice * 0.015);
        const targetLong = currentPrice + Math.max(3.0 * atrVal, currentPrice * 0.04);
        const rrLong = (targetLong - entryLong) / (entryLong - stopLong || 1);
        let rrPtsLong = 0;
        if (rrLong >= 2.0) rrPtsLong = 10;
        else if (rrLong >= 1.5) rrPtsLong = 5;
        scoreLong += rrPtsLong;
        
        checklistLong.push({ label: "Rapporto Rischio/Rendimento >= 1:1.5", checked: rrLong >= 1.5 });
        checklistLong.push({ label: "Liquidità minima e Spread accettabile (<0.3%)", checked: spreadPct <= 0.003 });
        
        let scoreShort = 0;
        const checklistShort: { label: string; checked: boolean }[] = [];
        
        // --- 1. Trend Tecnico (Max 25 pts) ---
        let trendPtsShort = 0;
        const isPriceBelowEma9 = currentPrice < ema9Val;
        const isPriceBelowEma20 = currentPrice < latestFeature.ema20;
        const isPriceBelowEma50 = currentPrice < latestFeature.ema50;
        const isPriceBelowVwap = currentPrice < vwapVal;
        const isSupertrendBearish = (latestFeature.supertrendDir as any) === -1 || (latestFeature.supertrendDir as any) === 'bearish' || (latestFeature.supertrendDir as any) === 'sell';
        
        if (isPriceBelowEma9 && isPriceBelowEma20) trendPtsShort += 5;
        if (isPriceBelowEma50) trendPtsShort += 5;
        if (isPriceBelowVwap) trendPtsShort += 5;
        if (isSupertrendBearish) trendPtsShort += 5;
        if (isAdxStrong) trendPtsShort += 5;
        scoreShort += trendPtsShort;
        
        checklistShort.push({ label: "Trend Tecnico debole (EMA, VWAP, Supertrend)", checked: trendPtsShort >= 15 });
        checklistShort.push({ label: "Prezzo sotto VWAP", checked: isPriceBelowVwap });
        checklistShort.push({ label: "ADX > 20 e crescente per forza trend", checked: isAdxStrong });
        
        // --- 2. Volume (Max 15 pts) ---
        let volPtsShort = 0;
        const isDownBar = currentPrice < openPrice;
        if (relVol >= 2.0 && isDownBar) volPtsShort = 15;
        else if (relVol >= 1.5) volPtsShort = 10;
        else if (relVol >= 1.0) volPtsShort = 5;
        scoreShort += volPtsShort;
        
        checklistShort.push({ label: "Volume in aumento sulla discesa", checked: relVol >= 1.5 && isDownBar });
        
        // --- 3. Book Imbalance (Max 15 pts) ---
        let obiPtsShort = 0;
        if (obi <= 0.25) obiPtsShort = 15;
        else if (obi <= 0.35) obiPtsShort = 10;
        else if (obi <= 0.45) obiPtsShort = 5;
        scoreShort += obiPtsShort;
        
        checklistShort.push({ label: "Prevalenza Venditori nel Book (OBI < 45%)", checked: obi <= 0.45 });
        checklistShort.push({ label: "Book Imbalance Forte (OBI < 35% o 25%)", checked: obi <= 0.35 });
        
        // --- 4. Absorption (Max 20 pts) ---
        const isNearSupport = (currentPrice - depth.supportPrice) / currentPrice < 0.01;
        const isAbsorbingBear = isNearSupport && obi <= 0.35;
        let absorbPtsShort = 0;
        if (isAbsorbingBear) absorbPtsShort = 20;
        else if (isNearSupport) absorbPtsShort = 10;
        scoreShort += absorbPtsShort;
        
        checklistShort.push({ label: "Prezzo vicino a Supporto L2 per rottura", checked: isNearSupport });
        checklistShort.push({ label: "Assorbimento Bearish confermato (OBI basso vicino a supporto)", checked: isAbsorbingBear });
        
        // --- 5. Breakout / Retest (Max 15 pts) ---
        const isBreakdownShort = currentPrice <= depth.supportPrice || currentPrice < prevFeature.bar.low;
        const isRetestShort = lastClose < depth.supportPrice && (depth.supportPrice - lowPrice) / depth.supportPrice < 0.02;
        let breakoutPtsShort = 0;
        if (isRetestShort) breakoutPtsShort = 15;
        else if (isBreakdownShort) breakoutPtsShort = 10;
        scoreShort += breakoutPtsShort;
        
        checklistShort.push({ label: "Breakdown L2 confermato", checked: isBreakdownShort });
        checklistShort.push({ label: "Retest / pull-up fallito sotto il supporto", checked: isRetestShort });
        
        // --- 6. Risk / Reward (Max 10 pts) ---
        const entryShort = currentPrice;
        const stopShort = currentPrice + Math.max(1.5 * atrVal, currentPrice * 0.015);
        const targetShort = currentPrice - Math.max(3.0 * atrVal, currentPrice * 0.04);
        const rrShort = (entryShort - targetShort) / (stopShort - entryShort || 1);
        let rrPtsShort = 0;
        if (rrShort >= 2.0) rrPtsShort = 10;
        else if (rrShort >= 1.5) rrPtsShort = 5;
        scoreShort += rrPtsShort;
        
        checklistShort.push({ label: "Rapporto Rischio/Rendimento >= 1:1.5", checked: rrShort >= 1.5 });
        checklistShort.push({ label: "Liquidità minima e Spread accettabile (<0.3%)", checked: spreadPct <= 0.003 });
        
        const isBullishDominant = scoreLong >= scoreShort;
        const finalScore = isBullishDominant ? scoreLong : scoreShort;
        const action = finalScore >= 65 ? (isBullishDominant ? "BUY" : "SELL") : "NEUTRAL";
        const side = isBullishDominant ? "LONG" : "SHORT";
        const trigger = isBullishDominant ? "Breakout Resistenza L2 + Assorbimento Ask" : "Breakdown Supporto L2 + Assorbimento Bid";
        const checklist = isBullishDominant ? checklistLong : checklistShort;
        
        let scoreStatus = "EVITARE (No Trade)";
        if (finalScore >= 85) scoreStatus = "Setup Molto Forte";
        else if (finalScore >= 75) scoreStatus = "Setup Valido";
        else if (finalScore >= 65) scoreStatus = "Alta Volatilità (Size Ridotta)";
        
        const lastRsi = latestFeature.rsi14;
        const lastAdx = latestFeature.adx;
        const lastAtr = latestFeature.atr14;
        const isRsiOk = isBullishDominant ? (lastRsi >= 45 && lastRsi <= 70) : (lastRsi <= 55 && lastRsi >= 30);
        
        analyzedTickers.push({
          symbol: sym,
          name: symObj.name,
          sector: symObj.sector,
          currentPrice,
          close: currentPrice,
          open: openPrice,
          high: highPrice,
          low: lowPrice,
          volume: currentVolume,
          avgVolume,
          relativeVolume: relVol,
          obi,
          spread: depth.spread,
          spreadPct,
          spreadQuality,
          supportPrice: depth.supportPrice,
          resistancePrice: depth.resistancePrice,
          depth,
          scoreLong,
          scoreShort,
          finalScore,
          action,
          side,
          trigger,
          scoreStatus,
          entryPrice: isBullishDominant ? entryLong : entryShort,
          stopPrice: isBullishDominant ? stopLong : stopShort,
          targetPrice: isBullishDominant ? targetLong : targetShort,
          riskReward: isBullishDominant ? rrLong : rrShort,
          atr: lastAtr,
          rsi: lastRsi,
          rsiStatus: isRsiOk ? "Ottimale" : "Esteso / Debole",
          adx: lastAdx,
          supertrend: latestFeature.supertrend,
          supertrendDir: latestFeature.supertrendDir,
          ema9: ema9Val,
          ema20: latestFeature.ema20,
          ema50: latestFeature.ema50,
          vwap: vwapVal,
          holdingPeriod: "1-5 Giorni",
          checklist
        });
      }
      
      analyzedTickers.sort((a, b) => b.finalScore - a.finalScore);
      res.json(analyzedTickers);
    } catch (e: any) {
      console.error("Strategy Analyzer Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ticker/:symbol/analysis', (req, res) => {
    const symbol = req.params.symbol;
    try {
      const interval = (req.query.interval as string) || '1d';
      const bars = db.prepare('SELECT * FROM ohlcv WHERE symbol = ? AND interval = ? ORDER BY datetime ASC').all(symbol, interval) as any[];
      if (bars.length === 0) {
        return res.status(404).json({ error: "Symbol not found or data not synced" });
      }

      // Latest features/indicators
      const ohlcvFeatures = calculateFeatures(bars);
      
      const latestObj = db.prepare('SELECT MAX(date) as max_date FROM scanner_results WHERE symbol = ?').get(symbol) as {max_date: string};
      const setups = latestObj?.max_date ? db.prepare('SELECT * FROM scanner_results WHERE symbol = ? AND date = ?').all(symbol, latestObj.max_date) : [];

      res.json({
        symbol,
        bars: ohlcvFeatures,
        active_setups: setups
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/teaching/network', (req, res) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('lead_lag_network') as { value: string } | undefined;
      if (row?.value) {
        return res.json(JSON.parse(row.value));
      }
      res.json({ timeRange: '1y', frequency: '1d', symbols: [], results: { masters: [], edges: [] } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/teaching/network', async (req, res) => {
    try {
        const { timeRange, frequency, symbols } = req.body;
        const results = await analyzeLeadLagNetwork({ timeRange, frequency, symbols });
        
        // Persist to SQLite so settings & trained model memory is never lost
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('lead_lag_network', JSON.stringify({ timeRange, frequency, symbols, results }));

        res.json(results);
    } catch(e: any) {
        console.error("Network Teaching Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/teaching/live_signals', async (req, res) => {
    try {
        const { edges, lookbackHours } = req.body;
        if (!edges || edges.length === 0) {
             return res.json([]);
        }
        const results = await analyzeLiveSignals({ edges, lookbackHours });
        res.json(results);
    } catch(e: any) {
        console.error("Live Signals Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/monitor', async (req, res) => {
    try {
        const { symbols, interval } = req.body;
        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return res.json([]);
        }
        const results = await processRealTimeMonitor(symbols, interval || '1d');
        const enriched = results.map(r => {
            if (r && r.price) {
                const depth = generateMarketDepth(r.price, r.symbol || 'STOCK');
                return {
                    ...r,
                    supportPrice: depth.supportPrice,
                    resistancePrice: depth.resistancePrice,
                    orderBook: depth
                };
            }
            return r;
        });
        res.json(enriched);
    } catch(e: any) {
        console.error("Monitor API Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/monitor/scan', async (req, res) => {
    try {
        const { interval, includeCrypto } = req.body;
        const results = await processLocalMonitorScan(interval || '1d', !!includeCrypto);
        const enriched = results.map(r => {
            if (r && r.price) {
                const depth = generateMarketDepth(r.price, r.symbol || 'STOCK');
                return {
                    ...r,
                    supportPrice: depth.supportPrice,
                    resistancePrice: depth.resistancePrice,
                    orderBook: depth
                };
            }
            return r;
        });
        res.json(enriched);
    } catch(e: any) {
        console.error("Monitor Scan API Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  const quoteCache = new Map<string, { price: number; timestamp: number }>();
  const QUOTE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache lifetime

  app.get('/api/quotes', async (req, res) => {
    try {
        const symbolQuery = req.query.symbols as string;
        if (!symbolQuery) return res.json([]);
        const symbols = symbolQuery.split(',');
        
        const now = Date.now();
        const results = await Promise.all(symbols.map(async sym => {
            const cleanSym = sym.trim();
            if (!cleanSym) return { symbol: sym, price: null };

            // Check Cache first
            const cached = quoteCache.get(cleanSym);
            if (cached && (now - cached.timestamp) < QUOTE_CACHE_TTL && cached.price !== null) {
                return { symbol: sym, price: cached.price, cached: true };
            }

            try {
                let querySym = cleanSym;
                if (querySym.includes('.') && !querySym.endsWith('.MI') && !querySym.endsWith('.L') && !querySym.endsWith('.DE') && !querySym.endsWith('.AS') && !querySym.endsWith('.PA') && !querySym.endsWith('.TO') && !querySym.endsWith('.WA')) {
                    querySym = querySym.replace(/\./g, '-');
                }
                
                const quote = await getCachedQuote(cleanSym);
                const price = quote?.regularMarketPrice || quote?.postMarketPrice || (quote as any)?.price || null;
                
                if (price !== null) {
                    quoteCache.set(cleanSym, { price, timestamp: now });
                }
                return { symbol: sym, price };
            } catch(e: any) {
                console.error(`Quote error for ${cleanSym}:`, e);
                
                if (cached) {
                    return { symbol: sym, price: cached.price, cached: true, error: e.message || String(e) };
                }

                try {
                    const row = db.prepare('SELECT close FROM ensemble_ohlcv WHERE symbol = ? ORDER BY timestamp_utc DESC LIMIT 1').get(cleanSym) as { close?: number } | undefined;
                    if (row?.close) {
                        return { symbol: sym, price: row.close, fallbackDb: true };
                    }
                } catch (dbErr) {
                    // ignore
                }

                let mockPrice = null;
                if (cleanSym === 'NVDA') mockPrice = 120;
                else if (cleanSym === 'SPY') mockPrice = 520;
                else if (cleanSym === 'QQQ') mockPrice = 450;
                else if (cleanSym === 'AAPL') mockPrice = 190;
                else if (cleanSym === 'MSFT') mockPrice = 420;
                else if (cleanSym === 'TLT') mockPrice = 90;
                else if (cleanSym === 'IWM') mockPrice = 200;

                if (mockPrice !== null) {
                    return { symbol: sym, price: mockPrice, mock: true };
                }

                return { symbol: sym, price: null, error: e.message || String(e) };
            }
        }));
        res.json(results);
    } catch(e: any) {
        console.error("Quotes API Error:", e);
        res.status(500).json({ error: e.message });
    }
  });

  // --- ADVANCED GROWTH LORIS ENDPOINTS ---
  app.get('/api/loris/settings', (req, res) => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('loris_settings') as { value: string };
      if (row?.value) {
        return res.json(JSON.parse(row.value));
      }
      res.json(DEFAULT_LORIS_SETTINGS);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loris/settings', (req, res) => {
    try {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('loris_settings', JSON.stringify(req.body));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loris/train', async (req, res) => {
    try {
      if (systemStatus.isProcessing) {
        return res.status(409).json({ error: 'System processing is busy. Please let other processes complete.' });
      }
      const symbols = req.body.symbols || DEFAULT_LORIS_SETTINGS.symbols;
      const options = req.body.settings || DEFAULT_LORIS_SETTINGS;
      runAdvancedLorisTeaching(symbols, options).catch(console.error);
      res.json({ status: 'started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loris/scan', async (req, res) => {
    try {
      if (systemStatus.isProcessing) {
        return res.status(409).json({ error: 'System processing is busy.' });
      }
      const symbols = req.body.symbols || DEFAULT_LORIS_SETTINGS.symbols;
      const options = req.body.settings || DEFAULT_LORIS_SETTINGS;
      runAdvancedLorisScan(symbols, options).catch(console.error);
      res.json({ status: 'started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loris/predictions', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT p1.*
        FROM advanced_predictions p1
        INNER JOIN (
            SELECT symbol, MAX(id) as max_id
            FROM advanced_predictions
            GROUP BY symbol
        ) p2 ON p1.id = p2.max_id
        ORDER BY score DESC, expected_gain_percent DESC, probability_1w DESC
      `).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loris/export', (req, res) => {
    try {
      const dbTrained = db.prepare('SELECT * FROM trained_patterns').all();
      const ensembleModels = db.prepare('SELECT * FROM ensemble_models').all();
      const settings = db.prepare('SELECT * FROM settings').all();
      const advancedModelsMemory = exportGlobalLorisModels();
      
      const payload = {
         trained_patterns: dbTrained,
         ensemble_models: ensembleModels,
         settings: settings,
         loris_memory: advancedModelsMemory
      };
      
      res.json(payload);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loris/import', (req, res) => {
    try {
      const data = req.body;
      if (!data) return res.status(400).json({error: 'No data provided'});

      if (data.trained_patterns && Array.isArray(data.trained_patterns)) {
         db.prepare('DELETE FROM trained_patterns').run();
         const validCols = ['symbol', 'setup_name', 'training_timeframe', 'patternsFound', 'winRate', 'avgExpectancy', 'avgBullMove', 'avgBearMove', 'sampleSize', 'teachingQuality', 'modelFittingPerformance'];
         for (let r of data.trained_patterns) {
            const rowToInsert: any = {};
            rowToInsert.symbol = r.symbol;
            rowToInsert.setup_name = r.setup_name || 'Pattern Search';
            rowToInsert.training_timeframe = r.training_timeframe || 'Last 1 Year / 1d';
            rowToInsert.patternsFound = r.patternsFound !== undefined ? r.patternsFound : 0;
            rowToInsert.winRate = r.winRate !== undefined ? r.winRate : 0.0;
            rowToInsert.avgExpectancy = r.avgExpectancy !== undefined ? r.avgExpectancy : (r.averageGain !== undefined ? r.averageGain : 0.0);
            rowToInsert.avgBullMove = r.avgBullMove !== undefined ? r.avgBullMove : (r.probabilityThreshold !== undefined ? r.probabilityThreshold : 0.0);
            rowToInsert.avgBearMove = r.avgBearMove !== undefined ? r.avgBearMove : 0.0;
            rowToInsert.sampleSize = r.sampleSize !== undefined ? r.sampleSize : 0;
            rowToInsert.teachingQuality = r.teachingQuality !== undefined ? r.teachingQuality : 0.0;
            rowToInsert.modelFittingPerformance = r.modelFittingPerformance !== undefined ? r.modelFittingPerformance : 0.0;

            const keys = Object.keys(rowToInsert).filter(k => validCols.includes(k));
            const placeholders = keys.map(() => '?').join(', ');
            const sql = `INSERT INTO trained_patterns (${keys.join(', ')}) VALUES (${placeholders})`;
            db.prepare(sql).run(...keys.map(k => rowToInsert[k]));
         }
      }
      
      if (data.ensemble_models && Array.isArray(data.ensemble_models)) {
         db.prepare('DELETE FROM ensemble_models').run();
         const validCols = ['modelId', 'provider', 'interval', 'trainingPeriod', 'featureVersion', 'createdAt', 'barsUsed', 'patternsStored', 'minSampleSize', 'horizonBars', 'description'];
         for (let r of data.ensemble_models) {
            const rowToInsert: any = {};
            rowToInsert.modelId = r.modelId || r.symbol + '_' + (r.timeframe || '1d');
            rowToInsert.provider = r.provider || 'yahoo';
            rowToInsert.interval = r.interval || r.timeframe || '1d';
            rowToInsert.trainingPeriod = r.trainingPeriod || 'Last 1 Year';
            rowToInsert.featureVersion = r.featureVersion || '1.0';
            rowToInsert.createdAt = r.createdAt || new Date().toISOString();
            rowToInsert.barsUsed = r.barsUsed || 250;
            rowToInsert.patternsStored = r.patternsStored || r.patternsFound || (r.rf_model_json ? 1 : 0);
            rowToInsert.minSampleSize = r.minSampleSize || 30;
            rowToInsert.horizonBars = r.horizonBars || 20;
            rowToInsert.description = r.description || r.performance_json || '';

            const keys = Object.keys(rowToInsert).filter(k => validCols.includes(k));
            const placeholders = keys.map(() => '?').join(', ');
            const sql = `INSERT INTO ensemble_models (${keys.join(', ')}) VALUES (${placeholders})`;
            db.prepare(sql).run(...keys.map(k => rowToInsert[k]));
         }
      }
      
      if (data.settings) {
         const ins = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
         for (let r of data.settings) {
             ins.run(r.key, r.value);
         }
      }
      
      if (data.loris_memory) {
         loadGlobalLorisModels(data.loris_memory);
      }
      
      res.json({status: 'success'});
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loris/runs', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM advanced_model_runs ORDER BY created_at DESC').all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loris/importance', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM advanced_feature_importance ORDER BY importance_score DESC').all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loris/events', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM advanced_growth_events ORDER BY max_gain_percent DESC').all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- FOREX LIQUIDITY API ENDPOINTS ---

  // GET /api/market/candles
  app.get('/api/market/candles', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'EUR/USD';
      const timeframe = (req.query.timeframe as string) || 'M5';
      const providerType = (req.query.provider as string) || 'YAHOO';
      
      const to = new Date();
      const from = new Date();
      const lookbackDays = timeframe === 'M1' ? 4 : 7;
      from.setDate(from.getDate() - lookbackDays);

      const provider = getProvider(providerType);
      const candles = await provider.getCandles(symbol, timeframe, from, to);
      
      res.json({
        symbol,
        timeframe,
        candles
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/market/price
  app.get('/api/market/price', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'EUR/USD';
      const providerType = (req.query.provider as string) || 'YAHOO';
      const provider = getProvider(providerType);
      const priceData = await provider.getLatestPrice(symbol);
      res.json(priceData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/market/news
  app.get('/api/market/news', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'EUR/USD';
      // Returns high-quality simulated news announcements to test blocking rules
      const rand = Math.random();
      const blocked = rand < 0.15; // 15% probability of news event
      
      const eventNames = [
        'FOMC Interest Rate Decision',
        'US Non-Farm Payrolls (NFP)',
        'ECB Monetary Policy Statement',
        'UK CPI YoY Inflation',
        'US Retail Sales MoM'
      ];
      const eventName = eventNames[Math.floor(Math.random() * eventNames.length)];
      
      res.json({
        symbol,
        blocked,
        impact: blocked ? 'HIGH' : 'LOW',
        eventName: blocked ? eventName : 'None',
        eventTime: new Date(Date.now() + 10 * 60000).toISOString(),
        minutesToEvent: blocked ? 10 : 0
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/liquidity/analyze
  app.post('/api/liquidity/analyze', async (req, res) => {
    try {
      const { symbols, timeframe, config } = req.body;
      if (!symbols || !Array.isArray(symbols)) {
        res.status(400).json({ error: 'Symbols array is required' });
        return;
      }
      
      const results = await scanLiquidity(symbols, timeframe || 'M5', config || {});
      res.json({
        scanTime: new Date().toISOString(),
        results
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/liquidity/explain
  app.post('/api/liquidity/explain', async (req, res) => {
    try {
      const { signal } = req.body;
      if (!signal) {
        res.status(400).json({ error: 'Signal data is required' });
        return;
      }
      const explanation = await generateAiExplanation(signal);
      res.json(explanation);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/liquidity/logs
  app.post('/api/liquidity/logs', async (req, res) => {
    try {
      const log = req.body;
      const success = saveBacktestLog(log);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/liquidity/logs
  app.get('/api/liquidity/logs', async (req, res) => {
    try {
      const logs = getBacktestLogs();
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/liquidity/logs/:id
  app.delete('/api/liquidity/logs/:id', async (req, res) => {
    try {
      const success = deleteBacktestLog(req.params.id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
