import { getDb } from "../db.js";
import { fetchAndStoreEnsembleBars, getEnsembleBars } from "./ensembleData.js";
import { computeAndStoreFeatures, labelFeatures } from "./ensembleFeatures.js";
import { enabledTeachingConfigs, teachingConfigs, realtimeScanConfigs, enabledRealtimeScanConfigs, thresholds, CURRENT_FEATURE_VERSION } from "./ensembleConfig.js";
import { systemStatus } from "./status.js";

export async function runEnsembleTraining(symbols: string[], provider: string = "yahoofinance") {
  const db = getDb();
  
  if (systemStatus.isProcessing) return;
  systemStatus.isProcessing = true;

  try {
    const insertModel = db.prepare(`
      INSERT OR REPLACE INTO ensemble_models (modelId, provider, interval, trainingPeriod, featureVersion, minSampleSize, horizonBars, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let configIndex = 0;
    for (const configId of enabledTeachingConfigs) {
      configIndex++;
      const config = teachingConfigs.find(c => c.id === configId);
      if (!config) continue;
      
      systemStatus.stage = `Training Model ${config.id}`;
      systemStatus.details = `Fetching historical data (${config.interval}) for ${symbols.length} tickers...`;
      systemStatus.progress = Math.floor(((configIndex - 1) / enabledTeachingConfigs.length) * 100);
      
      await fetchAndStoreEnsembleBars(symbols, config.interval, config.period, provider);

      let horizonBars = config.interval === '15m' ? 52 : 65;
      let thr = config.interval === '15m' ? thresholds.m15 : thresholds.h1;

      insertModel.run(config.id, provider, config.interval, config.period, CURRENT_FEATURE_VERSION, 30, horizonBars, config.role);

      let totalBars = 0;
      let symbolIndex = 0;
      for (const sym of symbols) {
         symbolIndex++;
         systemStatus.details = `Building features for ${sym} (${config.id})...`;
         systemStatus.progress = Math.floor(
             (((configIndex - 1) / enabledTeachingConfigs.length) + 
             ((symbolIndex / symbols.length) / enabledTeachingConfigs.length)) * 100
         );
         
         const bars = getEnsembleBars(sym, provider, config.interval);
         if (bars.length < 50) continue;
         totalBars += bars.length;
         
         const features = computeAndStoreFeatures(sym, provider, config.interval, bars, config.id);
         labelFeatures(sym, provider, config.interval, config.id, features, horizonBars, thr.targetPct, thr.maxDrawdownPct);
         
         // Yield to event loop so status endpoint can reply
         await new Promise(r => setTimeout(r, 0));
      }
      
      db.prepare("UPDATE ensemble_models SET barsUsed = ? WHERE modelId = ?").run(totalBars, config.id);
    }
  } catch (e: any) {
    console.error("Ensemble training error:", e);
  } finally {
    systemStatus.isProcessing = false;
    systemStatus.stage = "Idle";
    systemStatus.progress = 100;
  }
}

function euclideanDistance(f1: any, f2: any) {
  return Math.sqrt(
    Math.pow(f1.rsi14 - f2.rsi14, 2) +
    Math.pow(f1.macd_histogram - f2.macd_histogram, 2) * 100 +
    Math.pow(f1.adx14 - f2.adx14, 2) +
    Math.pow(f1.volume_zscore - f2.volume_zscore, 2) * 10 
  );
}

export async function runEnsembleScan(symbols: string[], provider: string = "yahoofinance") {
  const db = getDb();
  if (systemStatus.isProcessing) return;
  systemStatus.isProcessing = true;

  try {
     systemStatus.stage = "Ensemble Scan Phase 1";
     const allResults: any[] = [];
     
     let configIndex = 0;
     for (const scanConfId of enabledRealtimeScanConfigs) {
        configIndex++;
        const scanConfig = realtimeScanConfigs.find(c => c.id === scanConfId);
        if (!scanConfig) continue;
        
        systemStatus.details = `Fetching short term data for ${scanConfig.id}...`;
        systemStatus.progress = Math.floor(((configIndex - 1) / enabledRealtimeScanConfigs.length) * 100);
        await fetchAndStoreEnsembleBars(symbols, scanConfig.interval, scanConfig.lookback, provider);
        
        let symbolIndex = 0;
        for (const sym of symbols) {
           symbolIndex++;
           systemStatus.details = `Analyzing data for ${sym} (${scanConfig.id})...`;
           systemStatus.progress = Math.floor(
               (((configIndex - 1) / enabledRealtimeScanConfigs.length) + 
               ((symbolIndex / symbols.length) / enabledRealtimeScanConfigs.length)) * 100
           );
           const bars = getEnsembleBars(sym, provider, scanConfig.interval);
           if (bars.length < 50) continue;
           
           const features = computeAndStoreFeatures(sym, provider, scanConfig.interval, bars);
           const currentFeat = features[features.length - 1];
           
           if (!currentFeat) continue;
           
           if (scanConfig.interval === "1m") {
              // Trigger score logic
              let ts = 50;
              
              let last1hHigh = 0;
              const lookbackBars = Math.min(60, bars.length - 1);
              for(let j = bars.length - 1 - lookbackBars; j < bars.length - 1; j++) {
                  if (bars[j] && bars[j].high > last1hHigh) last1hHigh = bars[j].high;
              }
              if (currentFeat.close >= last1hHigh && last1hHigh > 0) ts += 20;
              
              if (currentFeat.close > currentFeat.ema20) ts += 15;
              if (currentFeat.volume_zscore > 1.0) ts += 15; // volume higher than recent average
              if (currentFeat.rsi14 > 45 && currentFeat.rsi14 < 72) ts += 10; // not overbought
              if (currentFeat.rsi14 >= 80) ts = Math.min(ts, 60);

              // close near high
              const lastBar = bars[bars.length - 1];
              const candleSize = lastBar.high - lastBar.low;
              if (candleSize > 0) {
                 const closeToHigh = (lastBar.high - currentFeat.close) / candleSize;
                 if (closeToHigh < 0.2) ts += 10; // closed in top 20%
                 else if (closeToHigh > 0.6) ts -= 20; // rejection/wick
              }
              
              allResults.push({
                 symbol: sym,
                 scanId: scanConfig.id,
                 triggerScore: ts,
                 triggerType: ts > 70 ? "breakout" : "none",
                 close: currentFeat.close,
                 ema20: currentFeat.ema20,
                 atr: currentFeat.atr14,
                 features: currentFeat
              });
              continue;
           }

           // Find compatible models
           const models = db.prepare("SELECT * FROM ensemble_models WHERE interval = ? AND featureVersion = ?").all(scanConfig.interval, CURRENT_FEATURE_VERSION) as any[];
           
           for (const model of models) {
              const historicalFeats = db.prepare("SELECT * FROM feature_snapshots WHERE model_id = ? AND symbol = ? AND pattern_label IS NOT NULL AND pattern_label != 'neutral'").all(model.modelId, sym) as any[];
              
              if (historicalFeats.length < 10) continue;
              
              const distances = historicalFeats.map(hf => ({
                label: hf.pattern_label,
                dist: euclideanDistance(hf, currentFeat),
                hf
              })).sort((a,b) => a.dist - b.dist).slice(0, 30);
              
              const bullCount = distances.filter(d => d.label === 'bullish').length;
              const winRate = bullCount / distances.length;
              const direction = winRate > 0.55 ? "bullish" : winRate < 0.45 ? "bearish" : "neutral";
              
              let avgGain = 0;
              let avgLoss = 0;
              let maxDrawdown = 0;
              if (bullCount > 0) {
                 avgGain = distances.filter(d => d.label === 'bullish').reduce((acc, d) => acc + d.hf.future_max_gain_pct, 0) / bullCount;
                 maxDrawdown = distances.filter(d => d.label === 'bullish').reduce((acc, d) => acc + d.hf.future_max_drawdown_pct, 0) / bullCount;
              }
              const bearCount = distances.length - bullCount;
              if (bearCount > 0) {
                 avgLoss = distances.filter(d => d.label !== 'bullish').reduce((acc, d) => acc + d.hf.future_return_pct, 0) / bearCount;
              }
              
              let rawScore = Math.max(0, 1 - (distances[0]?.dist / 50)) * winRate * Math.min(distances.length / 30, 1.0);
              let modelScore = 50;
              if (direction === "bullish") modelScore = 50 + rawScore * 50;
              if (direction === "bearish") modelScore = 50 - rawScore * 50;
              
              allResults.push({
                 symbol: sym,
                 scanId: scanConfig.id,
                 modelId: model.modelId,
                 provider,
                 interval: scanConfig.interval,
                 lookback: scanConfig.lookback,
                 direction,
                 similarity: Math.max(0, 1 - distances[0]?.dist / 50),
                 historicalWinRate: winRate,
                 avgGainPct: avgGain,
                 avgLoss: avgLoss,
                 maxDrawdown: maxDrawdown,
                 sampleSize: distances.length,
                 modelScore: Math.min(Math.max(modelScore, 0), 100),
                 features: currentFeat
              });
           }
           // Yield to event loop
           await new Promise(r => setTimeout(r, 0));
        }
     }
     
     const aggregated: any[] = [];
     for (const sym of symbols) {
         const symResults = allResults.filter(r => r.symbol === sym);
         if (symResults.length === 0) continue;
         
         let s1h6w = symResults.find(r => r.scanId === "T6W_1H")?.modelScore || 50;
         let s1h4w = symResults.find(r => r.scanId === "T4W_1H")?.modelScore || 50;
         let s1h2w = symResults.find(r => r.scanId === "T2W_1H")?.modelScore || 50;
         let s15m5d = symResults.find(r => r.scanId === "T5D_15M")?.modelScore || 50;
         let s15m3d = symResults.find(r => r.scanId === "T3D_15M")?.modelScore || 50;
         
         let TrendBiasScore1h = (s1h6w + s1h4w + s1h2w) / 3;
         let SetupScore15m = (s15m5d + s15m3d) / 2;
         
         const triggerResult = symResults.find(r => r.scanId === "T1H_1M");
         const triggerScore = triggerResult?.triggerScore || 50;
         
         let finalScore = 
            0.20 * s1h6w +
            0.20 * s1h4w +
            0.15 * s1h2w +
            0.20 * s15m5d +
            0.15 * s15m3d +
            0.10 * triggerScore;
            
         // Variables for output stats
         let minSampleSize = 999;
         let totalSampleSize = 0;
         let numModels = 0;
         let totalSimilarity = 0;
         let totalWinRate = 0;
         let totalAvgGain = 0;
         let totalAvgLoss = 0;
         let totalMaxDrawdown = 0;

         for (const r of symResults) {
            if (r.modelScore !== undefined) {
               totalSampleSize += r.sampleSize;
               minSampleSize = Math.min(minSampleSize, r.sampleSize);
               numModels++;
               totalSimilarity += r.similarity || 0;
               totalWinRate += r.historicalWinRate || 0;
               totalAvgGain += r.avgGainPct || 0;
               totalAvgLoss += r.avgLoss || 0;
               totalMaxDrawdown += r.maxDrawdown || 0;
            }
         }

         if (numModels > 0) {
            totalSimilarity /= numModels;
            totalWinRate /= numModels;
            totalAvgGain /= numModels;
            totalAvgLoss /= numModels;
            totalMaxDrawdown /= numModels;
         }

         let expectedReward = totalAvgGain > 0 ? totalAvgGain : 0.01;
         let expectedRisk = totalMaxDrawdown < 0 ? Math.abs(totalMaxDrawdown) : 0.01;
         let riskReward = expectedReward / expectedRisk;

         let warnings: string[] = [];
         let rejectBuy = false;
         let isSpeculativeRebound = false;
         let waitConfirmation = false;

         if (s1h6w < 40 && finalScore > 65) {
             finalScore = 65;
             warnings.push("1h stable trend is strongly bearish (capped at 65).");
         }

         if (s1h4w < 45 && s1h2w < 45) {
             rejectBuy = true;
             warnings.push("No automatic bullish signal (both 1h 4W and 1h 2W are bearish).");
         }

         if (SetupScore15m > 55 && TrendBiasScore1h < 45) {
             isSpeculativeRebound = true;
             warnings.push("Speculative rebound: 15m is bullish but 1h is bearish.");
         }

         if (SetupScore15m < 55 && finalScore > 70) {
             finalScore = 70;
             warnings.push("15m setup is weak (capped at 70).");
         }

         if (triggerScore < 40) {
             waitConfirmation = true;
             warnings.push("1m trigger is weak (watch only).");
         }

         if (numModels > 0 && minSampleSize < 10) {
             warnings.push("Signal confidence very low (sample size < 10).");
         }

         if (numModels > 0 && minSampleSize < 20 && finalScore > 75) {
             finalScore = 75; // cap it at an acceptable level
             warnings.push("Do not allow Strong Signal (sample size < 20).");
         }

         if (riskReward < 1.5 && finalScore > 65) {
             finalScore = 65;
             warnings.push(`Risk/Reward is ${riskReward.toFixed(2)} (< 1.5), capped at 65.`);
         }

         if (triggerResult && triggerResult.close && triggerResult.ema20 && triggerResult.atr) {
             const distToEma = (triggerResult.close - triggerResult.ema20) / triggerResult.close;
             const atrPct = triggerResult.atr / triggerResult.close;
             if (distToEma > atrPct * 1.5) {
                finalScore -= 10;
                warnings.push("Possible FOMO/late entry risk. Price is extended from EMA20.");
             }
         }
         
         let finalLabel = "Watchlist Only / Wait for Confirmation";
         if (rejectBuy) finalLabel = "No automatic bullish signal";
         else if (waitConfirmation) finalLabel = "Watch Only (trigger is weak)";
         else if (isSpeculativeRebound) finalLabel = "Speculative Rebound";
         else if (finalScore >= 80) finalLabel = "Strong Buy";
         else if (finalScore >= 65) finalLabel = "Interesting Bullish Setup";
         else if (finalScore >= 50) finalLabel = "Neutral / Unclear";
         else if (finalScore < 50) finalLabel = "Reject / Bearish";
         
         const currentPrice = symResults[0]?.close || symResults[0]?.features?.close || 0;
         
         const model1h = symResults.find(r => r.interval === "1h");
         const model15m = symResults.find(r => r.interval === "15m");
         
         aggregated.push({
            symbol: sym,
            finalScore,
            finalLabel,
            direction: finalScore >= 65 ? "bullish" : finalScore <= 35 ? "bearish" : "neutral",
            confidence: Math.abs(finalScore - 50) * 2,
            similarity: totalSimilarity,
            historicalWinRate: totalWinRate,
            avgGain: totalAvgGain,
            avgLoss: totalAvgLoss,
            maxDrawdown: totalMaxDrawdown,
            sampleSize: totalSampleSize,
            regimeMatch: totalSimilarity,
            trendBiasScore1h: TrendBiasScore1h,
            setupScore15m: SetupScore15m,
            triggerScore1m: triggerScore,
            expectedHorizon: "1-5 Days",
            dominantReason: "Aggregated model scores",
            modelContributions: symResults.filter(r => r.modelScore !== undefined),
            warnings,
            currentPrice,
            indicators15m: model15m?.features || null,
            indicators1h: model1h?.features || null
         });
     }
     
     systemStatus.ensembleAggregatedResults = aggregated;
     
  } catch (e: any) {
    console.error("Ensemble scan error:", e);
  } finally {
    systemStatus.isProcessing = false;
    systemStatus.stage = "Idle";
    systemStatus.progress = 100;
  }
}
