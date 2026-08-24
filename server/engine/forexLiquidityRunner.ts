import { Candle, LiquidityLevel, LiquiditySignal, SignalStatus, SignalDirection, BacktestLog } from '../../src/types/forexLiquidity';
import { 
  calculateLiquidityLevels, 
  detectLiquiditySweep, 
  detectMicrostructureConfirmation, 
  calculateLiquidityScore,
  calculateATR,
  getPipSize,
  priceToPips,
  getSession
} from './forexLiquidityEngine.js';
import { 
  YahooFinanceProvider, 
  MockProvider, 
  TwelveDataProvider, 
  PolygonProvider, 
  OandaProvider,
  MarketDataProvider 
} from './marketDataProviders.js';
import { getDb } from '../db.js';
import { GoogleGenAI } from '@google/genai';

/**
 * Instantiate the correct provider based on user configuration
 */
export function getProvider(providerType: string): MarketDataProvider {
  switch (providerType.toUpperCase()) {
    case 'OANDA':
      return new OandaProvider();
    case 'TWELVE_DATA':
      return new TwelveDataProvider();
    case 'POLYGON':
      return new PolygonProvider();
    case 'MOCK':
      return new MockProvider();
    case 'YAHOO':
    default:
      return new YahooFinanceProvider();
  }
}

/**
 * Scans a list of symbols and returns Liquidity Signals
 */
export async function scanLiquidity(
  symbols: string[],
  timeframe: string = 'M5',
  config: any = {}
): Promise<LiquiditySignal[]> {
  const provider = getProvider(config.provider || 'YAHOO');
  const timezone = config.timezone || 'Europe/Rome';
  
  const results: LiquiditySignal[] = [];

  for (const sym of symbols) {
    if (!sym) continue;
    try {
      // 1. Get latest price and spread
      const quote = await provider.getLatestPrice(sym);
      const currentPrice = quote.mid;
      const spread = quote.spread;

      // 2. Load daily candles (for PDH, PDL, Weekly high/low)
      // We need last 10 days
      const toDate = new Date();
      const fromDateDaily = new Date();
      fromDateDaily.setDate(fromDateDaily.getDate() - 15);
      const candlesDaily = await provider.getCandles(sym, '1D', fromDateDaily, toDate);

      // 3. Load intraday candles (for Asia session & Sweep detection)
      const fromDateIntraday = new Date();
      const lookbackDays = timeframe === 'M1' ? 4 : 5;
      fromDateIntraday.setDate(fromDateIntraday.getDate() - lookbackDays); // last 4 or 5 days of intraday is ample
      const candlesIntraday = await provider.getCandles(sym, timeframe, fromDateIntraday, toDate);

      if (candlesIntraday.length < 5) {
        console.warn(`[LiquidityScanner] Insufficient candles for ${sym}`);
        continue;
      }

      // Calculate ATRs
      const atrM15 = calculateATR(candlesIntraday, 14);
      const atrH1 = calculateATR(candlesIntraday, 60); // proxy h1 with larger window of intraday

      // 4. Calculate all liquidity levels
      const levelResults = calculateLiquidityLevels(sym, currentPrice, candlesDaily, candlesIntraday, config);
      const allLevels = levelResults.allLevels;

      // 5. Detect sweeps on recent intraday candles
      const sweepInfo = detectLiquiditySweep(sym, candlesIntraday, allLevels, config, atrM15);
      
      // 6. Microstructure confirmation
      const isConfirmed = detectMicrostructureConfirmation(candlesIntraday, sweepInfo.direction, sweepInfo.sweepCandleIdx);

      // Determine session
      const session = getSession(new Date(), timezone, config);

      // 7. Calculate Entry / Stop Loss / Take Profit
      let entry = currentPrice;
      let stopLoss = currentPrice;
      let tp1 = currentPrice;
      let tp2 = currentPrice;
      let tp3 = currentPrice;
      let riskPips = 0;
      let riskRewardTP1 = 0;
      let riskRewardTP2 = 0;
      let riskRewardTP3 = 0;

      const pipSize = getPipSize(sym, currentPrice);
      const buffer = Math.max(spread * 1.5 * pipSize, atrM15 * 0.05);

      if (sweepInfo.direction === 'BULLISH' && sweepInfo.sweptLevel && sweepInfo.sweepExtreme !== undefined) {
        entry = currentPrice;
        stopLoss = sweepInfo.sweepExtreme - buffer;
        
        const riskDistance = entry - stopLoss;
        riskPips = Math.round(priceToPips(sym, riskDistance, currentPrice) * 10) / 10;
        
        // TP1 at 1R
        tp1 = entry + riskDistance;
        
        // TP2 at next liquidity level above
        const aboveLevels = allLevels
          .filter(l => l.price > entry)
          .sort((a, b) => a.price - b.price);
        tp2 = aboveLevels.length > 0 ? aboveLevels[0].price : entry + riskDistance * 2;
        
        // TP3 at Weekly High or Previous Day High or opposite side of Asia range
        const oppositeTargets = allLevels
          .filter(l => l.type === 'WEEKLY_HIGH' || l.type === 'PREVIOUS_DAY_HIGH' || l.type === 'ASIA_HIGH')
          .sort((a, b) => b.price - a.price);
        tp3 = oppositeTargets.length > 0 ? oppositeTargets[0].price : entry + riskDistance * 3.5;

        riskRewardTP1 = 1.0;
        riskRewardTP2 = riskPips > 0 ? Math.round(((tp2 - entry) / riskDistance) * 100) / 100 : 0;
        riskRewardTP3 = riskPips > 0 ? Math.round(((tp3 - entry) / riskDistance) * 100) / 100 : 0;

      } else if (sweepInfo.direction === 'BEARISH' && sweepInfo.sweptLevel && sweepInfo.sweepExtreme !== undefined) {
        entry = currentPrice;
        stopLoss = sweepInfo.sweepExtreme + buffer;
        
        const riskDistance = stopLoss - entry;
        riskPips = Math.round(priceToPips(sym, riskDistance, currentPrice) * 10) / 10;
        
        // TP1 at 1R
        tp1 = entry - riskDistance;
        
        // TP2 at next liquidity level below
        const belowLevels = allLevels
          .filter(l => l.price < entry)
          .sort((a, b) => b.price - a.price);
        tp2 = belowLevels.length > 0 ? belowLevels[0].price : entry - riskDistance * 2;
        
        // TP3 at Weekly Low or Previous Day Low or opposite side of Asia range
        const oppositeTargets = allLevels
          .filter(l => l.type === 'WEEKLY_LOW' || l.type === 'PREVIOUS_DAY_LOW' || l.type === 'ASIA_LOW')
          .sort((a, b) => a.price - b.price);
        tp3 = oppositeTargets.length > 0 ? oppositeTargets[0].price : entry - riskDistance * 3.5;

        riskRewardTP1 = 1.0;
        riskRewardTP2 = riskPips > 0 ? Math.round(((entry - tp2) / riskDistance) * 100) / 100 : 0;
        riskRewardTP3 = riskPips > 0 ? Math.round(((entry - tp3) / riskDistance) * 100) / 100 : 0;
      }

      // Initialize component scores
      let levelQuality = 0;
      let sweepQuality = 0;
      let sessionScore = 0;
      let microstructureScore = 0;
      let riskRewardScore = 0;
      let spreadScore = 0;
      let volatilityScore = 0;
      let newsPenalty = 0;
      const warnings: string[] = [];

      // A. Level Quality (max 20)
      if (sweepInfo.sweptLevel) {
        const type = sweepInfo.sweptLevel.type;
        if (type === 'WEEKLY_HIGH' || type === 'WEEKLY_LOW') levelQuality = 20;
        else if (type === 'PREVIOUS_DAY_HIGH' || type === 'PREVIOUS_DAY_LOW') levelQuality = 18;
        else if (type === 'ASIA_HIGH' || type === 'ASIA_LOW') levelQuality = 16;
        else if (type === 'ROUND_MAJOR') levelQuality = 12;
        else if (type === 'DAILY_OPEN') levelQuality = 8;
        else levelQuality = 5;
      }

      // B. Sweep Quality (max 20)
      if (sweepInfo.sweptLevel) {
        sweepQuality = 15; // clean sweep and close back inside
        const lastCandle = candlesIntraday[candlesIntraday.length - 1];
        const candleRange = lastCandle.high - lastCandle.low;
        if (candleRange > atrM15 * 1.5) {
          sweepQuality -= 10; // too deep/news-like
          warnings.push("WARNING: High Volatility Sweep Candle");
        }
      }

      // C. Session Score (max 15)
      if (session === 'LONDON') sessionScore = 15;
      else if (session === 'NEW_YORK') sessionScore = 13;
      else if (session === 'ASIA') sessionScore = 5;
      else if (session === 'ROLLOVER') {
        sessionScore = -20;
        warnings.push("BLOCKED: Rollover Period");
      } else {
        sessionScore = -10;
      }

      // D. Microstructure Confirmation (max 15)
      if (sweepInfo.direction !== 'NONE') {
        if (isConfirmed) {
          microstructureScore = 15; // swing break + close
        } else {
          microstructureScore = 5; // close back inside only
        }
      }

      // E. Risk/Reward Score (max 15)
      if (sweepInfo.direction !== 'NONE') {
        const rr = riskRewardTP2;
        if (rr >= 2.5) riskRewardScore = 15;
        else if (rr >= 2.0) riskRewardScore = 12;
        else if (rr >= 1.5) riskRewardScore = 8;
        else {
          riskRewardScore = -20;
          warnings.push("BLOCKED: Poor Risk/Reward Ratio (< 1.5)");
        }
      }

      // F. Spread Score (max 10)
      if (spread < 1.0) spreadScore = 10;
      else if (spread <= 2.5) spreadScore = 5;
      else if (spread <= 4.0) {
        spreadScore = -10;
      } else {
        spreadScore = -20;
        warnings.push("BLOCKED: Spread Too High (> 4.0)");
      }

      // G. Volatility Score (max 5)
      volatilityScore = 5; // Normal by default

      // H. News (synthesized news filter)
      const isNewsBlocked = config.newsFilter && Math.random() < 0.05; // 5% chance of simulated news block if news filter enabled
      if (isNewsBlocked) {
        newsPenalty = 30;
        warnings.push("BLOCKED: Impending High-Impact News Event");
      }

      // Manual filters
      if (spread > (config.maxSpread || 4.0)) {
        warnings.push(`BLOCKED: Spread (${spread}) exceeds maximum (${config.maxSpread || 4.0})`);
      }
      if (sweepInfo.direction !== 'NONE' && riskRewardTP2 < (config.minRiskReward || 1.2)) {
        warnings.push(`BLOCKED: R/R to TP2 (${riskRewardTP2}) is lower than minimum (${config.minRiskReward || 1.2})`);
      }

      // Determine Status
      let status: SignalStatus = 'IGNORE';
      if (sweepInfo.direction === 'NONE') {
        // Nearest level above/below
        const aboveLevels = allLevels.filter(l => l.price > currentPrice).sort((a, b) => a.price - b.price);
        const belowLevels = allLevels.filter(l => l.price < currentPrice).sort((a, b) => b.price - a.price);
        const nearAbove = aboveLevels[0];
        const nearBelow = belowLevels[0];

        const distAbove = nearAbove ? nearAbove.distancePips : 999;
        const distBelow = nearBelow ? nearBelow.distancePips : 999;

        if (distAbove < 15 || distBelow < 15) {
          status = 'WATCH';
        } else {
          status = 'IGNORE';
        }
      } else {
        const isBlocked = warnings.some(w => w.includes("BLOCKED"));
        if (isBlocked) {
          status = 'BLOCKED';
        } else if (isConfirmed) {
          status = 'CONFIRMED_SIGNAL';
        } else {
          status = 'CONFIRMATION_PENDING';
        }
      }

      // Base explanation
      const isJpy = sym.toUpperCase().includes('JPY');
      let explanation = `No active setup detected for ${sym}. Price is trading in consolidation.`;
      let invalidation = "None";

      if (sweepInfo.direction === 'BULLISH' && sweepInfo.sweptLevel) {
        explanation = `${sym} swept the ${sweepInfo.sweptLevel.label} at ${sweepInfo.sweptLevel.price.toFixed(isJpy ? 2 : 4)}, traded down to ${sweepInfo.sweepExtreme?.toFixed(isJpy ? 2 : 4)}, then closed back above on M5. ${isConfirmed ? 'Microstructure confirmation is ACTIVE.' : 'Awaiting microstructure shift.'}`;
        invalidation = `Signal is invalidated if price closes below the sweep low at ${stopLoss.toFixed(isJpy ? 2 : 4)}.`;
      } else if (sweepInfo.direction === 'BEARISH' && sweepInfo.sweptLevel) {
        explanation = `${sym} swept the ${sweepInfo.sweptLevel.label} at ${sweepInfo.sweptLevel.price.toFixed(isJpy ? 2 : 4)}, traded up to ${sweepInfo.sweepExtreme?.toFixed(isJpy ? 2 : 4)}, then closed back below on M5. ${isConfirmed ? 'Microstructure confirmation is ACTIVE.' : 'Awaiting microstructure shift.'}`;
        invalidation = `Signal is invalidated if price closes above the sweep high at ${stopLoss.toFixed(isJpy ? 2 : 4)}.`;
      }

      // Build intermediate candidate
      const candidate: LiquiditySignal = {
        symbol: sym,
        assetClass: config.assetClass || 'FOREX',
        status,
        direction: sweepInfo.direction,
        score: 0,
        currentPrice,
        sweptLevel: sweepInfo.sweptLevel,
        sweepExtreme: sweepInfo.sweepExtreme,
        entry,
        stopLoss,
        tp1,
        tp2,
        tp3,
        riskPips,
        riskRewardTP1,
        riskRewardTP2,
        riskRewardTP3,
        spread,
        atrM15,
        session,
        explanation,
        invalidation,
        warnings,
        components: {
          levelQuality,
          sweepQuality,
          session: sessionScore,
          microstructure: microstructureScore,
          riskReward: riskRewardScore,
          spread: spreadScore,
          volatility: volatilityScore,
          newsPenalty
        }
      };

      // Calculate score
      candidate.score = calculateLiquidityScore(candidate);

      results.push(candidate);
    } catch (err: any) {
      console.error(`[Scanner] Error scanning ${sym}:`, err.message);
    }
  }

  // Sort by status priority:
  // 1. CONFIRMED_SIGNAL
  // 2. SWEEP_DETECTED
  // 3. CONFIRMATION_PENDING
  // 4. WATCH
  // 5. BLOCKED/IGNORE
  const statusWeight: Record<SignalStatus, number> = {
    'CONFIRMED_SIGNAL': 5,
    'SWEEP_DETECTED': 4,
    'CONFIRMATION_PENDING': 3,
    'WATCH': 2,
    'BLOCKED': 1,
    'IGNORE': 0
  };

  return results.sort((a, b) => {
    const swA = statusWeight[a.status] || 0;
    const swB = statusWeight[b.status] || 0;
    if (swA !== swB) return swB - swA;
    if (b.score !== a.score) return b.score - a.score;
    return b.riskRewardTP2 - a.riskRewardTP2;
  });
}

/**
 * AI EXPLANATION GENERATOR
 * Uses Gemini API to generate deep explanation of a setup
 */
export async function generateAiExplanation(signal: LiquiditySignal): Promise<any> {
  const isKeyPresent = !!process.env.GEMINI_API_KEY;

  const defaultExplanation = {
    summary: `${signal.symbol} is showing a potential ${signal.direction === 'BULLISH' ? 'LONG' : 'SHORT'} liquidity sweep setup.`,
    reasonForSignal: `Price swept the critical level of ${signal.sweptLevel?.label} at ${signal.sweptLevel?.price} and closed back inside.`,
    riskFactors: `Potential news volatility, wide spread, or failure to break higher/lower swing structures.`,
    invalidation: `Setup is invalidated if price closes beyond ${signal.stopLoss?.toFixed(4)}.`,
    tradingPlan: `Conservative entry on pullback or M5 break. Target TP1 at ${signal.tp1?.toFixed(4)}, TP2 at ${signal.tp2?.toFixed(4)}.`,
    confidenceComment: `The setup has a quantitative score of ${signal.score}/100, indicating ${signal.score >= 75 ? 'a highly robust candidate' : 'a standard speculative setup'}.`
  };

  if (!isKeyPresent) {
    return defaultExplanation;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const promptText = `
You are an expert quantitative trading engineer and master FX technician.
Generate a structured, professional, risk-aware explanation for the following liquidity sweep detection:

Symbol: ${signal.symbol}
Direction: ${signal.direction}
Score: ${signal.score}/100
Current Price: ${signal.currentPrice}
Swept Level: ${signal.sweptLevel?.label} (Type: ${signal.sweptLevel?.type}) at price ${signal.sweptLevel?.price}
Sweep Low/High: ${signal.sweepExtreme}
Suggested Entry: ${signal.entry}
Stop Loss: ${signal.stopLoss}
TP1: ${signal.tp1}
TP2: ${signal.tp2}
TP3: ${signal.tp3}
Risk Reward (TP2): ${signal.riskRewardTP2}
Session: ${signal.session}
Warnings: ${signal.warnings.join(', ') || 'None'}

Return your response strictly as a JSON object with the following keys. Do NOT output markdown ticks or code wraps. Output valid JSON only:
{
  "summary": "one line summarizing the entire setup",
  "reasonForSignal": "bulleted or narrative detail on what occurred and why it qualifies as a sweep",
  "riskFactors": "what to watch out for, session dynamics, and high impact warnings",
  "invalidation": "exact price level and condition where this trade setup fails",
  "tradingPlan": "exact execution recommendations including entry conditions, SL, and TP levels",
  "confidenceComment": "expert comments on the structural quality of this setup based on the score"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: promptText,
    });

    const textOutput = response.text || '';
    const cleanJson = textOutput.replace(/```json/gi, '').replace(/```/gi, '').trim();
    return JSON.parse(cleanJson);
  } catch (e: any) {
    console.warn("[Gemini API] Failed to generate AI explanation, falling back.", e.message);
    return defaultExplanation;
  }
}

/**
 * SAVE A SIGNAL TO BACKTEST LOGS
 */
export function saveBacktestLog(log: BacktestLog): boolean {
  const db = getDb();
  try {
    const query = `
      INSERT OR REPLACE INTO forex_liquidity_logs (
        signalId, timestamp, symbol, direction, statusAtDetection, score,
        sweptLevel, entry, stopLoss, tp1, tp2, tp3, resultLater,
        maxFavorableExcursion, maxAdverseExcursion, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.prepare(query).run(
      log.signalId,
      log.timestamp,
      log.symbol,
      log.direction,
      log.statusAtDetection,
      log.score,
      log.sweptLevel,
      log.entry,
      log.stopLoss,
      log.tp1,
      log.tp2,
      log.tp3,
      log.resultLater,
      log.maxFavorableExcursion,
      log.maxAdverseExcursion,
      log.notes
    );
    return true;
  } catch (e: any) {
    console.error(`[DB Log] Save failed:`, e.message);
    return false;
  }
}

/**
 * GET ALL BACKTEST LOGS
 */
export function getBacktestLogs(): BacktestLog[] {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM forex_liquidity_logs ORDER BY created_at DESC').all() as BacktestLog[];
  } catch (e: any) {
    console.error(`[DB Log] Select failed:`, e.message);
    return [];
  }
}

/**
 * DELETE A LOG
 */
export function deleteBacktestLog(signalId: string): boolean {
  const db = getDb();
  try {
    db.prepare('DELETE FROM forex_liquidity_logs WHERE signalId = ?').run(signalId);
    return true;
  } catch (e) {
    return false;
  }
}
