import { getDb } from "../db.js";
import { systemStatus } from "./status.js";
import yahooFinanceDefault from "yahoo-finance2";
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance =
  typeof YFClass === "function" ? new YFClass() : yahooFinanceDefault;
import {
  sma,
  ema,
  rsi,
  macd,
  adx,
  bollingerBands,
  atr,
  obv,
  roc,
  cci,
  stochastic,
  williamsR,
  vroc,
} from "./indicators.js";

export async function runLearningTrendTraining(
  symbols: string[],
  options: { timeframe: string; frequency: string; isShortTerm?: boolean },
) {
  if (systemStatus.isProcessing) return;
  systemStatus.isProcessing = true;
  systemStatus.phase = "Initializing Learning Trend Engine";
  systemStatus.progress = 0;

  const db = getDb();

  let interval = "1d";
  if (options.frequency === "1h" || options.frequency === "1 Hour")
    interval = "60m";
  if (options.frequency === "15m" || options.frequency === "15 Minutes")
    interval = "15m";

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    systemStatus.stage = `Teaching ${sym} with Learning Trend (${interval})`;
    systemStatus.progress = Math.round((i / symbols.length) * 100);

    try {
      const endDate = new Date();
      const pastDate = new Date();

      if (interval === "1d") {
        if (options.timeframe.includes("3 Months"))
          pastDate.setMonth(pastDate.getMonth() - 3);
        else if (options.timeframe.includes("6 Months"))
          pastDate.setMonth(pastDate.getMonth() - 6);
        else if (options.timeframe.includes("1 Year"))
          pastDate.setFullYear(pastDate.getFullYear() - 1);
        else if (options.timeframe.includes("2 Years"))
          pastDate.setFullYear(pastDate.getFullYear() - 2);
        else if (options.timeframe.includes("5 Years"))
          pastDate.setFullYear(pastDate.getFullYear() - 5);
        else
          pastDate.setFullYear(
            pastDate.getFullYear() - (options.isShortTerm ? 1 : 3),
          );
      } else if (interval === "60m") {
        pastDate.setDate(pastDate.getDate() - (options.isShortTerm ? 30 : 720)); // YF limits hourly to ~730 days
      } else {
        pastDate.setDate(pastDate.getDate() - (options.isShortTerm ? 7 : 59)); // YF limits 15m to 60 days
      }

      let querySym = sym.trim();
      if (
        querySym.includes(".") &&
        !querySym.endsWith(".MI") &&
        !querySym.endsWith(".L")
      ) {
        querySym = querySym.replace(/\./g, "-");
      }

      const res = await yahooFinance.chart(querySym, {
        period1: pastDate.toISOString().split("T")[0],
        period2: endDate.toISOString().split("T")[0],
        interval: interval as any,
      });
      const quotes = res.quotes || [];
      if (quotes.length < 50) continue;

      const closes = quotes
        .map((q: any) => q.close)
        .filter((c: any) => c !== null);
      const highs = quotes
        .map((q: any) => q.high)
        .filter((c: any) => c !== null);
      const lows = quotes.map((q: any) => q.low).filter((c: any) => c !== null);
      const opens = quotes
        .map((q: any) => q.open)
        .filter((c: any) => c !== null);
      const volumes = quotes
        .map((q: any) => q.volume)
        .filter((c: any) => c !== null);

      if (closes.length < 50) continue;

      const ema10 = ema(closes, 10);
      const ema20 = ema(closes, 20);
      const ema50 = ema(closes, 50);
      const _sma50 = sma(closes, 50);
      const _sma200 = sma(closes, 200);
      const _rsi = rsi(closes, 14);
      const _macd = macd(closes, 12, 26, 9);
      const _adx = adx(highs, lows, closes, 14);
      const _atr = atr(highs, lows, closes, 14);
      const _obv = obv(closes, volumes);
      const bb = bollingerBands(closes, 20, 2);
      const roc10 = roc(closes, 10);
      const roc20 = roc(closes, 20);
      const cciValues = cci(highs, lows, closes, 20);
      const stochValues = stochastic(highs, lows, closes, 14, 3);
      const williamsValues = williamsR(highs, lows, closes, 14);
      const vrocValues = vroc(volumes, 14);

      let learningDataCount = 0;
      let bullWins = 0;
      let bullMoves = 0;
      let totalProfit = 0;
      let totalDuration = 0;
      let totalStartDelay = 0;

      if (options.isShortTerm) {
        // Short-term branch: Scan the latest bar for a learned trend condition
        const last = closes.length - 1;
        const close = closes[last];
        const prevClose = closes[last - 1];
        const _ema20 = ema20[last];
        const _ema50 = ema50[last];
        const currentM = _macd.histogram[last] || _macd.macdLine[last];
        const prevM = _macd.histogram[last - 1] || _macd.macdLine[last - 1];

        const cciVal = cciValues[last] || 0;
        const stK = stochValues.k[last] || 50;
        const stD = stochValues.d[last] || 50;
        const wR = williamsValues[last] || -50;
        const vrocVal = vrocValues[last] || 0;

        let score = 50;
        if (close > _ema20) score += 10;
        if (close > _ema50) score += 10;
        if (currentM > prevM) score += 10;
        if (_rsi[last] > 50 && _rsi[last] < 70) score += 10;
        if (_adx.adx[last] > 20) score += 10;
        // Add inertia and momentum
        if (roc10[last] > 0) score += 5;
        if (roc20[last] > 5) score += 5;
        if (close > bb.upper[last]) score += 5; // potential breakout

        // Add custom indicator scoring contributions
        if (cciVal > 100) score += 5;
        if (stK > stD) score += 5;
        if (wR > -20) score += 5;
        if (vrocVal > 5) score += 5;

        score = Math.min(100, score);

        // Add weak/neutral/downtrend classification based on score
        let classification = "Neutral";
        if (score >= 70) classification = "UP Strong";
        else if (score >= 55) classification = "UP Weak";
        else if (score < 45) classification = "DOWN";

        // Retrieve the trained pattern for Learning Trend to adjust probability and expectancy!
        const getPattern = db.prepare(
          `SELECT * FROM trained_patterns WHERE symbol = ? AND setup_name = ?`,
        );
        const trainedInfo = getPattern.get(sym, "Learning Trend") as any;

        const baseProbability = trainedInfo ? trainedInfo.winRate : 0.5;
        const expectancy = trainedInfo ? trainedInfo.avgExpectancy : 0.0;

        // Blend the historically learned high-precision winRate with the current indicators score
        // This guarantees unique floating-point numbers per stock and prevents alphabetical fallback!
        const blendedProbability = baseProbability * 0.7 + (score / 100) * 0.3;

        if (score >= 70) {
          const f_strength = Math.round(blendedProbability * 100 * (score / 100));
          const f_gain = trainedInfo ? (trainedInfo.avgBullGain || trainedInfo.avgBullMove || 5.0) : 5.0;
          const f_time = trainedInfo ? (trainedInfo.avgBullMoveTime || 5) : 5;
          const f_speed = Number((f_gain / (f_time || 5)).toFixed(3));
          const f_duration = Math.ceil(f_time);
          const f_max_value = close * (1 + f_gain / 100);

          const insertStmt = db.prepare(`
                        INSERT OR REPLACE INTO scanner_results (
                            date, symbol, setup_name, generic_score, specific_score, 
                            probability, classification, entry_price, stop_price, target_1, expectancy,
                            growth_strength, growth_speed, growth_duration, max_estimated_value
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
          insertStmt.run(
            new Date().toISOString(),
            sym,
            `Learning Trend (${options.timeframe || "PRO AUTO"} / ${interval})`,
            score / 100,
            score / 100,
            blendedProbability,
            classification,
            close,
            _ema50,
            close * (1 + f_gain / 100),
            expectancy,
            f_strength,
            f_speed,
            f_duration,
            f_max_value
          );
        }
      } else {
        // Iterate over history and find where our score was bullish
        let targetScoreThresh = 70;
        let attempts = 0;

        while (learningDataCount === 0 && attempts < 3) {
          learningDataCount = 0;
          bullWins = 0;
          bullMoves = 0;
          totalProfit = 0;
          totalDuration = 0;
          totalStartDelay = 0;

          for (let j = 50; j < closes.length - 15; j++) {
            const close = closes[j];
            const _ema20 = ema20[j];
            const _ema50 = ema50[j];
            const currentM = _macd.histogram[j] || _macd.macdLine[j];
            const prevM = _macd.histogram[j - 1] || _macd.macdLine[j - 1];

            const cciVal = cciValues[j] || 0;
            const stK = stochValues.k[j] || 50;
            const stD = stochValues.d[j] || 50;
            const wR = williamsValues[j] || -50;
            const vrocVal = vrocValues[j] || 0;

            let score = 50;
            if (close > _ema20) score += 10;
            if (close > _ema50) score += 10;
            if (currentM > prevM) score += 10;
            if (_rsi[j] > 50 && _rsi[j] < 70) score += 10;
            if (_adx.adx[j] > 20) score += 10;
            if (roc10[j] > 0) score += 5;
            if (roc20[j] > 5) score += 5;
            if (close > bb.upper[j]) score += 5;

            if (cciVal > 100) score += 5;
            if (stK > stD) score += 5;
            if (wR > -20) score += 5;
            if (vrocVal > 5) score += 5;

            score = Math.min(100, score);

            if (score >= targetScoreThresh) {
              learningDataCount++;

              // Measure 15 periods ahead
              let maxFwd = -Infinity;
              let maxIdx = j;
              for (let f = 1; f <= 15; f++) {
                if (closes[j + f] > maxFwd) {
                  maxFwd = closes[j + f];
                  maxIdx = j + f;
                }
              }

              const fwdReturn = (closes[j + 15] - close) / close;
              const maxExcursion = (maxFwd - close) / close;

              let thresh = 0.05;
              if (interval === "60m") thresh = 0.015;
              if (interval === "15m") thresh = 0.005;

              const win = maxExcursion >= thresh;
              if (win) {
                bullWins++;
                bullMoves += maxExcursion * 100;
                totalDuration += maxIdx - j;

                let delay = 1;
                for (let f = 1; f <= 15; f++) {
                  if ((closes[j + f] - close) / close > thresh / 2) {
                    delay = f;
                    break;
                  }
                }
                totalStartDelay += delay;
              }
              totalProfit += fwdReturn * 100;
            }
          }

          if (learningDataCount === 0) {
            targetScoreThresh -= 10; // lower threshold to match weaker signals if strong signals are rare
            attempts++;
          } else {
            break;
          }
        }

        if (learningDataCount > 0) {
          const winRateDecimal = bullWins / learningDataCount;
          const avgExpectancy = totalProfit / learningDataCount;
          const avgBullMove = bullWins > 0 ? bullMoves / bullWins : 0;

          const teachingQuality = Math.min(
            99.9,
            85 +
              (learningDataCount / (closes.length || 1)) * 10 +
              winRateDecimal * 5,
          );
          const modelFittingPerformance = Math.min(
            99.9,
            80 + winRateDecimal * 10 + avgExpectancy * 2,
          );

          const avgBullMoveTime = bullWins > 0 ? totalDuration / bullWins : 5;

          const insertPattern = db.prepare(`
                        INSERT OR REPLACE INTO trained_patterns (
                            symbol, setup_name, training_timeframe, patternsFound, winRate, avgExpectancy, avgBullMove, avgBearMove, sampleSize, teachingQuality, modelFittingPerformance,
                            avgBullGain, avgBearGain, avgBullMoveTime, avgBearMoveTime
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

          insertPattern.run(
            sym,
            "Learning Trend",
            `${options.timeframe || "PRO AUTO"} / ${interval}`,
            learningDataCount,
            winRateDecimal,
            avgExpectancy,
            avgBullMove,
            0, // bear move
            closes.length, // use total dataset bars to reflect dataset size correctly
            teachingQuality,
            modelFittingPerformance,
            avgBullMove, // avgBullGain
            0, // avgBearGain
            avgBullMoveTime,
            5, // avgBearMoveTime
          );
        }
      }
    } catch (e) {
      console.error(`Trend Learning Error for ${sym}:`, e);
    }
  }

  systemStatus.isProcessing = false;
  systemStatus.phase = "Idle";
  systemStatus.stage = "Waiting";
  systemStatus.progress = 0;
}
