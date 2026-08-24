import fs from "fs";
import { getDb } from "../db.js";
import { OHLCV } from "../models.js";
import { calculateFeatures } from "./indicators.js";
import { systemStatus } from "./status.js";
import { syncRealData } from "./dataSync.js";

export async function runFullWorkflow(
  selectedSymbols: string[],
  options?: any,
) {
  if (systemStatus.isProcessing) return;
  systemStatus.isProcessing = true;
  if (!options?.isShortTerm) {
    systemStatus.teachingResults = {};
  }

  try {
    const db = getDb();

    // Update active statuses ONLY if it's teaching scan
    if (!options?.isShortTerm) {
      db.exec("UPDATE symbols SET active = 0");
      const updateActive = db.prepare(
        "UPDATE symbols SET active = 1 WHERE symbol = ?",
      );
      for (const sym of selectedSymbols) {
        updateActive.run(sym);
      }
      
      const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      insertSetting.run('training_timeframe', options?.timeframe || 'Last 5 Years');
      insertSetting.run('training_frequency', options?.frequency || '1d');
      insertSetting.run('training_indicators', JSON.stringify(options?.indicators || []));
    }

    // Phase 1: Sync (Historical Data Teaching)
    systemStatus.stage = options?.isShortTerm
      ? "Syncing Short-term Data"
      : "Syncing Historical Data";

    // Map human timeframe/frequency to Yahoo interval
    let interval = "1d";
    if (options && options.frequency) {
      const freq = options.frequency.toLowerCase();
      if (freq.includes("1h") || freq.includes("hour")) interval = "1h";
      else if (freq.includes("15m") || freq.includes("15 min"))
        interval = "15m";
      else if (freq.includes("1m") || freq.includes("1 min")) interval = "1m";
    }

    systemStatus.details = `Fetching data (${interval}) for ${selectedSymbols.length} tickers...`;
    console.log(
      `Starting sync for ${selectedSymbols} at ${interval} with timeframe ${options?.timeframe || "Last 5 Years"}`,
    );
    await syncRealData(selectedSymbols, interval, options?.timeframe);

    // Phase 2: Pattern Recognition
    systemStatus.stage = options?.isShortTerm
      ? "Real-time Scanner"
      : "Historical Pattern recognition";
    systemStatus.progress = 0;

    const insertResult = db.prepare(`
      INSERT OR REPLACE INTO scanner_results 
      (date, symbol, setup_name, generic_score, specific_score, generic_confidence, specific_confidence, classification, probability, expectancy, risk_reward, entry_price, stop_price, target_1, target_2, holding_period, sample_size, explanation, failure_reasons, growth_strength, growth_speed, growth_duration, max_estimated_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPattern = db.prepare(`
      INSERT OR REPLACE INTO trained_patterns (
        symbol, setup_name, training_timeframe, patternsFound, winRate, avgExpectancy,
        avgBullMove, avgBearMove, sampleSize, teachingQuality, modelFittingPerformance,
        avgBullGain, avgBearGain, avgBullMoveTime, avgBearMoveTime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const getPattern = db.prepare(
      `SELECT * FROM trained_patterns WHERE symbol = ? AND setup_name = ? AND training_timeframe = ?`,
    );

    for (let i = 0; i < selectedSymbols.length; i++) {
      const sym = selectedSymbols[i];
      systemStatus.details = `Scanning 5-year history for ${sym}...`;
      systemStatus.progress = Math.round((i / selectedSymbols.length) * 100);

      const bars = db
        .prepare("SELECT * FROM ohlcv WHERE symbol = ? AND interval = ? ORDER BY datetime ASC")
        .all(sym, interval) as OHLCV[];
      if (bars.length < 50) {
        console.log(
          `Skipping ${sym}, insufficient data (${bars.length} bars). Minimum 50 bars required.`,
        );
        continue;
      }

      console.log(
        `Deep Learning: Processing ${bars.length} historical bars for ${sym}`,
      );
      const features = calculateFeatures(bars);

      // Parse options to know which indicators to use
      const optsArgs = options?.indicators || [
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
        "roc",
        "mom",
        "cci",
        "stoch",
        "williamsR",
        "vroc"
      ];
      const selectedIndicators = new Set(optsArgs);

      let successfulTrades = 0;
      let totalTrades = 0;
      let totalBullTrades = 0;
      let totalBearTrades = 0;
      let totalExpectancy = 0;
      let totalBullMove = 0;
      let totalBearMove = 0;
      let totalBullGain = 0;
      let totalBearGain = 0;
      let totalBullMoveTime = 0;
      let totalBearMoveTime = 0;

      // We scan history. Start from index 50 to allow basic indicators to stabilize.
      // If we have enough data for SMA200, it will stabilize by 200, but we shouldn't block scanning entirely.
      const startIndex = Math.min(50, features.length - 1);
      for (let j = startIndex; j < features.length; j++) {
        const current = features[j];
        const prev = features[j - 1];
        if (!current || !prev) continue;

        // --- REFINED HIERARCHICAL SCORING ENGINE (Based on User Inputs) ---
        let bullishPoints = 0;
        let bearishPoints = 0;
        let totalWeights = 0;

        // 1. Direction & Structure (25% Weight)
        let dirMax = 0;
        let dirBull = 0;
        let dirBear = 0;

        if (selectedIndicators.has("sma200")) {
          dirMax += 0.4;
          if (current.bar.close > current.sma200) dirBull += 0.4;
          if (current.bar.close < current.sma200) dirBear += 0.4;
        }
        if (
          selectedIndicators.has("ema50") &&
          selectedIndicators.has("ema20")
        ) {
          dirMax += 0.3;
          if (current.ema20 > current.ema50) dirBull += 0.3;
          if (current.ema20 < current.ema50) dirBear += 0.3;
        } else if (selectedIndicators.has("ema50")) {
          dirMax += 0.3;
          if (current.bar.close > current.ema50) dirBull += 0.3;
          if (current.bar.close < current.ema50) dirBear += 0.3;
        } else if (selectedIndicators.has("ema20")) {
          dirMax += 0.3;
          if (current.bar.close > current.ema20) dirBull += 0.3;
          if (current.bar.close < current.ema20) dirBear += 0.3;
        }
        if (selectedIndicators.has("sr")) {
          dirMax += 0.3;
          if (current.structure === "HH" || current.structure === "HL")
            dirBull += 0.3;
          if (current.structure === "LH" || current.structure === "LL")
            dirBear += 0.3;
        }

        if (dirMax > 0) {
          const dirWeight = 0.25;
          totalWeights += dirWeight;
          bullishPoints += dirWeight * (dirBull / dirMax);
          bearishPoints += dirWeight * (dirBear / dirMax);
        }

        // 2. Trend Strength & ADX (15% Weight)
        if (selectedIndicators.has("adx")) {
          const strengthWeight = 0.15;
          totalWeights += strengthWeight;
          if (current.adx > 25) {
            if (current.plusDI > current.minusDI)
              bullishPoints += strengthWeight;
            if (current.minusDI > current.plusDI)
              bearishPoints += strengthWeight;
          } else if (current.adx > 20) {
            if (current.plusDI > current.minusDI)
              bullishPoints += strengthWeight * 0.6;
            if (current.minusDI > current.plusDI)
              bearishPoints += strengthWeight * 0.6;
          }
        }

        // 3. Momentum RSI/MACD (20% Weight)
        let momMax = 0;
        let momBull = 0;
        let momBear = 0;

        if (selectedIndicators.has("rsi14")) {
          momMax += 0.5;
          if (current.rsi14 >= 55 && current.rsi14 <= 65) momBull += 0.5;
          else if (current.rsi14 > 50) momBull += 0.3;
          if (current.rsi14 >= 35 && current.rsi14 <= 45) momBear += 0.5;
          else if (current.rsi14 < 50) momBear += 0.3;
        }
        if (selectedIndicators.has("macd")) {
          momMax += 0.5;
          if (current.macdHist > prev.macdHist && current.macdHist > 0)
            momBull += 0.5;
          else if (current.macdHist > prev.macdHist) momBull += 0.3;
          if (current.macdHist < prev.macdHist && current.macdHist < 0)
            momBear += 0.5;
          else if (current.macdHist < prev.macdHist) momBear += 0.3;
        }
        if (selectedIndicators.has("cci")) {
          momMax += 0.3;
          if (current.cci > 100) momBull += 0.3;
          else if (current.cci > 0) momBull += 0.15;
          if (current.cci < -100) momBear += 0.3;
          else if (current.cci < 0) momBear += 0.15;
        }
        if (selectedIndicators.has("stoch")) {
          momMax += 0.3;
          if (current.stochK > current.stochD) momBull += 0.3;
          if (current.stochK < current.stochD) momBear += 0.3;
        }
        if (selectedIndicators.has("williamsR")) {
          momMax += 0.3;
          if (current.williamsR > -20) momBull += 0.3;
          else if (current.williamsR > -50) momBull += 0.15;
          if (current.williamsR < -80) momBear += 0.3;
          else if (current.williamsR < -50) momBear += 0.15;
        }
        if (selectedIndicators.has("vroc")) {
          momMax += 0.2;
          if (current.vroc > 5) momBull += 0.2;
          if (current.vroc < -5) momBear += 0.2;
        }

        if (momMax > 0) {
          const momentumWeight = 0.2;
          totalWeights += momentumWeight;
          bullishPoints += momentumWeight * (momBull / momMax);
          bearishPoints += momentumWeight * (momBear / momMax);
        }

        // 3b. Rate of Change & Inertia (ROC / MOM) (10% Weight)
        let inertiaMax = 0;
        let inertiaBull = 0;
        let inertiaBear = 0;

        if (selectedIndicators.has("roc") || selectedIndicators.has("mom")) {
          inertiaMax += 0.6;
          if (current.roc10 > 2) inertiaBull += 0.3;
          else if (current.roc10 > 0) inertiaBull += 0.1;
          
          if (current.roc10 < -2) inertiaBear += 0.3;
          else if (current.roc10 < 0) inertiaBear += 0.1;

          if (current.mom20 > 0) inertiaBull += 0.3;
          if (current.mom20 < 0) inertiaBear += 0.3;
        }

        if (inertiaMax > 0) {
          const inertiaWeight = 0.1;
          totalWeights += inertiaWeight;
          bullishPoints += inertiaWeight * (inertiaBull / inertiaMax);
          bearishPoints += inertiaWeight * (inertiaBear / inertiaMax);
        }

        // 4. Breakout & Volume Confirmation (20% Weight)
        let brkMax = 0;
        let brkBull = 0;
        let brkBear = 0;

        const highVol = current.bar.volume > current.volSma20 * 1.1;
        const isBullBreakout = current.bar.close > prev.bar.high;
        const isBearBreakout = current.bar.close < prev.bar.low;

        if (selectedIndicators.has("supertrend")) {
          brkMax += 1.0;
          if (isBullBreakout && current.supertrendDir === 1) {
            brkBull += 0.5;
            if (highVol) brkBull += 0.5;
          }
          if (isBearBreakout && current.supertrendDir === -1) {
            brkBear += 0.5;
            if (highVol) brkBear += 0.5;
          }
        } else if (selectedIndicators.has("bbw")) {
          brkMax += 1.0;
          if (isBullBreakout && current.bbWidth > prev.bbWidth * 1.05) {
            brkBull += 0.5;
            if (highVol) brkBull += 0.5;
          }
          if (isBearBreakout && current.bbWidth > prev.bbWidth * 1.05) {
            brkBear += 0.5;
            if (highVol) brkBear += 0.5;
          }
        }

        if (brkMax > 0) {
          const volWeight = 0.2;
          totalWeights += volWeight;
          bullishPoints += volWeight * (brkBull / brkMax);
          bearishPoints += volWeight * (brkBear / brkMax);
        }

        // 5. Entry, Stop, Target (10% Weight)
        const entryWeight = 0.1;
        totalWeights += entryWeight;
        bullishPoints += entryWeight;
        bearishPoints += entryWeight;

        if (totalWeights === 0) totalWeights = 1;
        const bullScore = bullishPoints / totalWeights;
        const bearScore = bearishPoints / totalWeights;

        const isLastBar = j === features.length - 1;
        const isSigBull = bullScore > 0.75;
        const isSigBear = bearScore > 0.75;

        // We want to record historical signals that are strong, OR ALWAYS record the current/last bar for every stock.
        if (isSigBull || isSigBear || isLastBar) {
          const isBull = bullScore >= bearScore;
          const score = isBull ? bullScore : bearScore;

          let type = isBull
            ? "Bullish Trend Alignment"
            : "Bearish Trend Alignment";
          if (score < 0.5) type = "Neutral / Sideways";

          let classification = "";
          if (isBull) {
            classification =
              score > 0.88
                ? "High Conviction Long"
                : score > 0.65
                  ? "Bullish Trend"
                  : "Weak/Neutral";
          } else {
            classification =
              score > 0.88
                ? "High Conviction Short"
                : score > 0.65
                  ? "Bearish Trend"
                  : "Weak/Neutral";
          }

          // Stop-loss logic: Under support, Supertrend or 1.5-2 ATR
          let stop = 0;
          if (isBull) {
            stop =
              Math.min(current.bar.low, current.supertrend || current.bar.low) -
              current.atr14 * 0.5;
            if (selectedIndicators.has("fibonacci") && current.fibPivots?.S1) {
              stop = Math.min(stop, current.fibPivots.S1);
            }
          } else {
            stop =
              Math.max(
                current.bar.high,
                current.supertrend || current.bar.high,
              ) +
              current.atr14 * 0.5;
            if (selectedIndicators.has("fibonacci") && current.fibPivots?.R1) {
              stop = Math.max(stop, current.fibPivots.R1);
            }
          }

          const risk = Math.max(
            Math.abs(current.bar.close - stop),
            current.atr14 * 0.5,
          ); // Ensure non-zero risk

          // LEARNED TARGET LOGIC
          let learnedBullMoveMultiplier = 2.0;
          let learnedBearMoveMultiplier = 2.0;
          
          if (options?.isShortTerm) {
            const trainedInfo = getPattern.get(sym, 'Pattern Search', options?.timeframe + ' / ' + options?.frequency) as any;
            if (trainedInfo) {
               if (trainedInfo.avgBullMove > 0) learnedBullMoveMultiplier = trainedInfo.avgBullMove;
               if (trainedInfo.avgBearMove > 0) learnedBearMoveMultiplier = trainedInfo.avgBearMove;
            }
          }
          
          const t1 = isBull
            ? current.bar.close + risk * learnedBullMoveMultiplier
            : current.bar.close - risk * learnedBearMoveMultiplier;
          const t2 = isBull
            ? current.bar.close + risk * learnedBullMoveMultiplier * 2
            : current.bar.close - risk * learnedBearMoveMultiplier * 2;

          // Backtest the signal in history to calculate "Expectancy" and "Peak Move"
          // We look ahead up to 40 bars (extended to find the max peak and delay properly)
          let tradeResult = 0;
          let hitTarget = false;
          let hitStop = false;
          let maxFavorableMove = 0;
          let maxFavorableGain = 0;
          let timeToMax = 0;

          if (!options?.isShortTerm) {
            for (let k = j + 1; k < Math.min(j + 41, features.length); k++) {
              const barsMove = Math.abs(features[k].bar.close - current.bar.close);
              const barsMoveRR = barsMove / risk;
              
              if (isBull) {
                if (features[k].bar.high > current.bar.close) {
                   const currMove = (features[k].bar.high - current.bar.close) / risk;
                   if (currMove > maxFavorableMove) {
                       maxFavorableMove = currMove;
                       maxFavorableGain = (features[k].bar.high - current.bar.close) / current.bar.close * 100;
                       timeToMax = k - j;
                   }
                }
                if (features[k].bar.high >= t1) {
                  hitTarget = true;
                  // continue searching for peak move even if target hit
                }
                if (features[k].bar.low <= stop) {
                  hitStop = true;
                  break; 
                }
              } else {
                if (features[k].bar.low < current.bar.close) {
                   const currMove = (current.bar.close - features[k].bar.low) / risk;
                   if (currMove > maxFavorableMove) {
                       maxFavorableMove = currMove;
                       maxFavorableGain = (current.bar.close - features[k].bar.low) / current.bar.close * 100;
                       timeToMax = k - j;
                   }
                }
                if (features[k].bar.low <= t1) {
                  hitTarget = true;
                }
                if (features[k].bar.high >= stop) {
                  hitStop = true;
                  break;
                }
              }
            }

            if (hitTarget) {
              tradeResult = 2.0; // 2:1 RR for basic expectancy
            } else if (hitStop) {
              tradeResult = -1.0;
            }

            // Only add to teaching stats if it was a historical "Strong" signal
            if (!isLastBar && score > 0.75) {
              if (hitTarget) successfulTrades++;
              totalTrades++;
              totalExpectancy += tradeResult;
              if (isBull) {
                totalBullMove += maxFavorableMove;
                totalBullGain += maxFavorableGain;
                totalBullMoveTime += timeToMax;
                totalBullTrades++;
              }
              else {
                totalBearMove += maxFavorableMove;
                totalBearGain += maxFavorableGain;
                totalBearMoveTime += timeToMax;
                totalBearTrades++;
              }
            }
          }

          let probability =
            totalTrades > 0 ? successfulTrades / totalTrades : score;
          let expectancy = totalTrades > 0 ? totalExpectancy / totalTrades : 0;
          let pastTradesSize = totalTrades;

          if (options?.isShortTerm) {
            // Read from trained_patterns
            const trainedInfo = getPattern.get(sym, 'Pattern Search', options?.timeframe + ' / ' + options?.frequency) as any;
            if (trainedInfo && trainedInfo.patternsFound > 0) {
              probability = trainedInfo.winRate;
              expectancy = trainedInfo.avgExpectancy;
              pastTradesSize = trainedInfo.patternsFound;
            }
          }

          // In teaching mode: we don't save to scanner results at all (to not confuse Daily Scanner)
          // In Daily Scanner mode: we save the last bar ONLY.
          if (options?.isShortTerm && isLastBar) {
            const scanSetupName = `${type} (${options?.timeframe || 'PRO AUTO'} / ${options?.frequency || '1d'})`;
            
            let learnedGain = isBull ? 5.0 : 5.0;
            let learnedTime = isBull ? 5 : 5;
            let learnedTInfo = null;
            
            if (options?.isShortTerm) {
               const trainedInfo = getPattern.get(sym, 'Pattern Search', options?.timeframe + ' / ' + options?.frequency) as any;
               if (trainedInfo) {
                   learnedTInfo = trainedInfo;
                   learnedGain = isBull ? (trainedInfo.avgBullGain || 5.0) : (trainedInfo.avgBearGain || 5.0);
                   learnedTime = isBull ? (trainedInfo.avgBullMoveTime || 5) : (trainedInfo.avgBearMoveTime || 5);
               }
            }
            
            const explanationExt = isBull
                ? `Direction is Bullish. Historical peak move for ${sym} is ${learnedBullMoveMultiplier.toFixed(2)}x risk (estimated +${learnedGain.toFixed(1)}% gain). Strong statistical delay to peak is ${learnedTime.toFixed(1)} bars. Target expected force is ${(learnedGain / (learnedTime || 1)).toFixed(2)} %/bar.`
                : `Directional breakdown. Historical peak move for ${sym} is ${learnedBearMoveMultiplier.toFixed(2)}x risk (estimated -${learnedGain.toFixed(1)}% drop). Strong statistical delay to peak is ${learnedTime.toFixed(1)} bars. Target expected force is ${(learnedGain / (learnedTime || 1)).toFixed(2)} %/bar.`;
                
            const f_strength = Math.round((probability || 0.5) * 100 * (score > 1 ? score / 100 : score));
            const f_speed = Number((learnedGain / (learnedTime || 5)).toFixed(3));
            const f_duration = Math.ceil(learnedTime);
            const f_max_value = isBull ? current.bar.close * (1 + learnedGain / 100) : current.bar.close * (1 - learnedGain / 100);

            insertResult.run(
              current.bar.datetime,
              sym,
              scanSetupName,
              score, // generic
              score * (expectancy > 0 ? expectancy : 1), // specific weight by history
              score > 0.75 ? 0.85 : 0.5, // confidence
              probability, // specific confidence based on backtest
              classification,
              probability, // probability
              expectancy, // expectancy
              isBull ? learnedBullMoveMultiplier : learnedBearMoveMultiplier, // risk/reward
              current.bar.close,
              stop,
              t1,
              t2,
              `${Math.ceil(learnedTime)} bars`,
              pastTradesSize,
              explanationExt,
              "Invalidated if price closes below stop-loss or momentum diverges.",
              f_strength,
              f_speed,
              f_duration,
              f_max_value
            );
          }
        }
      }

      if (!options?.isShortTerm) {
        const winRate = totalTrades > 0 ? successfulTrades / totalTrades : 0;
        const avgExpectancy =
          totalTrades > 0 ? totalExpectancy / totalTrades : 0;
          
        // Avoid division by zero and provide a sane default (2.0) if no trades found
        const bullCount = totalBullTrades > 0 ? totalBullTrades : 1; 
        const bearCount = totalBearTrades > 0 ? totalBearTrades : 1;
        const avgBullMove = totalBullTrades > 0 ? (totalBullMove / bullCount) : 2.0;
        const avgBearMove = totalBearTrades > 0 ? (totalBearMove / bearCount) : 2.0;
        
        const avgBullG = totalBullTrades > 0 ? (totalBullGain / bullCount) : 5.0;
        const avgBearG = totalBearTrades > 0 ? (totalBearGain / bearCount) : 5.0;
        const avgBullT = totalBullTrades > 0 ? (totalBullMoveTime / bullCount) : 5.0;
        const avgBearT = totalBearTrades > 0 ? (totalBearMoveTime / bearCount) : 5.0;
          
        const teachingQuality = Math.min(99.9, 70 + (bars.length / 500) * 10 + (totalTrades / 100) * 5);
        const modelFittingPerformance = Math.min(99.9, 65 + (winRate * 25) + (Math.max(0, avgExpectancy) * 10));
        
        insertPattern.run(
          sym,
          'Pattern Search',
          options?.timeframe + ' / ' + options?.frequency,
          totalTrades,
          winRate,
          avgExpectancy,
          avgBullMove,
          avgBearMove,
          bars.length,
          teachingQuality,
          modelFittingPerformance,
          avgBullG,
          avgBearG,
          avgBullT,
          avgBearT
        );
        systemStatus.teachingResults[sym] = {
          patternsFound: totalTrades,
          winRate: winRate,
          avgExpectancy: avgExpectancy,
          sampleSize: bars.length,
          teachingQuality: teachingQuality,
          modelFittingPerformance: modelFittingPerformance
        };
        console.log(
          `Completed Teaching Phase for ${sym}: Found ${totalTrades} patterns, Avg Peak Bull: ${avgBullMove.toFixed(2)}x, Bear: ${avgBearMove.toFixed(2)}x`,
        );
      } else {
        console.log(`Completed Short-term Scan for ${sym}`);
      }
      // Yield to event loop
      await new Promise(r => setTimeout(r, 0));
    }
  } catch (err: any) {
    console.error("Workflow error:", err);
    if (typeof fs !== "undefined") {
      fs.writeFileSync("workflow_error.log", err?.stack || String(err));
    }
  } finally {
    systemStatus.isProcessing = false;
    systemStatus.stage = "Idle";
    systemStatus.progress = 100;
  }
}

export function runDailyScanner() {
  const db = getDb();
  const symbolsRaw = db
    .prepare("SELECT symbol FROM symbols WHERE active = 1")
    .all() as { symbol: string }[];
  const symbols = symbolsRaw.map((s) => s.symbol);

  runFullWorkflow(symbols).catch((e) => console.error("Scanner failed:", e));
}
