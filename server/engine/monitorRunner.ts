import yahooFinanceDefault from 'yahoo-finance2';
import { getDb } from '../db.js';
import { getCachedQuote, getCachedChart } from './yfCache.js';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
import { ema, sma } from './indicators.js';

// We need robust versions of indicators for the monitor
import { rsi, adx, macd, atr, supertrend } from './indicators.js';

export function analyzeBars(c: number[], h: number[], l: number[], o: number[], v: number[]) {
    const minLen = c.length;
    const latestIdx = minLen - 1;
    const prevIdx = minLen - 2;
    const prev2Idx = minLen - 3;
    
    const _sma200 = sma(c, 200);
    const _ema20 = ema(c, 20);
    const _ema50 = ema(c, 50);
    const _rsi = rsi(c, 14);
    const _macdData = macd(c, 12, 26, 9);
    const _adxData = adx(h, l, c, 14);
    
    const _sma20 = sma(c, 20);
    
    const currentClose = c[latestIdx];
    const currentOpen = o[latestIdx];
    const currentHigh = h[latestIdx];
    const currentLow = l[latestIdx];
    
    const s200 = _sma200[latestIdx] || 0;
    const e20 = _ema20[latestIdx] || 0;
    const e50 = _ema50[latestIdx] || 0;
    const currentRsi = _rsi[latestIdx] || 0;
    const prevRsi = _rsi[prevIdx] || 0;
    const currentMacdHist = _macdData.histogram[latestIdx] || 0;
    const prevMacdHist = _macdData.histogram[prevIdx] || 0;
    
    const currentAdx = _adxData.adx[latestIdx] || 0;
    const prevAdx = _adxData.adx[prevIdx] || 0;
    const currentPlusDI = _adxData.plusDI[latestIdx] || 0;
    const currentMinusDI = _adxData.minusDI[latestIdx] || 0;
    
    // Vol SMA 20
    const _stmVol = sma(v, 20);
    const currentVol = v[latestIdx] || 0;
    const avgVol = _stmVol[latestIdx] || 0;
    
    const _atrVals = atr(h, l, c, 14);
    const currentAtr = _atrVals[latestIdx] || 0;
    
    // Standard deviation for BB compression
    let sumSq = 0;
    const s20 = _sma20[latestIdx] || 0;
    for(let i=0; i<20; i++){
        if (latestIdx - i >= 0) {
            sumSq += Math.pow(c[latestIdx - i] - s20, 2);
        }
    }
    const stdDev = Math.sqrt(sumSq / 20);
    const bbWidth = s20 > 0 ? (4 * stdDev) / s20 : 0;
    const isCompression = bbWidth < 0.10 && bbWidth > 0; // Relaxed to 0.10 for more occurrences

    // Re-fetch supertrend properly internally
    let stValue = 0;
    let isPriceAboveSt = false;
    let isPriceBelowSt = false;
    if (stMethodAvailable()) {
        const st = doSupertrend(h, l, c, 10, 3);
        stValue = st.values[latestIdx];
        if (!isNaN(stValue)) {
            isPriceAboveSt = currentClose > stValue;
            isPriceBelowSt = currentClose < stValue;
        }
    }

    // Pivot logic
    const isUptrendStructure = (h[latestIdx] > h[prevIdx] && l[latestIdx] > l[prevIdx]) || (h[prevIdx] > h[prev2Idx] && l[prevIdx] > l[prev2Idx]);
    const isDowntrendStructure = (h[latestIdx] < h[prevIdx] && l[latestIdx] < l[prevIdx]) || (h[prevIdx] < h[prev2Idx] && l[prevIdx] < l[prev2Idx]);

    // Breakout / Breakdown
    const prev14Highs = h.slice(Math.max(0, latestIdx - 14), latestIdx);
    const max14High = prev14Highs.length > 0 ? Math.max(...prev14Highs) : currentClose;
    const isBreakout = currentClose > max14High;

    const prev14Lows = l.slice(Math.max(0, latestIdx - 14), latestIdx);
    const min14Low = prev14Lows.length > 0 ? Math.min(...prev14Lows) : currentClose;
    const isBreakdown = currentClose < min14Low;
    
    // Standard Conditions
    const uptrend = {
        c1_sma200: currentClose > s200,
        c2_ema: e20 > e50,
        c3_structure: isUptrendStructure,
        c4_breakout: isBreakout,
        c5_volume: currentVol > avgVol && currentClose >= currentOpen,
        c6_adx: currentAdx > 20 && currentPlusDI > currentMinusDI,
        c7_supertrend: isPriceAboveSt,
        c8_rsi: currentRsi > 50,
        c9_macd: currentMacdHist > prevMacdHist,
        c10_stopValue: (stValue && isPriceAboveSt) ? stValue : (currentClose - 1.5 * currentAtr)
    };
    
    const downtrend = {
        c1_sma200: currentClose < s200,
        c2_ema: e20 < e50,
        c3_structure: isDowntrendStructure,
        c4_breakdown: isBreakdown,
        c5_volume: currentVol > avgVol && currentClose < currentOpen,
        c6_adx: currentAdx > 20 && currentMinusDI > currentPlusDI,
        c7_supertrend: isPriceBelowSt,
        c8_rsi: currentRsi < 50,
        c9_macd: currentMacdHist < prevMacdHist,
        c10_stopValue: (stValue && isPriceBelowSt) ? stValue : (currentClose + 1.5 * currentAtr)
    };
    
    // Extended Strong Conditions
    const longForte = {
        c1: currentClose > s200 && currentClose > e20,
        c2: e20 > e50,
        c3: isUptrendStructure,
        c4: isBreakout,
        c5: currentVol > 1.5 * avgVol,
        c6: currentAdx > 20 && currentAdx > prevAdx,
        c7: currentPlusDI > currentMinusDI,
        c8: isPriceAboveSt,
        c9: currentRsi > 50 && currentRsi < 75,
        c10: currentMacdHist > 0 || currentMacdHist > prevMacdHist,
        c11: true, // Relative Strength vs indice > 0 (proxy)
        c12: true, // Settore positivo (proxy)
        c13: isCompression,
        c14: true, // Reward/Risk 1:2 (proxy)
        c15: true, // Nessuna resistenza troppo vicina (proxy)
    };
    
    const shortForte = {
        c1: currentClose < s200 && currentClose < e20,
        c2: e20 < e50,
        c3: isDowntrendStructure,
        c4: isBreakdown || (currentClose < e50 && currentClose < e20 && currentMacdHist < prevMacdHist && currentRsi < 40),
        c5: currentVol > 1.2 * avgVol && currentClose < currentOpen,
        c6: currentAdx > 20 && currentAdx > prevAdx,
        c7: currentMinusDI > currentPlusDI,
        c8: isPriceBelowSt,
        c9: currentRsi < 45,
        c10: currentMacdHist < 0 || currentMacdHist < prevMacdHist,
        c11: true, // RS vs indice < 0 (proxy)
        c12: true, // Settore debole (proxy)
        c13: isCompression,
        c14: true, // Reward/Risk 1:2 (proxy)
        c15: true, // Supporti lontani (proxy)
    };

    // Calculate Bullish Score
    let bullScore = 0;
    if (isUptrendStructure) bullScore += 15;
    if (currentClose > s200 && e20 > e50) bullScore += 12;
    if (currentAdx > 20 && currentPlusDI > currentMinusDI) bullScore += 10;
    if (isPriceAboveSt) bullScore += 8;
    if (currentRsi > 50 && currentMacdHist > prevMacdHist) bullScore += 10;
    if (currentVol > avgVol) bullScore += 12; // Vol / OBV
    if (isBreakout) bullScore += 12;
    if (isCompression) bullScore += 8;
    bullScore += 8; // RS proxy
    bullScore += 5; // Risk proxy

    // Calculate Bearish Score
    let bearScore = 0;
    if (isDowntrendStructure) bearScore += 15;
    if (currentClose < s200 && e20 < e50) bearScore += 12;
    if (currentAdx > 20 && currentMinusDI > currentPlusDI) bearScore += 10;
    if (isPriceBelowSt) bearScore += 8;
    if (currentRsi < 50 && currentMacdHist < prevMacdHist) bearScore += 10;
    if (currentVol > avgVol && currentClose < currentOpen) bearScore += 12;
    if (isBreakdown) bearScore += 12;
    if (isCompression) bearScore += 8;
    bearScore += 8; // RS proxy
    bearScore += 5; // Risk proxy

    // === Nuova Strategia Robusta Long ===
    // Moduli (bool)
    const activeModules = [];
    let robustLongScore = 0;

    const closePosition = (currentHigh - currentLow) > 0 ? (currentClose - currentLow) / (currentHigh - currentLow) : 0.5;

    // 1. Momentum cross-sectional (Momentum Leader) 15%
    const ret3m = latestIdx >= 63 ? (currentClose - c[latestIdx - 63]) / c[latestIdx - 63] : 0;
    const ret6m = latestIdx >= 126 ? (currentClose - c[latestIdx - 126]) / c[latestIdx - 126] : 0;
    const momentumLeader = ret3m > 0 && ret6m > 0 && currentRsi > 60 && currentClose > s200 && e20 > e50 && currentAdx > 20;
    if (momentumLeader) { activeModules.push('Momentum Leader'); robustLongScore += 15; }

    // 2. 52-week high strategy 12%
    const highestHigh252 = minLen >= 252 ? Math.max(...h.slice(latestIdx - 252, latestIdx)) : (latestIdx > 0 ? Math.max(...h.slice(0, latestIdx)) : currentHigh);
    const is52wHighNear = currentClose >= 0.95 * highestHigh252;
    const is52wHighBreak = currentClose > highestHigh252;
    const module52W = (is52wHighNear || is52wHighBreak) && ret3m > 0 && currentClose > e20 && currentAdx > prevAdx;
    if (module52W) { activeModules.push('52W High Strategy'); robustLongScore += 12; }

    // 3. Breakout da trading range 15%
    const isRangeBreakout = isCompression && isBreakout && closePosition > 0.60;
    if (isRangeBreakout) { activeModules.push('Range Breakout'); robustLongScore += 15; }

    // 4. Volatility squeeze breakout 12%
    // Proxy per atr compresso (<0.85 del suo sma50) 
    let sumAtr = 0;
    for(let i=0; i<50; i++) { if (latestIdx - i >= 0) sumAtr += _atrVals[latestIdx - i]; }
    const smaAtr50 = sumAtr / 50;
    const atrComp = smaAtr50 > 0 && (currentAtr / smaAtr50) < 0.85;
    const isVolSqueezeBreakout = (atrComp || bbWidth < 0.10) && isBreakout;
    if (isVolSqueezeBreakout) { activeModules.push('Volatility Squeeze'); robustLongScore += 12; }

    // 5. High-volume confirmation 12%
    const highVolConf = currentVol > 1.5 * avgVol && currentClose > currentOpen && closePosition > 0.60 && currentClose > e20;
    if (highVolConf) { activeModules.push('High Volume Conf'); robustLongScore += 12; }

    // 6. PEAD proxy (Earnings Drift) 10%
    const prevHigh = prevIdx >= 0 ? h[prevIdx] : currentHigh;
    const prevClose = prevIdx >= 0 ? c[prevIdx] : currentClose;
    const gapPercent = prevClose > 0 ? (currentOpen - prevClose) / prevClose : 0;
    const gapUpHold = gapPercent > 0.01 && currentVol > 1.2 * avgVol && currentLow > prevHigh && currentClose > currentOpen;
    if (gapUpHold) { activeModules.push('PEAD / Gap Up'); robustLongScore += 10; }

    // 7. Pullback su trend forte 12%
    const isStrongTrend = currentClose > s200 && e20 > e50 && currentAdx > 20 && currentPlusDI > currentMinusDI;
    const isPullback = isStrongTrend && currentRsi >= 40 && currentLow < e20 && currentClose > e20;
    if (isPullback) { activeModules.push('Pullback in Trend'); robustLongScore += 12; }

    // 8. Gap up hold 7%
    const isGapHold = gapPercent > 0.01 && currentClose > currentOpen && closePosition > 0.60;
    if (isGapHold && !gapUpHold) { activeModules.push('Gap Hold'); robustLongScore += 7; } // don't double count if pead active

    // 9. ORB intraday proxy 5%
    const orbProxy = gapPercent > 0.005 && currentClose > (currentHigh + currentLow)/2;
    if (orbProxy) { activeModules.push('ORB Intraday'); robustLongScore += 5; }

    // No Trade Conditions
    const farFromEma = ((currentClose - e20) / e20) > 0.08;
    const extRsi = currentRsi > 75;
    const volSpikeAfterRun = currentVol > 3 * avgVol && currentClose > e20 * 1.05 && ret3m > 0.2;
    const gapClosed = currentOpen > prevHigh && currentClose <= prevHigh;
    const failBreakout = currentHigh > max14High && currentClose < max14High;
    const baseBreakoutLowVol = currentHigh > max14High && currentVol < avgVol;
    
    const noTradeReasons = [];
    if (farFromEma) noTradeReasons.push('Prezzo troppo distante da EMA20 (>8%)');
    if (extRsi) noTradeReasons.push('RSI > 75 (Ipercomprato)');
    if (volSpikeAfterRun) noTradeReasons.push('Volume spike dopo salita estesa');
    if (gapClosed) noTradeReasons.push('Gap Up chiuso (Falso entusiasmo)');
    if (failBreakout) noTradeReasons.push('Breakout senza close mantenuto');
    if (baseBreakoutLowVol) noTradeReasons.push('Breakout con volumi sotto media');

    let robustSignal = false;
    
    // Condizioni Finali per Signal Long Robusto
    const trendScore = (currentClose>s200?25:0) + (e20>e50?20:0) + (isPriceAboveSt?10:0) + (currentAdx>20?10:0);
    const volumeScore = (currentVol>avgVol?35:0) + (currentVol>v[prevIdx]?25:0) + (currentClose>=currentOpen?20:0);

    if (
        trendScore >= 65 &&
        volumeScore >= 60 &&
        activeModules.length > 0 &&
        noTradeReasons.length === 0
    ) {
        robustSignal = true;
    }

    const globalScore = Math.min(100, Math.round((bullScore + robustLongScore) / 2));

    const robustData = {
        signal: robustSignal,
        score: robustLongScore,
        activeModules,
        noTradeReasons,
        modules: {
            momentumLeader,
            module52W,
            isRangeBreakout,
            isVolSqueezeBreakout,
            highVolConf,
            gapUpHold,
            isPullback,
            isGapHold: isGapHold && !gapUpHold,
            orbProxy
        },
        conditions: {
            trendScore,
            volumeScore
        }
    };

    return { 
        price: currentClose,
        uptrend, 
        downtrend, 
        longForte, 
        shortForte, 
        bullScore, 
        bearScore,
        robustData,
        globalScore
    };
}

export async function processRealTimeMonitor(symbols: string[], interval: string = '1d') {
    const results: any[] = [];
    const targetSymbols = symbols.slice(0, 400);
    
    // Process in chunks of 10 to avoid rate limits / socket hangups on Yahoo Finance
    const chunkSize = 10;
    for (let i = 0; i < targetSymbols.length; i += chunkSize) {
        const chunk = targetSymbols.slice(i, i + chunkSize);
        
        const chunkPromises = chunk.map(async (sym) => {
            if (!sym || sym.trim() === '') return null;
            
            try {
                let querySym = sym.trim();
                // Replace dot with dash for Yahoo Finance except for recognized European suffixes
                if (querySym.includes('.') && 
                    !querySym.endsWith('.MI') && 
                    !querySym.endsWith('.L') && 
                    !querySym.endsWith('.DE') && 
                    !querySym.endsWith('.AS') && 
                    !querySym.endsWith('.PA') && 
                    !querySym.endsWith('.TO') && 
                    !querySym.endsWith('.WA')) {
                    querySym = querySym.replace(/\./g, '-');
                }
                
                const endDate = new Date();
                const startDate = new Date();
                
                let lookbackDays = 400;
                if (interval === '1h') lookbackDays = 60;
                if (interval === '15m') lookbackDays = 30;
                
                startDate.setDate(startDate.getDate() - lookbackDays);

                let liveQuote: any = null;
                try { 
                    liveQuote = await getCachedQuote(querySym); 
                } catch(e: any) {}

                let chartData: any;
                try {
                    chartData = await getCachedChart(querySym, {
                        period1: startDate.toISOString().split('T')[0],
                        period2: endDate.toISOString().split('T')[0],
                        interval: interval as any
                    });
                } catch (e: any) {
                    console.log(`Chart sync backup for ${sym}: ${e.message}`);
                    return { symbol: sym, error: `Chart fetch failed: ${e.message}` };
                }

                if (!chartData || !chartData.quotes || chartData.quotes.length < 50) {
                     return { symbol: sym, error: `Not enough data for ${interval} (need at least 50 bars)` };
                }
                
                const quotes = chartData.quotes;

                // Only inject live quote for '1d' interval
                if (interval === '1d' && liveQuote && liveQuote.regularMarketPrice) {
                    const lp = liveQuote.regularMarketPrice;
                    const lastQ = quotes[quotes.length - 1];
                    const lastQDate = lastQ.date ? new Date(lastQ.date) : new Date();
                    const today = new Date();
                    
                    if (lastQDate.getDate() === today.getDate() && lastQDate.getMonth() === today.getMonth() && lastQDate.getFullYear() === today.getFullYear()) {
                        lastQ.close = lp;
                        lastQ.high = Math.max(lastQ.high, lp);
                        lastQ.low = Math.min(lastQ.low, lp);
                        lastQ.volume = liveQuote.regularMarketVolume || lastQ.volume;
                    } else {
                        quotes.push({
                            date: new Date().toISOString(),
                            open: (liveQuote.regularMarketOpen || lp) as number,
                            high: (liveQuote.regularMarketDayHigh || lp) as number,
                            low: (liveQuote.regularMarketDayLow || lp) as number,
                            close: lp,
                            volume: (liveQuote.regularMarketVolume || 0) as number,
                            adjclose: lp
                        });
                    }
                }
                
                const validQuotes = quotes.filter((q: any) => q.close !== null && q.high !== null && q.low !== null);
                const c = validQuotes.map((q: any) => q.close);
                const h = validQuotes.map((q: any) => q.high);
                const l = validQuotes.map((q: any) => q.low);
                const o = validQuotes.map((q: any) => q.open);
                const v = validQuotes.map((q: any) => q.volume);
                
                if (c.length < 50) {
                     return { symbol: sym, error: 'Not enough valid data points' };
                }
                
                const metrics = analyzeBars(c, h, l, o, v);
                
                return {
                    symbol: sym,
                    ...metrics
                };
                
            } catch (e: any) {
                 return { symbol: sym, error: e.message };
            }
        });

        const chunkRes = await Promise.all(chunkPromises);
        chunkRes.forEach(r => {
            if (r) results.push(r);
        });
    }
    
    return results;
}

export async function processLocalMonitorScan(interval: string = '1d', includeCrypto: boolean = false) {
    const db = getDb();
    const activeRows = db.prepare('SELECT symbol FROM symbols WHERE active = 1').all() as any[];
    let symbols = activeRows.map((r: any) => r.symbol);
    
    if (includeCrypto) {
        const cryptos = [
            'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD',
            'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'LINK-USD', 'DOT-USD',
            'HYPE-USD', 'ONDO-USD', 'TAO-USD', 'NEAR-USD', 'RENDER-USD',
            'AAVE-USD', 'SUI-USD', 'PENDLE-USD', 'AERO-USD', 'TRX-USD',
            'TON-USD', 'HBAR-USD', 'MNT-USD', 'INJ-USD', 'JUP-USD',
            'PYTH-USD', 'JTO-USD', 'UNI-USD', 'MORPHO-USD', 'ENA-USD',
            'LDO-USD', 'EIGEN-USD', 'ARB-USD', 'OP-USD', 'SEI-USD',
            'APT-USD', 'ICP-USD', 'FIL-USD', 'KAS-USD', 'ATOM-USD',
            'ZEC-USD', 'XMR-USD', 'WLD-USD', 'VIRTUAL-USD', 'FET-USD',
            'AKT-USD', 'GRASS-USD', 'AIOZ-USD', 'IO-USD', 'STX-USD'
        ];
        symbols = [...symbols, ...cryptos];
    }
    
    const results = await processRealTimeMonitor(symbols, interval);
    
    // Sort by whichever score is highest out of bull/bear, desc
    results.sort((a, b) => {
        const maxA = Math.max(a.bullScore || 0, a.bearScore || 0);
        const maxB = Math.max(b.bullScore || 0, b.bearScore || 0);
        if (maxB !== maxA) return maxB - maxA;
        return (b.bullScore || 0) - (a.bullScore || 0); // fallback to bull
    });
    
    return results;
}
function doSupertrend(highs: number[], lows: number[], closes: number[], period: number, multiplier: number) {
  const n = highs.length;
  const tr = new Array(n).fill(0);
  const atr = new Array(n).fill(0);
  const basicUpperband = new Array(n).fill(0);
  const basicLowerband = new Array(n).fill(0);
  const finalUpperband = new Array(n).fill(0);
  const finalLowerband = new Array(n).fill(0);
  const supertrend = new Array(n).fill(0);
  
  for(let i = 1; i < n; i++) {
     tr[i] = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i-1]),
        Math.abs(lows[i] - closes[i-1])
     );
  }
  for(let i = period; i < n; i++) {
      let sum = 0;
      for(let j = i - period + 1; j <= i; j++) sum += tr[j];
      atr[i] = sum / period; // Simple average
      
      const hl2 = (highs[i] + lows[i]) / 2;
      basicUpperband[i] = hl2 + (multiplier * atr[i]);
      basicLowerband[i] = hl2 - (multiplier * atr[i]);
      
      if (basicUpperband[i] < finalUpperband[i-1] || closes[i-1] > finalUpperband[i-1]) {
          finalUpperband[i] = basicUpperband[i];
      } else {
          finalUpperband[i] = finalUpperband[i-1];
      }
      
      if (basicLowerband[i] > finalLowerband[i-1] || closes[i-1] < finalLowerband[i-1]) {
          finalLowerband[i] = basicLowerband[i];
      } else {
          finalLowerband[i] = finalLowerband[i-1];
      }
      
      if (supertrend[i-1] === finalUpperband[i-1] && closes[i] <= finalUpperband[i]) {
          supertrend[i] = finalUpperband[i];
      } else if (supertrend[i-1] === finalUpperband[i-1] && closes[i] >= finalUpperband[i]) {
          supertrend[i] = finalLowerband[i];
      } else if (supertrend[i-1] === finalLowerband[i-1] && closes[i] >= finalLowerband[i]) {
          supertrend[i] = finalLowerband[i];
      } else if (supertrend[i-1] === finalLowerband[i-1] && closes[i] <= finalLowerband[i]) {
          supertrend[i] = finalUpperband[i];
      } else {
          supertrend[i] = finalLowerband[i]; // init
      }
  }
  return { values: supertrend };
}

function stMethodAvailable() { return true; }
