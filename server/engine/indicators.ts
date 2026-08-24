import { OHLCV } from '../models.js';

export function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

export function rsi(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length <= period) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }

  return result;
}

export function atr(high: number[], low: number[], close: number[], period: number): number[] {
  const result: number[] = new Array(high.length).fill(NaN);
  const tr: number[] = new Array(high.length).fill(0);
  
  if (high.length === 0) return result;
  tr[0] = high[0] - low[0];
  
  for (let i = 1; i < high.length; i++) {
    const hL = high[i] - low[i];
    const hC = Math.abs(high[i] - close[i - 1]);
    const lC = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hL, hC, lC);
  }

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += tr[i];
  }
  if (high.length >= period) result[period - 1] = sum / period;

  let avgTr = sum / period;
  for (let i = period; i < high.length; i++) {
    avgTr = (avgTr * (period - 1) + tr[i]) / period;
    result[i] = avgTr;
  }
  
  return result;
}

export function bollingerBands(data: number[], period: number, stdDevMult: number = 2) {
  const middle = sma(data, period);
  const upper = new Array(data.length).fill(NaN);
  const lower = new Array(data.length).fill(NaN);
  
  for (let i = period - 1; i < data.length; i++) {
    let sumSq = 0;
    const mean = middle[i];
    for (let j = 0; j < period; j++) {
      sumSq += Math.pow(data[i - j] - mean, 2);
    }
    const stdDev = Math.sqrt(sumSq / period);
    upper[i] = mean + (stdDevMult * stdDev);
    lower[i] = mean - (stdDevMult * stdDev);
  }
  
  return { lower, middle, upper };
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period) return result;
  
  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period; // Simple moving average for the first point

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

export function macd(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const fastEma = ema(data, fastPeriod);
  const slowEma = ema(data, slowPeriod);
  
  const macdLine = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(fastEma[i]) && !isNaN(slowEma[i])) {
      macdLine[i] = fastEma[i] - slowEma[i];
    }
  }

  // To calculate signal line (EMA of MACD line), we need a valid series without NaNs
  // We'll just pass the slice starting from where MACD has a value
  const validMacdStartIndex = macdLine.findIndex(val => !isNaN(val));
  const signalLine = new Array(data.length).fill(NaN);
  const histogram = new Array(data.length).fill(NaN);

  if (validMacdStartIndex !== -1) {
    const validMacdLine = macdLine.slice(validMacdStartIndex);
    const validSignalLine = ema(validMacdLine, signalPeriod);
    
    for (let i = 0; i < validSignalLine.length; i++) {
      signalLine[i + validMacdStartIndex] = validSignalLine[i];
      if (!isNaN(validSignalLine[i])) {
        histogram[i + validMacdStartIndex] = macdLine[i + validMacdStartIndex] - validSignalLine[i];
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

export function obv(closes: number[], volumes: number[]): number[] {
  const result: number[] = new Array(closes.length).fill(0);
  if (closes.length === 0) return result;
  
  result[0] = volumes[0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      result[i] = result[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      result[i] = result[i - 1] - volumes[i];
    } else {
      result[i] = result[i - 1];
    }
  }
  return result;
}

export function adx(high: number[], low: number[], close: number[], period: number = 14) {
  const n = high.length;
  const adxValues: number[] = new Array(n).fill(NaN);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  
  if (n < period * 2) return { adx: adxValues, plusDI, minusDI };

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const hL = high[i] - low[i];
    const hC = Math.abs(high[i] - close[i - 1]);
    const lC = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hL, hC, lC);

    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];

    if (upMove > downMove && upMove > 0) {
      plusDM[i] = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM[i] = downMove;
    }
  }

  // Smooth using Wilder's EMA
  const smoothTR: number[] = new Array(n).fill(0);
  const smoothPlusDM: number[] = new Array(n).fill(0);
  const smoothMinusDM: number[] = new Array(n).fill(0);

  let initialTR = 0;
  let initialPlusDM = 0;
  let initialMinusDM = 0;

  for (let i = 1; i <= period; i++) {
    initialTR += tr[i];
    initialPlusDM += plusDM[i];
    initialMinusDM += minusDM[i];
  }

  smoothTR[period] = initialTR;
  smoothPlusDM[period] = initialPlusDM;
  smoothMinusDM[period] = initialMinusDM;

    if (smoothTR[period] !== 0) {
      plusDI[period] = 100 * (smoothPlusDM[period] / smoothTR[period]);
      minusDI[period] = 100 * (smoothMinusDM[period] / smoothTR[period]);
    } else {
      plusDI[period] = 0;
      minusDI[period] = 0;
    }

  for (let i = period + 1; i < n; i++) {
    smoothTR[i] = smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr[i];
    smoothPlusDM[i] = smoothPlusDM[i - 1] - (smoothPlusDM[i - 1] / period) + plusDM[i];
    smoothMinusDM[i] = smoothMinusDM[i - 1] - (smoothMinusDM[i - 1] / period) + minusDM[i];

    if (smoothTR[i] !== 0) {
      plusDI[i] = 100 * (smoothPlusDM[i] / smoothTR[i]);
      minusDI[i] = 100 * (smoothMinusDM[i] / smoothTR[i]);
    } else {
      plusDI[i] = 0;
      minusDI[i] = 0;
    }
  }

  const dx: number[] = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    const sum = plusDI[i] + minusDI[i];
    if (sum !== 0 && !isNaN(sum)) {
      dx[i] = 100 * Math.abs(plusDI[i] - minusDI[i]) / sum;
    }
  }

  let initialDX = 0;
  for (let i = period; i < period * 2; i++) {
    initialDX += dx[i];
  }
  adxValues[period * 2 - 1] = initialDX / period;

  for (let i = period * 2; i < n; i++) {
    adxValues[i] = (adxValues[i - 1] * (period - 1) + dx[i]) / period;
  }

  return { adx: adxValues, plusDI, minusDI };
}

export function supertrend(high: number[], low: number[], close: number[], period: number = 10, multiplier: number = 3) {
  const n = high.length;
  const trend: number[] = new Array(n).fill(1); // 1 for bull, -1 for bear
  const supertrendValues: number[] = new Array(n).fill(NaN);
  
  const atrValues = atr(high, low, close, period);
  
  const upperBand: number[] = new Array(n).fill(NaN);
  const lowerBand: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    if (isNaN(atrValues[i])) continue;
    
    const mid = (high[i] + low[i]) / 2;
    let basicUpper = mid + (multiplier * atrValues[i]);
    let basicLower = mid - (multiplier * atrValues[i]);

    if (i > 0) {
      upperBand[i] = (basicUpper < upperBand[i - 1] || close[i - 1] > upperBand[i - 1]) ? basicUpper : upperBand[i - 1];
      lowerBand[i] = (basicLower > lowerBand[i - 1] || close[i - 1] < lowerBand[i - 1]) ? basicLower : lowerBand[i - 1];
    } else {
      upperBand[i] = basicUpper;
      lowerBand[i] = basicLower;
    }

    if (i > 0) {
      trend[i] = trend[i - 1];
      if (trend[i] === 1 && close[i] < lowerBand[i]) {
        trend[i] = -1;
      } else if (trend[i] === -1 && close[i] > upperBand[i]) {
        trend[i] = 1;
      }
    }
    
    supertrendValues[i] = trend[i] === 1 ? lowerBand[i] : upperBand[i];
  }

  return { supertrend: supertrendValues, direction: trend };
}

export function detectStructure(high: number[], low: number[], window: number = 5) {
    const n = high.length;
    const structure: string[] = new Array(n).fill("Neutral"); // HH, HL, LH, LL
    
    const pivots: { index: number, type: 'high' | 'low', price: number }[] = [];

    for (let i = window; i < n - window; i++) {
        // High Pivot
        let isHigh = true;
        for (let j = 1; j <= window; j++) {
            if (high[i] <= high[i - j] || high[i] <= high[i + j]) {
                isHigh = false;
                break;
            }
        }
        if (isHigh) pivots.push({ index: i, type: 'high', price: high[i] });

        // Low Pivot
        let isLow = true;
        for (let j = 1; j <= window; j++) {
            if (low[i] >= low[i - j] || low[i] >= low[i + j]) {
                isLow = false;
                break;
            }
        }
        if (isLow) pivots.push({ index: i, type: 'low', price: low[i] });
    }

    pivots.forEach((p, idx) => {
        const prev = pivots.slice(0, idx).reverse().find(o => o.type === p.type);
        if (!prev) return;

        if (p.type === 'high') {
            if (p.price > prev.price) structure[p.index] = "HH";
            else structure[p.index] = "LH";
        } else {
            if (p.price > prev.price) structure[p.index] = "HL";
            else structure[p.index] = "LL";
        }
    });

    // Fill forward structure for easy access
    let last = "Neutral";
    for (let i = 0; i < n; i++) {
        if (structure[i] !== "Neutral") last = structure[i];
        else structure[i] = last;
    }

    return structure;
}

export function calculateFibonacciPivots(high: number[], low: number[], close: number[]) {
  const n = high.length;
  const pivots = {
    P: new Array(n).fill(NaN),
    R1: new Array(n).fill(NaN),
    R2: new Array(n).fill(NaN),
    R3: new Array(n).fill(NaN),
    S1: new Array(n).fill(NaN),
    S2: new Array(n).fill(NaN),
    S3: new Array(n).fill(NaN)
  };
  
  // Using previous bar for the pivot points of the current bar
  for (let i = 1; i < n; i++) {
    const prevH = high[i - 1];
    const prevL = low[i - 1];
    const prevC = close[i - 1];
    
    const P = (prevH + prevL + prevC) / 3;
    const range = prevH - prevL;
    
    pivots.P[i] = P;
    pivots.R1[i] = P + 0.382 * range;
    pivots.R2[i] = P + 0.618 * range;
    pivots.R3[i] = P + 1.000 * range;
    pivots.S1[i] = P - 0.382 * range;
    pivots.S2[i] = P - 0.618 * range;
    pivots.S3[i] = P - 1.000 * range;
  }
  return pivots;
}

export function roc(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period; i < data.length; i++) {
    if (!isNaN(data[i]) && !isNaN(data[i - period]) && data[i - period] !== 0) {
      result[i] = ((data[i] - data[i - period]) / data[i - period]) * 100;
    }
  }
  return result;
}

export function momentum(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period; i < data.length; i++) {
    if (!isNaN(data[i]) && !isNaN(data[i - period])) {
      result[i] = data[i] - data[i - period];
    }
  }
  return result;
}

export function cci(high: number[], low: number[], close: number[], period: number = 20): number[] {
  const n = close.length;
  const result: number[] = new Array(n).fill(NaN);
  if (n < period) return result;

  const tp: number[] = [];
  for (let i = 0; i < n; i++) {
    tp.push((high[i] + low[i] + close[i]) / 3);
  }

  const smaTp = sma(tp, period);

  for (let i = period - 1; i < n; i++) {
    let meanDev = 0;
    for (let j = 0; j < period; j++) {
      meanDev += Math.abs(tp[i - j] - smaTp[i]);
    }
    meanDev = meanDev / period;
    if (meanDev !== 0) {
      result[i] = (tp[i] - smaTp[i]) / (0.015 * meanDev);
    } else {
      result[i] = 0;
    }
  }
  return result;
}

export function stochastic(high: number[], low: number[], close: number[], period: number = 14, smoothK: number = 3): { k: number[], d: number[] } {
  const n = close.length;
  const k: number[] = new Array(n).fill(NaN);
  
  for (let i = period - 1; i < n; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = 0; j < period; j++) {
      if (high[i - j] > highestHigh) highestHigh = high[i - j];
      if (low[i - j] < lowestLow) lowestLow = low[i - j];
    }
    const denom = highestHigh - lowestLow;
    if (denom !== 0) {
      k[i] = ((close[i] - lowestLow) / denom) * 100;
    } else {
      k[i] = 50;
    }
  }

  const d = sma(k.map(val => isNaN(val) ? 50 : val), smoothK);
  for (let i = 0; i < n; i++) {
    if (isNaN(k[i])) d[i] = NaN;
  }

  return { k, d };
}

export function williamsR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const n = close.length;
  const result: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = 0; j < period; j++) {
      if (high[i - j] > highestHigh) highestHigh = high[i - j];
      if (low[i - j] < lowestLow) lowestLow = low[i - j];
    }
    const denom = highestHigh - lowestLow;
    if (denom !== 0) {
      result[i] = ((highestHigh - close[i]) / denom) * -100;
    } else {
      result[i] = -50;
    }
  }
  return result;
}

export function vroc(volume: number[], period: number = 14): number[] {
  const result: number[] = new Array(volume.length).fill(NaN);
  for (let i = period; i < volume.length; i++) {
    if (volume[i - period] !== 0) {
      result[i] = ((volume[i] - volume[i - period]) / volume[i - period]) * 100;
    } else {
      result[i] = 0;
    }
  }
  return result;
}

export function calculateFeatures(bars: OHLCV[]) {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const vols = bars.map(b => b.volume);

  const sma20 = sma(closes, 20);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const sma200 = sma(closes, 200);
  const volSma20 = sma(vols, 20);
  const rsi14 = rsi(closes, 14);
  const rsi2 = rsi(closes, 2);
  const atr14 = atr(highs, lows, closes, 14);
  const bb = bollingerBands(closes, 20, 2);
  const macdData = macd(closes, 12, 26, 9);
  const adxData = adx(highs, lows, closes, 14);
  const stData = supertrend(highs, lows, closes, 10, 3);
  const obvValues = obv(closes, vols);
  const marketStructure = detectStructure(highs, lows, 5);
  const fibPivots = calculateFibonacciPivots(highs, lows, closes);
  const roc10 = roc(closes, 10);
  const roc20 = roc(closes, 20);
  const mom20 = momentum(closes, 20);

  const cciValues = cci(highs, lows, closes, 20);
  const stochData = stochastic(highs, lows, closes, 14, 3);
  const williamsRValues = williamsR(highs, lows, closes, 14);
  const vrocValues = vroc(vols, 14);

  return bars.map((bar, i) => {
    const bbWidth = bb.upper[i] && bb.lower[i] && bb.middle[i] ? ((bb.upper[i] - bb.lower[i]) / bb.middle[i]) : NaN;
    
    // slope of 50 day ema over last 5 days
    let ema50Slope = NaN;
    if (i >= 5 && !isNaN(ema50[i]) && !isNaN(ema50[i-5])) {
      ema50Slope = (ema50[i] - ema50[i-5]) / 5;
    }

    return {
      bar,
      sma20: sma20[i],
      ema20: ema20[i],
      ema50: ema50[i],
      sma200: sma200[i],
      volSma20: volSma20[i],
      rsi14: rsi14[i],
      rsi2: rsi2[i],
      atr14: atr14[i],
      bbUpper: bb.upper[i],
      bbLower: bb.lower[i],
      bbMiddle: bb.middle[i],
      bbWidth,
      ema50Slope,
      macdLine: macdData.macdLine[i],
      macdSignal: macdData.signalLine[i],
      macdHist: macdData.histogram[i],
      adx: adxData.adx[i],
      plusDI: adxData.plusDI[i],
      minusDI: adxData.minusDI[i],
      supertrend: stData.supertrend[i],
      supertrendDir: stData.direction[i],
      obv: obvValues[i],
      roc10: roc10[i],
      roc20: roc20[i],
      mom20: mom20[i],
      structure: marketStructure[i],
      cci: cciValues[i],
      stochK: stochData.k[i],
      stochD: stochData.d[i],
      williamsR: williamsRValues[i],
      vroc: vrocValues[i],
      fibPivots: {
        P: fibPivots.P[i],
        R1: fibPivots.R1[i],
        R2: fibPivots.R2[i],
        R3: fibPivots.R3[i],
        S1: fibPivots.S1[i],
        S2: fibPivots.S2[i],
        S3: fibPivots.S3[i]
      }
    };
  });
}
