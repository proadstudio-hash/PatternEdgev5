import { CanonicalBar } from "./ensembleData.js";
import { rsi, atr, bollingerBands, ema, macd, adx, supertrend, sma } from "./indicators.js";
import { CURRENT_FEATURE_VERSION } from "./ensembleConfig.js";
import { getDb } from "../db.js";

export function computeAndStoreFeatures(symbol: string, provider: string, interval: string, bars: CanonicalBar[], modelId?: string) {
  if (bars.length < 50) return [];
  
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const vols = bars.map(b => b.volume);

  const rsi14 = rsi(closes, 14);
  const atr14 = atr(highs, lows, closes, 14);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const volSma20 = sma(vols, 20);
  const macdData = macd(closes, 12, 26, 9);
  const adxData = adx(highs, lows, closes, 14);
  const stData = supertrend(highs, lows, closes, 10, 3);
  const bbData = bollingerBands(closes, 20, 2);
  const sma9 = sma(closes, 9);
  const sma100 = sma(closes, 100);

  const features = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = i > 0 ? bars[i-1] : bar;
    
    // zscore of volume
    let volZScore = 0;
    if (i >= 20) {
      let sumSq = 0;
      for (let j = 0; j < 20; j++) sumSq += Math.pow(vols[i-j] - volSma20[i], 2);
      const std = Math.sqrt(sumSq / 20) || 1;
      volZScore = (vols[i] - volSma20[i]) / std;
    }

    const returnPct = prevBar.close > 0 ? (bar.close - prevBar.close) / prevBar.close : 0;
    const atrPct = bar.close > 0 ? atr14[i] / bar.close : 0;

    const featObj = {
      symbol,
      provider,
      interval,
      timestamp_utc: bar.timestampUtc || new Date().toISOString(),
      feature_version: CURRENT_FEATURE_VERSION,
      model_id: modelId || null,
      close: bar.close,
      rsi14: rsi14[i] || 0,
      macd_histogram: macdData.histogram[i] || 0,
      macd_line: macdData.macdLine[i] || 0,
      macd_signal: macdData.signalLine[i] || 0,
      adx14: adxData.adx[i] || 0,
      atr14: atr14[i] || 0,
      supertrend_dir: stData.direction[i] || 0,
      ema20: ema20[i] || 0,
      ema50: ema50[i] || 0,
      sma9: sma9[i] || 0,
      sma100: sma100[i] || 0,
      bb_upper: bbData.upper[i] || 0,
      bb_lower: bbData.lower[i] || 0,
      volume_zscore: volZScore,
      return_pct: returnPct,
      atr_pct: atrPct
    };

    features.push(featObj);
  }

  return features;
}

export function labelFeatures(symbol: string, provider: string, interval: string, modelId: string, features: any[], horizonBars: number, targetThreshold: number, maxDrawdown: number) {
  const db = getDb();
  const insertFeatureWithLabel = db.prepare(`
    INSERT OR REPLACE INTO feature_snapshots 
    (symbol, provider, interval, timestamp_utc, feature_version, model_id, close, rsi14, macd_histogram, adx14, atr14, supertrend_dir, ema20, ema50, volume_zscore, return_pct, atr_pct, pattern_label, future_return_pct, future_max_gain_pct, future_max_drawdown_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (let i = 0; i < features.length - horizonBars; i++) {
        const feat = features[i];
        let maxGain = 0;
        let maxDd = 0;
        let finalReturn = 0;
        
        for (let j = 1; j <= horizonBars; j++) {
            const futureFeat = features[i+j];
            const change = (futureFeat.close - feat.close) / feat.close;
            if (change > maxGain) maxGain = change;
            if (change < maxDd) maxDd = change;
            if (j === horizonBars) finalReturn = change;
        }

        let label = "neutral";
        if (maxGain >= targetThreshold && maxDd > maxDrawdown && finalReturn > 0) {
           label = "bullish";
        } else if (maxDd <= -targetThreshold && maxGain < -maxDrawdown && finalReturn < 0) {
           label = "bearish";
        }

        if (label !== "neutral") {
           insertFeatureWithLabel.run(
             symbol, provider, interval, feat.timestamp_utc, CURRENT_FEATURE_VERSION, modelId,
             feat.close || 0, feat.rsi14 || 0, feat.macd_histogram || 0, feat.adx14 || 0, feat.atr14 || 0,
             feat.supertrend_dir || 0, feat.ema20 || 0, feat.ema50 || 0, feat.volume_zscore || 0, feat.return_pct || 0, feat.atr_pct || 0,
             label, finalReturn, maxGain, maxDd
           );
        }
    }
  })();
}
