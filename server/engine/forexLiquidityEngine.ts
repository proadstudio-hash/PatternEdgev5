import { Candle, LiquidityLevel, LiquiditySignal, SignalStatus, SignalDirection } from '../../src/types/forexLiquidity';

// Timezone defaults to Europe/Rome
const DEFAULT_TIMEZONE = 'Europe/Rome';

/**
 * Returns the pip or tick size for a given symbol
 */
export function getPipSize(symbol: string, currentPrice = 1.0): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('JPY')) {
    return 0.01;
  }
  if (sym.includes('EUR') || sym.includes('GBP') || sym.includes('USD') || sym.includes('AUD') || sym.includes('NZD') || sym.includes('CAD') || sym.includes('CHF')) {
    // Forex pair (non-JPY)
    return 0.0001;
  }
  // For stocks/crypto/indices: adaptive scale
  if (currentPrice > 1000) {
    return 1.0; // Bitcoin / Large Index
  }
  if (currentPrice > 100) {
    return 0.1;
  }
  if (currentPrice > 1) {
    return 0.01;
  }
  return 0.0001;
}

/**
 * Converts price distance to pips/points
 */
export function priceToPips(symbol: string, priceDistance: number, currentPrice = 1.0): number {
  const pipSize = getPipSize(symbol, currentPrice);
  return priceDistance / pipSize;
}

/**
 * Calculates average true range (ATR)
 */
export function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  
  if (trs.length === 0) return 0;
  const slice = trs.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / slice.length;
}

/**
 * Returns formatted hour and minute in timezone
 */
export function getHourMinuteInTimezone(date: Date, tz: string = DEFAULT_TIMEZONE): { hour: number; minute: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const formatted = formatter.format(date); // "14:35"
    const [h, m] = formatted.split(':').map(Number);
    return { hour: h, minute: m };
  } catch (e) {
    return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isTimeInWindow(hour: number, minute: number, startStr: string, endStr: string): boolean {
  const currentMin = hour * 60 + minute;
  const startMin = timeToMinutes(startStr);
  const endMin = timeToMinutes(endStr);
  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  } else {
    // Overnight window
    return currentMin >= startMin || currentMin < endMin;
  }
}

/**
 * Determines which session a timestamp falls into
 */
export function getSession(timestamp: string | Date, timezone = DEFAULT_TIMEZONE, config: any): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (isNaN(date.getTime())) return 'DEAD_SESSION';

  const { hour, minute } = getHourMinuteInTimezone(date, timezone);

  const asiaStart = config?.asiaStart || '00:00';
  const asiaEnd = config?.asiaEnd || '08:00';
  const londonStart = config?.londonStart || '08:00';
  const londonEnd = config?.londonEnd || '11:00';
  const nyStart = config?.nyStart || '14:00';
  const nyEnd = config?.nyEnd || '17:00';

  if (isTimeInWindow(hour, minute, asiaStart, asiaEnd)) {
    return 'ASIA';
  }
  if (isTimeInWindow(hour, minute, londonStart, londonEnd)) {
    return 'LONDON';
  }
  if (isTimeInWindow(hour, minute, nyStart, nyEnd)) {
    return 'NEW_YORK';
  }
  if (hour === 23 || (hour === 22 && minute >= 45)) {
    return 'ROLLOVER';
  }
  return 'DEAD_SESSION';
}

/**
 * Generate Round Numbers around the current price
 */
export function calculateRoundNumbers(symbol: string, currentPrice: number) {
  const roundLevels: { price: number; type: "ROUND_MAJOR" | "ROUND_MEDIUM" | "ROUND_MINOR"; label: string }[] = [];
  
  let majorStep = 10;
  let mediumStep = 5;
  let minorStep = 1;
  
  const sym = symbol.toUpperCase();
  const isJpy = sym.includes('JPY');
  const isForex = sym.includes('/') || sym.includes('_') || sym.includes('=X') || sym.includes('-');
  
  if (isForex && !sym.includes('USD-') && !sym.includes('BTC') && !sym.includes('ETH')) {
    if (isJpy) {
      majorStep = 1.0;
      mediumStep = 0.50;
      minorStep = 0.10;
    } else {
      majorStep = 0.0100;
      mediumStep = 0.0050;
      minorStep = 0.0010;
    }
  } else {
    // Crypto / Stocks / Indices
    if (currentPrice > 1000) {
      majorStep = 1000;
      mediumStep = 500;
      minorStep = 100;
    } else if (currentPrice > 100) {
      majorStep = 100;
      mediumStep = 50;
      minorStep = 10;
    } else {
      majorStep = 10;
      mediumStep = 5;
      minorStep = 1;
    }
  }
  
  // Major round levels
  const baseMajor = Math.floor(currentPrice / majorStep) * majorStep;
  for (let i = -2; i <= 2; i++) {
    const price = baseMajor + i * majorStep;
    if (price > 0) {
      roundLevels.push({
        price: parseFloat(price.toFixed(5)),
        type: "ROUND_MAJOR",
        label: `Round Major (${price.toFixed(isForex ? (isJpy ? 2 : 4) : 2)})`
      });
    }
  }

  // Medium round levels
  const baseMedium = Math.floor(currentPrice / mediumStep) * mediumStep;
  for (let i = -2; i <= 2; i++) {
    const price = baseMedium + i * mediumStep;
    if (price > 0 && Math.abs(price % majorStep) > 0.000001) {
      roundLevels.push({
        price: parseFloat(price.toFixed(5)),
        type: "ROUND_MEDIUM",
        label: `Round Medium (${price.toFixed(isForex ? (isJpy ? 2 : 4) : 2)})`
      });
    }
  }

  // Minor round levels
  const baseMinor = Math.floor(currentPrice / minorStep) * minorStep;
  for (let i = -2; i <= 2; i++) {
    const price = baseMinor + i * minorStep;
    if (price > 0 && Math.abs(price % majorStep) > 0.000001 && Math.abs(price % mediumStep) > 0.000001) {
      roundLevels.push({
        price: parseFloat(price.toFixed(5)),
        type: "ROUND_MINOR",
        label: `Round Minor (${price.toFixed(isForex ? (isJpy ? 2 : 4) : 2)})`
      });
    }
  }
  
  return roundLevels;
}

/**
 * Calculates liquidity levels with strengths and distances
 */
export function calculateLiquidityLevels(
  symbol: string,
  currentPrice: number,
  candlesDaily: Candle[],
  candlesIntraday: Candle[],
  config: any
): {
  symbol: string;
  currentPrice: number;
  previousDayHigh: number;
  previousDayLow: number;
  previousDayClose: number;
  dailyOpen: number;
  asiaHigh: number;
  asiaLow: number;
  weeklyHigh: number;
  weeklyLow: number;
  weeklyOpen: number;
  allLevels: LiquidityLevel[];
} {
  let previousDayHigh = 0;
  let previousDayLow = 0;
  let previousDayClose = 0;
  let dailyOpen = currentPrice;
  let weeklyHigh = 0;
  let weeklyLow = 0;
  let weeklyOpen = 0;
  let asiaHigh = 0;
  let asiaLow = 0;

  const timezone = config?.timezone || DEFAULT_TIMEZONE;

  // Process Daily levels
  if (candlesDaily && candlesDaily.length > 0) {
    // Last candle represents today, second-to-last is previous day
    const len = candlesDaily.length;
    let prevDayCandle = candlesDaily[len - 1];
    let currentDayCandle = candlesDaily[len - 1];

    if (len >= 2) {
      prevDayCandle = candlesDaily[len - 2];
      previousDayHigh = prevDayCandle.high;
      previousDayLow = prevDayCandle.low;
      previousDayClose = prevDayCandle.close;
      dailyOpen = currentDayCandle.open;
    } else {
      previousDayHigh = prevDayCandle.high;
      previousDayLow = prevDayCandle.low;
      previousDayClose = prevDayCandle.close;
    }

    // Weekly high/low/open (last 5 daily candles)
    const weeklyCandles = candlesDaily.slice(-5);
    weeklyHigh = Math.max(...weeklyCandles.map(c => c.high));
    weeklyLow = Math.min(...weeklyCandles.map(c => c.low));
    weeklyOpen = weeklyCandles[0].open;
  }

  // Process Asia High/Low from intraday candles
  if (candlesIntraday && candlesIntraday.length > 0) {
    const asiaStart = config?.asiaStart || '00:00';
    const asiaEnd = config?.asiaEnd || '08:00';

    const asiaCandles = candlesIntraday.filter(c => {
      const date = new Date(c.time);
      const { hour, minute } = getHourMinuteInTimezone(date, timezone);
      return isTimeInWindow(hour, minute, asiaStart, asiaEnd);
    });

    if (asiaCandles.length > 0) {
      asiaHigh = Math.max(...asiaCandles.map(c => c.high));
      asiaLow = Math.min(...asiaCandles.map(c => c.low));
    }
  }

  // Construct raw levels list
  const rawLevels: { type: LiquidityLevel['type']; price: number; label: string; strength: number }[] = [];

  if (weeklyHigh > 0) rawLevels.push({ type: 'WEEKLY_HIGH', price: weeklyHigh, label: 'Weekly High', strength: 30 });
  if (weeklyLow > 0) rawLevels.push({ type: 'WEEKLY_LOW', price: weeklyLow, label: 'Weekly Low', strength: 30 });
  if (weeklyOpen > 0) rawLevels.push({ type: 'DAILY_OPEN', price: weeklyOpen, label: 'Weekly Open', strength: 15 });

  if (previousDayHigh > 0) rawLevels.push({ type: 'PREVIOUS_DAY_HIGH', price: previousDayHigh, label: 'Previous Day High', strength: 25 });
  if (previousDayLow > 0) rawLevels.push({ type: 'PREVIOUS_DAY_LOW', price: previousDayLow, label: 'Previous Day Low', strength: 25 });
  if (previousDayClose > 0) rawLevels.push({ type: 'ROUND_MINOR', price: previousDayClose, label: 'Previous Day Close', strength: 12 });
  if (dailyOpen > 0) rawLevels.push({ type: 'DAILY_OPEN', price: dailyOpen, label: 'Daily Open', strength: 15 });

  if (asiaHigh > 0) rawLevels.push({ type: 'ASIA_HIGH', price: asiaHigh, label: 'Asia High', strength: 22 });
  if (asiaLow > 0) rawLevels.push({ type: 'ASIA_LOW', price: asiaLow, label: 'Asia Low', strength: 22 });

  // Round numbers
  const rounds = calculateRoundNumbers(symbol, currentPrice);
  rounds.forEach(r => {
    let str = 10;
    if (r.type === 'ROUND_MAJOR') str = 18;
    else if (r.type === 'ROUND_MEDIUM') str = 14;
    else if (r.type === 'ROUND_MINOR') str = 10;
    rawLevels.push({ type: r.type, price: r.price, label: r.label, strength: str });
  });

  // Minor intraday swing high/low (calculate simple 5-bar swing high/low)
  if (candlesIntraday && candlesIntraday.length >= 10) {
    // Find some swing points
    for (let i = 2; i < candlesIntraday.length - 2; i++) {
      const c = candlesIntraday[i];
      const left1 = candlesIntraday[i - 1];
      const left2 = candlesIntraday[i - 2];
      const right1 = candlesIntraday[i + 1];
      const right2 = candlesIntraday[i + 2];

      if (c.high > left1.high && c.high > left2.high && c.high > right1.high && c.high > right2.high) {
        rawLevels.push({ type: 'INTRADAY_SWING', price: c.high, label: 'Intraday Swing High', strength: 10 });
      }
      if (c.low < left1.low && c.low < left2.low && c.low < right1.low && c.low < right2.low) {
        rawLevels.push({ type: 'INTRADAY_SWING', price: c.low, label: 'Intraday Swing Low', strength: 10 });
      }
    }
  }

  // Filter out invalid levels and map to final schema with distances
  const filteredLevels: LiquidityLevel[] = [];
  const processedPrices = new Set<string>();

  // Sort raw levels by strength desc, so we keep the stronger one if prices are extremely close
  rawLevels.sort((a, b) => b.strength - a.strength);

  for (const rl of rawLevels) {
    if (rl.price <= 0 || isNaN(rl.price)) continue;
    
    // De-duplicate levels that are incredibly close to each other (e.g. within 0.01% of price)
    const pctDiff = (Math.abs(currentPrice - rl.price) / currentPrice) * 100;
    const key = rl.price.toFixed(symbol.includes('JPY') ? 2 : 5);
    
    if (processedPrices.has(key)) continue;
    processedPrices.add(key);

    const distancePips = Math.round(priceToPips(symbol, Math.abs(currentPrice - rl.price), currentPrice) * 10) / 10;
    const distancePercent = Math.round(((Math.abs(currentPrice - rl.price) / currentPrice) * 100) * 100) / 100;

    filteredLevels.push({
      type: rl.type,
      label: rl.label,
      price: rl.price,
      strength: rl.strength,
      distancePips,
      distancePercent
    });
  }

  return {
    symbol,
    currentPrice,
    previousDayHigh,
    previousDayLow,
    previousDayClose,
    dailyOpen,
    asiaHigh,
    asiaLow,
    weeklyHigh,
    weeklyLow,
    weeklyOpen,
    allLevels: filteredLevels
  };
}

/**
 * Detects whether a liquidity sweep has occurred
 */
export function detectLiquiditySweep(
  symbol: string,
  candlesM5: Candle[],
  levels: LiquidityLevel[],
  config: any,
  atrM15 = 0.0015
): {
  direction: SignalDirection;
  sweptLevel?: LiquidityLevel;
  sweepExtreme?: number;
  sweepCandleIdx?: number;
} {
  if (candlesM5.length < 3) {
    return { direction: 'NONE' };
  }

  const sym = symbol.toUpperCase();
  const isJpy = sym.includes('JPY');
  const isForex = sym.includes('/') || sym.includes('_') || sym.includes('=X') || sym.includes('-');

  // Minimum sweep threshold
  let fixedSymbolThreshold = 0.0004; // default 4 pips
  if (isForex) {
    if (isJpy) {
      fixedSymbolThreshold = 0.06; // 6 pips
    } else if (sym.includes('GBP')) {
      fixedSymbolThreshold = 0.0005; // 5 pips
    } else {
      fixedSymbolThreshold = 0.0003; // 3 pips
    }
  } else {
    // Stocks / crypto / indices
    fixedSymbolThreshold = candlesM5[candlesM5.length - 1].close * 0.001; // 0.1% of price
  }

  const minimumSweepDistance = Math.max(fixedSymbolThreshold, atrM15 * 0.08);

  // Scan only the last 4 candles to find active sweeps
  const startIndex = Math.max(0, candlesM5.length - 4);

  for (let i = candlesM5.length - 1; i >= startIndex; i--) {
    const candle = candlesM5[i];
    
    for (const lvl of levels) {
      // Bulllish Sweep: low of candle is below lvl.price, but close of candle is above lvl.price
      if (candle.low < lvl.price && candle.close > lvl.price) {
        const sweepDist = lvl.price - candle.low;
        if (sweepDist >= minimumSweepDistance) {
          // Verify it's not an excessively large candle
          const candleRange = candle.high - candle.low;
          if (candleRange <= atrM15 * 1.8) {
            return {
              direction: 'BULLISH',
              sweptLevel: lvl,
              sweepExtreme: candle.low,
              sweepCandleIdx: i
            };
          }
        }
      }

      // Bearish Sweep: high of candle is above lvl.price, but close of candle is below lvl.price
      if (candle.high > lvl.price && candle.close < lvl.price) {
        const sweepDist = candle.high - lvl.price;
        if (sweepDist >= minimumSweepDistance) {
          const candleRange = candle.high - candle.low;
          if (candleRange <= atrM15 * 1.8) {
            return {
              direction: 'BEARISH',
              sweptLevel: lvl,
              sweepExtreme: candle.high,
              sweepCandleIdx: i
            };
          }
        }
      }
    }
  }

  return { direction: 'NONE' };
}

/**
 * Checks for microstructure confirmation (BOS/MSS)
 */
export function detectMicrostructureConfirmation(
  candlesM5: Candle[],
  sweepDirection: SignalDirection,
  sweepCandleIdx?: number
): boolean {
  if (sweepDirection === 'NONE' || candlesM5.length < 3) return false;

  const lastCandle = candlesM5[candlesM5.length - 1];
  const prevCandle = candlesM5[candlesM5.length - 2];

  // If sweep was very recent, we might have basic price recovery (close > high of previous candle or simple higher-high)
  if (sweepDirection === 'BULLISH') {
    // Bullish confirmations:
    // 1. Last candle close is above previous candle's high
    // 2. Formed higher high and higher low
    const isHigherHigh = lastCandle.high > prevCandle.high && lastCandle.low > prevCandle.low;
    const isBOS = lastCandle.close > Math.max(prevCandle.high, candlesM5[Math.max(0, candlesM5.length - 3)].high);
    return isHigherHigh || isBOS || lastCandle.close > prevCandle.high;
  } else if (sweepDirection === 'BEARISH') {
    // Bearish confirmations:
    // 1. Last candle close is below previous candle's low
    // 2. Formed lower high and lower low
    const isLowerLow = lastCandle.low < prevCandle.low && lastCandle.high < prevCandle.high;
    const isBOS = lastCandle.close < Math.min(prevCandle.low, candlesM5[Math.max(0, candlesM5.length - 3)].low);
    return isLowerLow || isBOS || lastCandle.close < prevCandle.low;
  }

  return false;
}

/**
 * Primary Scoring Function (0 - 100)
 */
export function calculateLiquidityScore(candidate: LiquiditySignal): number {
  let score = 0;

  score += candidate.components.levelQuality ?? 0;
  score += candidate.components.sweepQuality ?? 0;
  score += candidate.components.session ?? 0;
  score += candidate.components.microstructure ?? 0;
  score += candidate.components.riskReward ?? 0;
  score += candidate.components.spread ?? 0;
  score += candidate.components.volatility ?? 0;

  score -= Math.abs(candidate.components.newsPenalty ?? 0);

  if (candidate.warnings?.some(w => w.includes("BLOCKED"))) {
    return Math.min(score, 39);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
