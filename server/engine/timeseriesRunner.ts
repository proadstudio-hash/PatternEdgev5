import { getDb } from "../db.js";
import { systemStatus } from "./status.js";
import { syncRealData } from "./dataSync.js";
import { OHLCV } from "../models.js";
import {
  sma,
  ema,
  adx,
  supertrend,
  atr,
  rsi,
  roc,
  momentum,
  cci,
  stochastic,
  williamsR,
  vroc,
} from "./indicators.js";

export async function runTimeSeriesTraining(
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

    // Determine config pairs
    let configs: { interval: string; timeframe: string }[] = [];

    if (options?.timeframe === "PRO AUTO") {
      configs = [
        { interval: "1d", timeframe: "Last 5 Years" },
        { interval: "1h", timeframe: "Last 6 Months" },
        { interval: "15m", timeframe: "Last 1 Month" },
      ];
    } else {
      let interval = "1d";
      if (options && options.frequency) {
        const freq = options.frequency.toLowerCase();
        if (freq.includes("1h") || freq.includes("hour")) interval = "1h";
        else if (freq.includes("15m") || freq.includes("15 min"))
          interval = "15m";
        else if (freq.includes("1m") || freq.includes("1 min")) interval = "1m";
      }
      configs = [{ interval, timeframe: options?.timeframe || "Last 5 Years" }];
    }

    if (!options?.isShortTerm) {
      // Only save settings and active symbols on training
      db.exec("UPDATE symbols SET active = 0");
      const updateActive = db.prepare(
        "UPDATE symbols SET active = 1 WHERE symbol = ?",
      );
      for (const sym of selectedSymbols) {
        updateActive.run(sym);
      }
    }

    for (const config of configs) {
      // 1. Sync Historical Data
      systemStatus.stage = options?.isShortTerm
        ? "Syncing Short-term Data"
        : "Syncing Historical Data";
      systemStatus.details = `Fetching ${config.interval} data for ${selectedSymbols.length} tickers...`;

      await syncRealData(selectedSymbols, config.interval, config.timeframe);

      systemStatus.stage = options?.isShortTerm
        ? "Time Series Real-time Scanner"
        : "Time Series Logic Calculation";

      for (let i = 0; i < selectedSymbols.length; i++) {
        const sym = selectedSymbols[i];
        systemStatus.progress = Math.floor((i / selectedSymbols.length) * 100);
        systemStatus.details = `Analyzing ${sym} (${config.interval})`;

        const bars = db
          .prepare(
            "SELECT * FROM ohlcv WHERE symbol = ? AND interval = ? ORDER BY datetime ASC",
          )
          .all(
            sym,
            config.interval === "1d" ? "1d" : config.interval,
          ) as OHLCV[];
        if (bars.length < 50) {
          // need at least 50
          continue;
        }

        const closes = bars.map((b) => b.close);
        const highs = bars.map((b) => b.high);
        const lows = bars.map((b) => b.low);

        // Indicators
        const ema20 = ema(closes, 20);
        const ema50 = ema(closes, 50);
        const ema100 = ema(closes, 100);
        const ema200 = ema(closes, 200);
        const sma50 = sma(closes, 50);
        const sma200 = sma(closes, 200);
        const mom20 = momentum(closes, 20);
        const mom60 = momentum(closes, 60);
        const roc20 = roc(closes, 20);
        const roc60 = roc(closes, 60);
        const adxData = adx(highs, lows, closes, 14); // using 14 per default
        const stData = supertrend(highs, lows, closes, 10, 3);
        const atrValues = atr(highs, lows, closes, 14);
        const rsiValues = rsi(closes, 14);
        const cciValues = cci(highs, lows, closes, 20);
        const stochValues = stochastic(highs, lows, closes, 14, 3);
        const williamsValues = williamsR(highs, lows, closes, 14);
        const vrocValues = vroc(
          bars.map((b) => b.volume),
          14,
        );

        let totalBull = 0;
        let bullWins = 0;
        let totalBear = 0;
        let bearWins = 0;

        let bullGains = [];
        let bullLosses = [];
        let bearGains = [];
        let bearLosses = [];
        let bullDrawdowns = [];
        let bearDrawdowns = [];
        let bullMoveTimes = [];
        let bearMoveTimes = [];

        const FORWARD_BARS = 20;

        let startIndex = Math.min(200, bars.length - Math.max(FORWARD_BARS, 2));

        for (
          let j = startIndex;
          j < bars.length - (options?.isShortTerm ? 0 : FORWARD_BARS);
          j++
        ) {
          const c = closes[j];

          // Extract single values to make conditions cleaner
          const e20 = ema20[j];
          const e50 = ema50[j];
          const e100 = ema100[j];
          const e200 = ema200[j];
          const a = adxData.adx[j];
          const dip = adxData.plusDI[j];
          const dim = adxData.minusDI[j];
          const stDir = stData.direction[j];
          const m20 = mom20[j];
          const m60 = mom60[j];
          const r20 = roc20[j];
          const r60 = roc60[j];
          const cciVal = cciValues[j];
          const stK = stochValues.k[j];
          const stD = stochValues.d[j];
          const wR = williamsValues[j];
          const vrocVal = vrocValues[j];

          // Bullish Conditions
          const isBullish =
            c > e50 &&
            e20 > e50 &&
            (e50 > e100 || e50 > e200) &&
            a > 20 &&
            dip > dim &&
            stDir === 1 &&
            m20 > 0 &&
            m60 > 0 &&
            r20 > 0 &&
            r60 > 0 &&
            (isNaN(cciVal) || cciVal > -150) &&
            (isNaN(stK) || stK >= stD - 10) &&
            (isNaN(wR) || wR > -95) &&
            (isNaN(vrocVal) || vrocVal > -20);

          // Bearish Conditions
          const isBearish =
            c < e50 &&
            e20 < e50 &&
            (e50 < e100 || e50 < e200) &&
            a > 20 &&
            dim > dip &&
            stDir === -1 &&
            m20 < 0 &&
            m60 < 0 &&
            r20 < 0 &&
            r60 < 0 &&
            (isNaN(cciVal) || cciVal < 150) &&
            (isNaN(stK) || stK <= stD + 10) &&
            (isNaN(wR) || wR < -5) &&
            (isNaN(vrocVal) || vrocVal < 20);

          const isLastBar = j === bars.length - 1;

          if (!options?.isShortTerm) {
            if (isBullish) {
              totalBull++;
              // Look forward FORWARD_BARS
              let maxPrice = c;
              let minPrice = c;
              let reachedMaxAt = 0;
              for (let k = 1; k <= FORWARD_BARS; k++) {
                const fc = closes[j + k];
                if (fc > maxPrice) {
                  maxPrice = fc;
                  reachedMaxAt = k;
                }
                if (fc < minPrice) {
                  minPrice = fc;
                }
              }

              const ret = (closes[j + FORWARD_BARS] - c) / c;
              const drawdown = (minPrice - c) / c;
              const maxGainPct = (maxPrice - c) / c;

              bullDrawdowns.push(Math.abs(drawdown));

              if (closes[j + FORWARD_BARS] > c) {
                bullWins++;
                bullGains.push(ret);
                bullMoveTimes.push(reachedMaxAt);
              } else {
                bullLosses.push(Math.abs(ret));
              }
            }

            if (isBearish) {
              totalBear++;
              let maxPrice = c;
              let minPrice = c;
              let reachedMinAt = 0;
              for (let k = 1; k <= FORWARD_BARS; k++) {
                const fc = closes[j + k];
                if (fc < minPrice) {
                  minPrice = fc;
                  reachedMinAt = k;
                }
                if (fc > maxPrice) {
                  maxPrice = fc;
                }
              }

              // For short, return is positive if price goes down
              const ret = (c - closes[j + FORWARD_BARS]) / c;
              const drawdown = (c - maxPrice) / c; // How much it went up against our short

              bearDrawdowns.push(Math.abs(drawdown));

              if (closes[j + FORWARD_BARS] < c) {
                bearWins++;
                bearGains.push(ret);
                bearMoveTimes.push(reachedMinAt);
              } else {
                bearLosses.push(Math.abs(ret));
              }
            }
          } else if (options?.isShortTerm && isLastBar) {
            // Short-term branch: only process the last bar, and save to scanner_results
            const getPattern = db.prepare(
              `SELECT * FROM trained_patterns WHERE symbol = ? AND setup_name = ? AND training_timeframe = ?`,
            );
            const setupName = `Time Series (${options.timeframe || "PRO AUTO"} / ${config.interval})`;
            const storageName = `${options.timeframe || "PRO AUTO"} / ${config.interval}`;
            const trainedInfo = getPattern.get(
              sym,
              setupName,
              storageName,
            ) as any;

            let probability = trainedInfo ? trainedInfo.winRate : 0.5;
            let expectancy = trainedInfo ? trainedInfo.avgExpectancy : 0.0;
            let riskMultiplier = 2.0;

            if (trainedInfo) {
              if (isBullish && trainedInfo.avgBullMove > 0)
                riskMultiplier = trainedInfo.avgBullMove;
              if (isBearish && trainedInfo.avgBearMove > 0)
                riskMultiplier = trainedInfo.avgBearMove;
            }

            const stop =
              isBullish || (!isBullish && !isBearish)
                ? c - atrValues[j] * 1.5
                : c + atrValues[j] * 1.5;
            const risk = Math.max(Math.abs(c - stop), atrValues[j] * 0.5);
            const isDirectionBullish = isBullish || (!isBullish && !isBearish);
            const t1 = isDirectionBullish
              ? c + risk * riskMultiplier
              : c - risk * riskMultiplier;
            const t2 = isDirectionBullish
              ? c + risk * riskMultiplier * 2
              : c - risk * riskMultiplier * 2;
            let type = `Neutral TS Trend (${options.timeframe || "PRO AUTO"} / ${config.interval})`;
            if (isBullish)
              type = `Bullish TS Trend (${options.timeframe || "PRO AUTO"} / ${config.interval})`;
            else if (isBearish)
              type = `Bearish TS Trend (${options.timeframe || "PRO AUTO"} / ${config.interval})`;
            const classification =
              probability > 0.6
                ? "High Conviction"
                : isBullish || isBearish
                  ? "Trend Play"
                  : "Neutral";
            let genericScore = 0.5;
            if (isBullish) genericScore = 0.8;
            else if (isBearish) genericScore = 0.2;

            const f_strength = Math.round((probability || 0.5) * 100 * (genericScore > 1 ? genericScore / 100 : genericScore));
            const f_gain = trainedInfo ? (isDirectionBullish ? (trainedInfo.avgBullGain || 5.0) : (trainedInfo.avgBearGain || 5.0)) : 5.0;
            const f_time = trainedInfo ? (isDirectionBullish ? (trainedInfo.avgBullMoveTime || 5) : (trainedInfo.avgBearMoveTime || 5)) : 5;
            const f_speed = Number((f_gain / (f_time || 5)).toFixed(3));
            const f_duration = Math.ceil(f_time);
            const f_max_value = isDirectionBullish ? c * (1 + f_gain / 100) : c * (1 - f_gain / 100);

            const insertResult = db.prepare(`
                           INSERT OR REPLACE INTO scanner_results 
                           (date, symbol, setup_name, generic_score, specific_score, generic_confidence, specific_confidence, classification, probability, expectancy, risk_reward, entry_price, stop_price, target_1, target_2, holding_period, sample_size, explanation, failure_reasons, growth_strength, growth_speed, growth_duration, max_estimated_value)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       `);

            insertResult.run(
              bars[j].datetime,
              sym,
              type,
              genericScore,
              /* generic */ genericScore,
              /* specific */ 0.7,
              /* conf */ probability,
              /* specific conf */ classification,
              isBullish || isBearish ? probability : 0.5,
              expectancy,
              riskMultiplier,
              c,
              stop,
              t1,
              t2,
              config.interval === "1d" ? "3-5 Days" : "Intraday",
              trainedInfo ? trainedInfo.patternsFound : 0,
              `${isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral"} signal on ${config.interval}.`,
              "Invalidated if price closes below stop-loss.",
              f_strength,
              f_speed,
              f_duration,
              f_max_value
            );
          }
        }

        if (!options?.isShortTerm) {
          // Compute summaries
          const totalTrades = totalBull + totalBear;
          if (totalTrades === 0) continue;

          const bullWinRate = totalBull > 0 ? bullWins / totalBull : 0;
          const bearWinRate = totalBear > 0 ? bearWins / totalBear : 0;

          const avgBullGain = bullGains.length
            ? bullGains.reduce((a, b) => a + b, 0) / bullGains.length
            : 0;
          const avgBullLoss = bullLosses.length
            ? bullLosses.reduce((a, b) => a + b, 0) / bullLosses.length
            : 0;
          const avgBearGain = bearGains.length
            ? bearGains.reduce((a, b) => a + b, 0) / bearGains.length
            : 0;
          const avgBearLoss = bearLosses.length
            ? bearLosses.reduce((a, b) => a + b, 0) / bearLosses.length
            : 0;

          const avgBullDrawdown = bullDrawdowns.length
            ? bullDrawdowns.reduce((a, b) => a + b, 0) / bullDrawdowns.length
            : 0;
          const avgBearDrawdown = bearDrawdowns.length
            ? bearDrawdowns.reduce((a, b) => a + b, 0) / bearDrawdowns.length
            : 0;

          const avgBullMoveTime = bullMoveTimes.length
            ? bullMoveTimes.reduce((a, b) => a + b, 0) / bullMoveTimes.length
            : 0;
          const avgBearMoveTime = bearMoveTimes.length
            ? bearMoveTimes.reduce((a, b) => a + b, 0) / bearMoveTimes.length
            : 0;

          const overallWinRate = (bullWins + bearWins) / totalTrades;

          const avgExpectancy =
            bullWinRate * avgBullGain - (1 - bullWinRate) * avgBullLoss;

          // teaching quality is a composite score 0-100%
          const avgTradesScore = Math.min(1.0, totalTrades / 100);
          const teachingQuality =
            (overallWinRate * 0.5 + avgTradesScore * 0.5) * 100;

          const setupName = `Time Series (${options.timeframe || "PRO AUTO"} / ${config.interval})`;

          const upsert = db.prepare(`
                 INSERT OR REPLACE INTO trained_patterns 
                 (symbol, setup_name, training_timeframe, patternsFound, winRate, avgExpectancy, avgBullMove, avgBearMove, sampleSize, teachingQuality, modelFittingPerformance, bullWinRate, bearWinRate, avgBullGain, avgBearGain, avgBullDrawdown, avgBearDrawdown, avgBullMoveTime, avgBearMoveTime)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               `);

          const storageName = `${options.timeframe || "PRO AUTO"} / ${config.interval}`;

          upsert.run(
            sym,
            setupName,
            storageName,
            totalTrades,
            overallWinRate,
            avgExpectancy,
            avgBullGain,
            avgBearLoss, // note this matches schema
            bars.length,
            teachingQuality,
            teachingQuality,
            bullWinRate,
            bearWinRate,
            avgBullGain,
            avgBearGain,
            avgBullDrawdown,
            avgBearDrawdown,
            avgBullMoveTime,
            avgBearMoveTime,
          );

          systemStatus.teachingResults[`${sym}_${storageName}`] = {
            symbol: sym,
            setup_name: setupName,
            sampleSize: bars.length,
            patternsFound: totalTrades,
            winRate: overallWinRate,
            avgExpectancy,
            teachingQuality,
            modelFittingPerformance: teachingQuality,
            bullWinRate,
            bearWinRate,
            avgBullGain,
            avgBearGain,
            avgBullDrawdown,
            avgBearDrawdown,
            avgBullMoveTime,
            avgBearMoveTime,
          };
        }
      }
    }

    systemStatus.stage = "Completed";
    systemStatus.progress = 100;
    systemStatus.details = "Time Series Teaching Finished";
  } catch (e: any) {
    console.error("Error running Time Series Teaching", e);
    systemStatus.stage = "Error";
    systemStatus.details = e.message;
  } finally {
    systemStatus.isProcessing = false;
  }
}
