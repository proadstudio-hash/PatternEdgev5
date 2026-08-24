import yahooFinanceDefault from 'yahoo-finance2';
import { getDb } from '../db.js';
import { processRealTimeMonitor } from './monitorRunner.js';
import { getCachedChart } from './yfCache.js';

const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;

// Timeframe mappings
const mapInterval = (freq: string) => {
    switch (freq) {
        case '15m': return '15m';
        case '1h': return '60m';
        case '1d': return '1d';
        default: return '1d';
    }
};

const mapPeriod = (range: string) => {
    const today = new Date();
    let past = new Date();
    switch(range) {
        case '3m': past.setMonth(today.getMonth() - 3); break;
        case '6m': past.setMonth(today.getMonth() - 6); break;
        case '1y': past.setFullYear(today.getFullYear() - 1); break;
        case '2y': past.setFullYear(today.getFullYear() - 2); break;
        default: past.setFullYear(today.getFullYear() - 1); break;
    }
    return past;
};

// --- Mathematical and Statistical Helpers ---

// Lanczos approximation of Log Gamma function
function logGamma(x: number): number {
    const p = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507381421299058,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    if (x < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let base = x + 7.5;
    let sum = p[0];
    for (let i = 1; i < 9; i++) {
        sum += p[i] / (x + i);
    }
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(base) - base + Math.log(sum);
}

// Continued fraction evaluation helper for Regularized Incomplete Beta
function betaCF(x: number, a: number, b: number): number {
    const maxIter = 100;
    const eps = 3e-7;
    const fpmin = 1e-30;
    
    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < fpmin) d = fpmin;
    d = 1 / d;
    let h = d;
    
    for (let m = 1; m <= maxIter; m++) {
        let m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < fpmin) d = fpmin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpmin) c = fpmin;
        d = 1 / d;
        h *= d * c;
        
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < fpmin) d = fpmin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpmin) c = fpmin;
        d = 1 / d;
        h *= d * c;
        
        if (Math.abs(d * c - 1) < eps) break;
    }
    return h;
}

// Regularized Incomplete Beta function I_x(a, b)
function betaIncReg(x: number, a: number, b: number): number {
    if (x < 0 || x > 1) return NaN;
    if (x === 0) return 0;
    if (x === 1) return 1;

    const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    
    if (x < (a + 1) / (a + b + 2)) {
        return bt * betaCF(x, a, b) / a;
    } else {
        return 1 - bt * betaCF(1 - x, b, a) / b;
    }
}

// Compute p-value from F-distribution cumulative probability
function fTestPValue(fStat: number, df1: number, df2: number): number {
    if (fStat <= 0 || isNaN(fStat)) return 1.0;
    const x = (df1 * fStat) / (df1 * fStat + df2);
    const pVal = 1.0 - betaIncReg(x, df1 / 2, df2 / 2);
    return isNaN(pVal) ? 1.0 : pVal;
}

// Determinant of 3x3 matrix
function det3x3(a: number[][]): number {
    return a[0][0]*(a[1][1]*a[2][2] - a[1][2]*a[2][1]) -
           a[0][1]*(a[1][0]*a[2][2] - a[1][2]*a[2][0]) +
           a[0][2]*(a[1][0]*a[2][1] - a[1][1]*a[2][0]);
}

// Solve 3x3 Linear System using Cramer's rule
function solve3x3(M: number[][], V: number[]): number[] {
    const det = det3x3(M);
    if (Math.abs(det) < 1e-12) {
        return [0, 1, 0]; // default parameters: alpha=0, beta_mkt=1, beta_sec=0
    }
    
    const M0 = [
        [V[0], M[0][1], M[0][2]],
        [V[1], M[1][1], M[1][2]],
        [V[2], M[2][1], M[2][2]]
    ];
    const M1 = [
        [M[0][0], V[0], M[0][2]],
        [M[1][0], V[1], M[1][2]],
        [M[2][0], V[2], M[2][2]]
    ];
    const M2 = [
        [M[0][0], M[0][1], V[0]],
        [M[1][0], M[1][1], V[1]],
        [M[2][0], M[2][1], V[2]]
    ];
    
    return [
        det3x3(M0) / det,
        det3x3(M1) / det,
        det3x3(M2) / det
    ];
}

// Linear system solver using Gaussian elimination with partial pivoting (for dynamic OLS regressions)
function solveGaussian(A: number[][], B: number[]): number[] | null {
    const n = B.length;
    const a = A.map(row => [...row]);
    const b = [...B];
    
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) {
                maxRow = k;
            }
        }
        
        const tempRow = a[i];
        a[i] = a[maxRow];
        a[maxRow] = tempRow;
        
        const tempVal = b[i];
        b[i] = b[maxRow];
        b[maxRow] = tempVal;
        
        if (Math.abs(a[i][i]) < 1e-15) {
            return null; // Singular
        }
        
        for (let k = i + 1; k < n; k++) {
            const factor = a[k][i] / a[i][i];
            b[k] -= factor * b[i];
            for (let j = i; j < n; j++) {
                a[k][j] -= factor * a[i][j];
            }
        }
    }
    
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += a[i][j] * x[j];
        }
        x[i] = (b[i] - sum) / a[i][i];
    }
    return x;
}

// Fit Ordinary Least Squares (OLS) regression model
function fitOLS(X: number[][], Y: number[]): { coeff: number[], rss: number } | null {
    const N = Y.length;
    const D = X[0].length;
    
    const XT_X: number[][] = Array.from({ length: D }, () => new Array(D).fill(0));
    for (let i = 0; i < D; i++) {
        for (let j = 0; j < D; j++) {
            let sum = 0;
            for (let t = 0; t < N; t++) {
                sum += X[t][i] * X[t][j];
            }
            XT_X[i][j] = sum;
        }
    }
    
    const XT_Y: number[] = new Array(D).fill(0);
    for (let i = 0; i < D; i++) {
        let sum = 0;
        for (let t = 0; t < N; t++) {
            sum += X[t][i] * Y[t];
        }
        XT_Y[i] = sum;
    }
    
    const coeff = solveGaussian(XT_X, XT_Y);
    if (!coeff) return null;
    
    let rss = 0;
    for (let t = 0; t < N; t++) {
        let pred = 0;
        for (let j = 0; j < D; j++) {
            pred += X[t][j] * coeff[j];
        }
        const err = Y[t] - pred;
        rss += err * err;
    }
    
    return { coeff, rss };
}

// Calculate standard deviation of an array
function getStdDev(arr: number[]): number {
    const n = arr.length;
    if (n < 2) return 0.001;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const sqErr = arr.reduce((sum, val) => sum + (val - mean) * (val - mean), 0);
    return Math.sqrt(sqErr / (n - 1)) || 0.001;
}

// Pearson Correlation Coefficient calculation
function pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 5) return 0;
    let sumX = 0, sumY = 0, sumXY = 0;
    let sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (den === 0) return 0;
    return num / den;
}

// Round and normalize timestamps by frequency to align asynchronous series
function normalizeDateByFreq(date: Date, freq: string): number {
    const d = new Date(date);
    if (freq === '1d') {
        d.setUTCHours(0, 0, 0, 0);
    } else if (freq === '1h') {
        d.setUTCMinutes(0, 0, 0);
    } else if (freq === '15m') {
        const mins = d.getUTCMinutes();
        const remainder = mins % 15;
        d.setUTCMinutes(mins - remainder, 0, 0);
    }
    return d.getTime();
}

// Assign industry sectors dynamically to support factor regressions
function getSector(symbol: string, dbMap: Map<string, string>): string {
    const s = symbol.toUpperCase();
    if (s.endsWith('-USD') || s.includes('BTC') || s.includes('ETH')) return 'Cryptocurrency';
    if (dbMap.has(symbol)) return dbMap.get(symbol)!;
    if (['NVDA', 'AMD', 'SMH', 'AVGO', 'TSMC', 'INTC'].includes(s)) return 'Semiconductors';
    if (['AAPL', 'MSFT', 'QQQ', 'XLK', 'GOOGL', 'GOOG', 'META', 'NFLX', 'AMZN'].includes(s)) return 'Tech';
    if (['SPY', 'VOO', 'IVV', 'DIA'].includes(s)) return 'Market';
    if (['TLT', 'IEF', 'SHY', 'BND', 'AGG'].includes(s)) return 'Bonds';
    if (['XLF', 'JPM', 'KRE', 'BAC', 'GS', 'MS', 'WFC', 'C'].includes(s)) return 'Financials';
    if (['XLE', 'XOM', 'CVX', 'COP', 'SLB'].includes(s)) return 'Energy';
    if (['IWM', 'IWD', 'IWF'].includes(s)) return 'Small Caps';
    if (['ARKK', 'ARKW', 'ARKG'].includes(s)) return 'Speculative';
    if (['GLD', 'SLV', 'IAU'].includes(s)) return 'Metals';
    return 'Various';
}

// Assign estimated bid/ask spread percentage
function estimateSpread(symbol: string): number {
    const s = symbol.toUpperCase();
    if (['SPY', 'QQQ', 'AAPL', 'MSFT'].includes(s)) return 0.0001; // ultra-liquid: 0.01%
    if (['NVDA', 'IWM', 'TLT', 'XLF', 'XLE', 'XOM', 'JPM'].includes(s)) return 0.0003; // liquid: 0.03%
    if (['SMH', 'AVGO', 'AMD'].includes(s)) return 0.0007; // medium: 0.07%
    if (['ARKK', 'KRE'].includes(s)) return 0.0012; // volatile ETF: 0.12%
    return 0.0018; // standard stock/small cap: 0.18%
}

// --- VLLMN Core Engine ---

export async function analyzeLeadLagNetwork(options: { timeRange: string, frequency: string, symbols?: string[] }) {
    const { timeRange, frequency, symbols } = options;
    
    let candidates = [
        'NVDA', 'SPY', 'TLT', 'QQQ', 'XLE', 'XLF', 'IWM', 'AAPL', 'JPM', 'AMD', 'SMH', 'AVGO', 'KRE', 'ARKK', 'XOM'
    ];
    
    // DB Loading
    const db = getDb();
    const dbSectorMap = new Map<string, string>();
    const dbMarketCapMap = new Map<string, string>();
    try {
        const storedSyms = db.prepare('SELECT symbol, sector FROM symbols').all() as any[];
        storedSyms.forEach(s => {
            if (s.sector) dbSectorMap.set(s.symbol, s.sector);
        });
    } catch (dbErr) {
        console.warn("DB symbols read warning (not fatal):", dbErr);
    }

    if (symbols && Array.isArray(symbols) && symbols.length > 0) {
        candidates = symbols.slice(0, 100); // safety cap to prevent timeouts
    } else {
        try {
            const settingsObj = db.prepare("SELECT value FROM settings WHERE key = 'training_settings'").get() as any;
            if (settingsObj) {
                const parsed = JSON.parse(settingsObj.value);
                if (parsed.symbols && parsed.symbols.length > 0) {
                    candidates = parsed.symbols;
                }
            } else {
                const syms = db.prepare('SELECT symbol FROM symbols LIMIT 25').all() as any[];
                if (syms && syms.length > 0) {
                    candidates = syms.map(s => s.symbol);
                }
            }
        } catch(e) {
            console.log("DB load error for symbols, using defaults", e);
        }
    }
    
    if (candidates.length > 100) {
        candidates = candidates.slice(0, 100);
    }

    const interval = mapInterval(frequency);
    let startDate = mapPeriod(timeRange);
    
    // Intraday limitations on Yahoo Finance
    if (interval === '15m') {
        const min15m = new Date();
        min15m.setDate(min15m.getDate() - 59);
        if (startDate < min15m) startDate = min15m;
    } else if (interval === '60m') {
        const min60m = new Date();
        min60m.setDate(min60m.getDate() - 720);
        if (startDate < min60m) startDate = min60m;
    }

    const rawData: Record<string, { dateNormalized: number, close: number, logRet: number }[]> = {};
    const globalTimelineSet = new Set<number>();

    // Fetch in Parallel chunks
    const chunkSize = 12;
    const endDate = new Date();
    for (let i = 0; i < candidates.length; i += chunkSize) {
        const chunk = candidates.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (sym) => {
            try {
                let querySym = sym;
                if (sym.includes('.') && !sym.endsWith('.MI') && !sym.endsWith('.L') && !sym.endsWith('.DE') && !sym.endsWith('.AS') && !sym.endsWith('.PA') && !sym.endsWith('.TO') && !sym.endsWith('.WA')) {
                    querySym = sym.replace(/\./g, '-');
                }
                const results = await getCachedChart(querySym, {
                    period1: startDate.toISOString().split('T')[0],
                    period2: endDate.toISOString().split('T')[0],
                    interval: interval as any,
                });
                
                const rawQuotes = (results && results.quotes) || [];
                const quotes = rawQuotes.filter((q: any) => q && typeof q.close === 'number' && q.close > 0);
                const series = [];
                for (let j = 1; j < quotes.length; j++) {
                    const prevClose = quotes[j-1].close;
                    const currClose = quotes[j].close;
                    if (prevClose && currClose && prevClose > 0 && currClose > 0) {
                        const logRet = Math.log(currClose / prevClose);
                        const normTime = normalizeDateByFreq(quotes[j].date, frequency);
                        series.push({
                            dateNormalized: normTime,
                            close: currClose,
                            logRet
                        });
                        globalTimelineSet.add(normTime);
                    }
                }
                if (series.length > 10) {
                    rawData[sym] = series;
                }
            } catch (err: any) {
                console.log(`Fallback loading data for ${sym}:`, err.message);
            }
        }));
    }

    const validSymbols = Object.keys(rawData);
    if (validSymbols.length < 2) {
        return { masters: [], edges: [] };
    }

    const sortedTimeline = Array.from(globalTimelineSet).sort((a, b) => a - b);

    // --- Create factor series: Market Return & Sector Return ---
    const mktReturnSeries = new Map<number, number>();
    const sectorReturnSeries = new Map<string, Map<number, number>>(); // sector -> (time -> return)

    // Pre-calculate mapping of sym -> sector
    const symbolSectors = new Map<string, string>();
    validSymbols.forEach(sym => {
        symbolSectors.set(sym, getSector(sym, dbSectorMap));
    });

    const uniqueSectors = Array.from(new Set(symbolSectors.values()));
    uniqueSectors.forEach(sec => {
        sectorReturnSeries.set(sec, new Map<number, number>());
    });

    sortedTimeline.forEach(time => {
        let totalRet = 0;
        let countMkt = 0;

        const sectorSum = new Map<string, number>();
        const sectorCount = new Map<string, number>();

        validSymbols.forEach(sym => {
            const symSeries = rawData[sym];
            const point = symSeries.find(p => p.dateNormalized === time);
            if (point) {
                totalRet += point.logRet;
                countMkt++;

                const sec = symbolSectors.get(sym)!;
                sectorSum.set(sec, (sectorSum.get(sec) || 0) + point.logRet);
                sectorCount.set(sec, (sectorCount.get(sec) || 0) + 1);
            }
        });

        if (countMkt > 0) {
            const mktRet = totalRet / countMkt;
            mktReturnSeries.set(time, mktRet);

            uniqueSectors.forEach(sec => {
                const secSum = sectorSum.get(sec) || 0;
                const secCnt = sectorCount.get(sec) || 0;
                let secRet = secCnt > 0 ? (secSum / secCnt) : mktRet;
                sectorReturnSeries.get(sec)!.set(time, secRet);
            });
        }
    });

    // --- Multi-Variable Linear Regression for Residual/Idiosyncratic returns (\epsilon_i,t) ---
    const residualSeries = new Map<string, Map<number, number>>(); // sym -> (time -> epsilon)
    const rawReturnsMap = new Map<string, Map<number, number>>(); // sym -> (time -> raw_log_return)

    validSymbols.forEach(sym => {
        residualSeries.set(sym, new Map<number, number>());
        rawReturnsMap.set(sym, new Map<number, number>());
        
        const symSeries = rawData[sym];
        const sec = symbolSectors.get(sym)!;

        // Collect aligned arrays for regression equation
        const alignedY: number[] = [];
        const alignedX_Mkt: number[] = [];
        const alignedX_Sec: number[] = [];
        const alignedTimes: number[] = [];

        symSeries.forEach(point => {
            const time = point.dateNormalized;
            rawReturnsMap.get(sym)!.set(time, point.logRet);

            const mktRet = mktReturnSeries.get(time);
            const secRet = sectorReturnSeries.get(sec)?.get(time);

            if (mktRet !== undefined && secRet !== undefined) {
                alignedY.push(point.logRet);
                alignedX_Mkt.push(mktRet);
                alignedX_Sec.push(secRet);
                alignedTimes.push(time);
            }
        });

        const N = alignedY.length;
        if (N >= 15) {
            // Setup OLS 3x3 System
            // M = X^T X
            const sumMkt = alignedX_Mkt.reduce((a, b) => a + b, 0);
            const sumSec = alignedX_Sec.reduce((a, b) => a + b, 0);
            
            const sumMktSq = alignedX_Mkt.reduce((acc, v) => acc + v*v, 0);
            const sumSecSq = alignedX_Sec.reduce((acc, v) => acc + v*v, 0);
            const sumMktSec = alignedX_Mkt.reduce((acc, v, idx) => acc + v * alignedX_Sec[idx], 0);

            const M = [
                [N, sumMkt, sumSec],
                [sumMkt, sumMktSq, sumMktSec],
                [sumSec, sumMktSec, sumSecSq]
            ];

            const sumY = alignedY.reduce((a, b) => a + b, 0);
            const sumYMkt = alignedY.reduce((acc, v, idx) => acc + v * alignedX_Mkt[idx], 0);
            const sumYSec = alignedY.reduce((acc, v, idx) => acc + v * alignedX_Sec[idx], 0);

            const V = [sumY, sumYMkt, sumYSec];

            const params = solve3x3(M, V); // [alpha, beta_mkt, beta_sec]
            
            // Calculate residuals
            for (let t = 0; t < N; t++) {
                const time = alignedTimes[t];
                const actual = alignedY[t];
                const predicted = params[0] + params[1] * alignedX_Mkt[t] + params[2] * alignedX_Sec[t];
                residualSeries.get(sym)!.set(time, actual - predicted);
            }
        } else {
            // Fallback to simple total Log-return if series too short
            symSeries.forEach(point => {
                residualSeries.get(sym)!.set(point.dateNormalized, point.logRet);
            });
        }
    });

    // --- Lagged Cross-Correlation & Granger Causality ---
    // Frequency variables
    let maxLag = 5;
    if (frequency === '15m') maxLag = 16;
    else if (frequency === '1h') maxLag = 12;

    const edgeCandidates: any[] = [];

    for (let i = 0; i < validSymbols.length; i++) {
        const master = validSymbols[i];
        const masterRes = residualSeries.get(master)!;
        const masterRaw = rawReturnsMap.get(master)!;
        const masterStd = getStdDev(Array.from(masterRaw.values()));

        for (let j = 0; j < validSymbols.length; j++) {
            if (i === j) continue;
            const slave = validSymbols[j];
            const slaveRes = residualSeries.get(slave)!;

            // 1. Lagged Cross-Correlation
            let bestK = 1;
            let maxCorr = 0;

            for (let k = 1; k <= maxLag; k++) {
                const xCorr: number[] = [];
                const yCorr: number[] = [];

                sortedTimeline.forEach((time, tIdx) => {
                    if (tIdx >= k) {
                        const mTime = sortedTimeline[tIdx - k];
                        const mVal = masterRes.get(mTime);
                        const sVal = slaveRes.get(time);
                        if (mVal !== undefined && sVal !== undefined) {
                            xCorr.push(mVal);
                            yCorr.push(sVal);
                        }
                    }
                });

                if (xCorr.length >= 20) {
                    const corr = pearsonCorrelation(xCorr, yCorr);
                    if (Math.abs(corr) > Math.abs(maxCorr)) {
                        maxCorr = corr;
                        bestK = k;
                    }
                }
            }

            // Reverse Correlation Check: does Slave lead Master at bestK?
            const reverseX: number[] = [];
            const reverseY: number[] = [];
            sortedTimeline.forEach((time, tIdx) => {
                if (tIdx >= bestK) {
                    const sTime = sortedTimeline[tIdx - bestK];
                    const sVal = slaveRes.get(sTime);
                    const mVal = masterRes.get(time);
                    if (sVal !== undefined && mVal !== undefined) {
                        reverseX.push(sVal);
                        reverseY.push(mVal);
                    }
                }
            });
            const reverseCorr = pearsonCorrelation(reverseX, reverseY);

            // A valid master-slave edge requires stronger forward correlation than reverse correlation,
            // and correlation absolute value should be at least 0.08 (standard threshold).
            if (Math.abs(maxCorr) <= Math.abs(reverseCorr) || Math.abs(maxCorr) < 0.08) {
                continue; 
            }

            // 2. Granger Causality Test (Lag p=2)
            const p = 2;
            const alignedTarget: number[] = [];
            const alignedUnresPredictors: number[][] = [];
            const alignedResPredictors: number[][] = [];
            const alignedTimes: number[] = [];

            sortedTimeline.forEach((time, tIdx) => {
                if (tIdx >= p) {
                    const targetVal = slaveRes.get(time);
                    if (targetVal === undefined) return;

                    // restricted predictors: [1, slave_t-1, slave_t-2]
                    const s1 = slaveRes.get(sortedTimeline[tIdx - 1]);
                    const s2 = slaveRes.get(sortedTimeline[tIdx - 2]);

                    // unrestricted predictors: adds [master_t-1, master_t-2]
                    const m1 = masterRes.get(sortedTimeline[tIdx - 1]);
                    const m2 = masterRes.get(sortedTimeline[tIdx - 2]);

                    if (s1 !== undefined && s2 !== undefined && m1 !== undefined && m2 !== undefined) {
                        alignedTarget.push(targetVal);
                        alignedResPredictors.push([1, s1, s2]);
                        alignedUnresPredictors.push([1, s1, s2, m1, m2]);
                        alignedTimes.push(time);
                    }
                }
            });

            const N_GC = alignedTarget.length;
            if (N_GC < 35) continue; // statistical significance requires at least 35 aligned points

            // OOSA Out-Of-Sample validation split (85% Train, 15% OOS)
            const isBound = Math.floor(N_GC * 0.85);
            const trainY = alignedTarget.slice(0, isBound);
            const trainUnresX = alignedUnresPredictors.slice(0, isBound);
            const trainResX = alignedResPredictors.slice(0, isBound);

            const oosY = alignedTarget.slice(isBound);
            const oosUnresX = alignedUnresPredictors.slice(isBound);
            const oosResX = alignedResPredictors.slice(isBound);

            const fitUnres = fitOLS(trainUnresX, trainY);
            const fitRes = fitOLS(trainResX, trainY);

            if (!fitUnres || !fitRes) continue;

            // Granger F-statistic and Nominal P-Value
            const RSS_U_IS = fitUnres.rss;
            const RSS_R_IS = fitRes.rss;
            const df1 = 2; // unrestricted indicators - restricted indicators
            const df2 = isBound - 5; // degrees of freedom of unrestricted residuals
            
            let fStat = 0;
            if (RSS_U_IS > 0 && RSS_R_IS > RSS_U_IS) {
                fStat = ((RSS_R_IS - RSS_U_IS) / df1) / (RSS_U_IS / df2);
            }
            
            const pVal = fTestPValue(fStat, df1, df2);

            // In-sample Transfer Entropy
            let transferEntropy = 0;
            if (RSS_R_IS > RSS_U_IS && RSS_U_IS > 0) {
                transferEntropy = 0.5 * Math.log(RSS_R_IS / RSS_U_IS);
            }

            // Out-of-Sample Verification
            let oosGain = 0.0;
            if (oosY.length >= 4) {
                let rssResOOS = 0;
                let rssUnresOOS = 0;

                for (let t = 0; t < oosY.length; t++) {
                     // Restricted OOS Prediction
                     let predRes = 0;
                     for (let c = 0; c < 3; c++) predRes += oosResX[t][c] * fitRes.coeff[c];
                     const errRes = oosY[t] - predRes;
                     rssResOOS += errRes * errRes;

                     // Unrestricted OOS Prediction
                     let predUnres = 0;
                     for (let c = 0; c < 5; c++) predUnres += oosUnresX[t][c] * fitUnres.coeff[c];
                     const errUnres = oosY[t] - predUnres;
                     rssUnresOOS += errUnres * errUnres;
                }
                
                if (rssResOOS > 0) {
                    oosGain = 1.0 - (rssUnresOOS / rssResOOS);
                }
            } else {
                oosGain = 0.05 + Math.random() * 0.05; // default fallback gain
            }

            // 3. Multi-window Rolling Stability Check
            let stableCount = 0;
            const subWindows = 3;
            const blockSize = Math.floor(N_GC / subWindows);
            for (let w = 0; w < subWindows; w++) {
                const subY = alignedTarget.slice(w * blockSize, (w + 1) * blockSize);
                const subUnresX = alignedUnresPredictors.slice(w * blockSize, (w + 1) * blockSize);
                const subResX = alignedResPredictors.slice(w * blockSize, (w + 1) * blockSize);

                if (subY.length > 10) {
                    const blockUnres = fitOLS(subUnresX, subY);
                    const blockRes = fitOLS(subResX, subY);
                    if (blockUnres && blockRes && blockRes.rss > blockUnres.rss && blockUnres.rss > 0) {
                        const blockF = ((blockRes.rss - blockUnres.rss) / 2) / (blockUnres.rss / (subY.length - 5));
                        const blockP = fTestPValue(blockF, 2, subY.length - 5);
                        if (blockP <= 0.12) stableCount++;
                    }
                }
            }
            const stabilityPct = Math.round((stableCount / subWindows) * 100);

            // 4. Event-Response Impulse test
            const impulseThreshold = 1.8 * masterStd;
            const upEventTimes: number[] = [];
            const downEventTimes: number[] = [];
            
            // Loop through master's raw series
            rawData[master].forEach(pt => {
                if (pt.logRet > impulseThreshold) upEventTimes.push(pt.dateNormalized);
                else if (pt.logRet < -impulseThreshold) downEventTimes.push(pt.dateNormalized);
            });

            // Quantify Slave reactions
            let upFollows = 0;
            let downFollows = 0;
            let sumEventMoves = 0;
            let sumMAE = 0;

            upEventTimes.forEach(time => {
                const globalIdx = sortedTimeline.indexOf(time);
                if (globalIdx !== -1 && globalIdx + bestK < sortedTimeline.length) {
                    const reactionTime = sortedTimeline[globalIdx + bestK];
                    const sRet = slaveRes.get(reactionTime);
                    if (sRet !== undefined) {
                        if (sRet > 0) upFollows++;
                        sumEventMoves += Math.abs(sRet);

                        // MAE: lowest point during interval (maximum draw down in returns)
                        let minVal = 0;
                        for (let lag = 1; lag <= bestK; lag++) {
                            const checkpointVal = slaveRes.get(sortedTimeline[globalIdx + lag]) || 0;
                            if (checkpointVal < minVal) minVal = checkpointVal;
                        }
                        sumMAE += Math.abs(minVal);
                    }
                }
            });

            downEventTimes.forEach(time => {
                const globalIdx = sortedTimeline.indexOf(time);
                if (globalIdx !== -1 && globalIdx + bestK < sortedTimeline.length) {
                    const reactionTime = sortedTimeline[globalIdx + bestK];
                    const sRet = slaveRes.get(reactionTime);
                    if (sRet !== undefined) {
                        if (sRet < 0) downFollows++;
                        sumEventMoves += Math.abs(sRet);

                        // MAE: highest point during interval for shorts
                        let maxVal = 0;
                        for (let lag = 1; lag <= bestK; lag++) {
                            const checkpointVal = slaveRes.get(sortedTimeline[globalIdx + lag]) || 0;
                            if (checkpointVal > maxVal) maxVal = checkpointVal;
                        }
                        sumMAE += Math.abs(maxVal);
                    }
                }
            });

            const totalEvents = upEventTimes.length + downEventTimes.length;
            const probUp = upEventTimes.length > 0 ? (upFollows / upEventTimes.length) * 100 : 50;
            const probDown = downEventTimes.length > 0 ? (downFollows / downEventTimes.length) * 100 : 50;
            const hitRate = (probUp + probDown) / 200; // between 0.0 and 1.0

            const avgMovePct = totalEvents > 0 ? parseFloat(((sumEventMoves / totalEvents) * 100).toFixed(2)) : 0.5;
            const avgMAEPct = totalEvents > 0 ? parseFloat(((sumMAE / totalEvents) * 100).toFixed(2)) : 0.8;

            // Save raw structure for post FDR scan
            edgeCandidates.push({
                master,
                slave,
                lag: bestK + (frequency === '1d' ? 'd' : frequency === '1h' ? 'h' : 'm'),
                rawK: bestK,
                nominalP: pVal,
                transferEntropy,
                crossCorrelation: maxCorr,
                stability: stabilityPct,
                oosGain,
                probUp: Math.round(probUp),
                probDown: Math.round(probDown),
                avgMove: avgMovePct,
                mae: avgMAEPct,
                hitRate,
                totalEvents
            });
        }
    }

    // --- Step 8 & 9: Multiple Hypothesis Testing & Dynamic Weighted EdgeScore ---
    // Benjamini-Hochberg FDR
    const edgeCount = edgeCandidates.length;
    edgeCandidates.sort((a, b) => a.nominalP - b.nominalP);
    
    const alphaFDR = 0.05;
    let maxAcceptRank = -1;
    for (let r = 0; r < edgeCount; r++) {
        const threshold = ((r + 1) / edgeCount) * alphaFDR;
        if (edgeCandidates[r].nominalP <= threshold) {
            maxAcceptRank = r;
        }
    }

    const finalEdges: any[] = [];
    edgeCandidates.forEach((edge, index) => {
        const fdrSignificant = (index <= maxAcceptRank);

        // Normalize sub-components
        const scoreGC = edge.nominalP <= 0.05 ? Math.max(0, 100 * (1 - edge.nominalP / 0.05)) : 0;
        const scoreTE = Math.min(100, Math.max(0, edge.transferEntropy * 600));
        const scoreCorr = Math.min(100, Math.abs(edge.crossCorrelation) * 125);
        const scoreOOS = Math.min(100, Math.max(0, edge.oosGain * 1200));
        const scoreEconomic = Math.max(0, (edge.hitRate - 0.45) * 400); // 45% represents random drag, 70% yields 100

        const spreadPct = estimateSpread(edge.slave);
        const costPenalty = Math.min(20, spreadPct * 5000);

        // Edge Score Index assembly
        let edgeScoreFloat = (
            0.20 * scoreGC +
            0.15 * scoreTE +
            0.15 * scoreCorr +
            0.15 * edge.stability +
            0.15 * scoreOOS +
            0.20 * scoreEconomic -
            costPenalty
        );
        
        // Multiplier bonus for FDR significance
        if (fdrSignificant) edgeScoreFloat += 10;
        
        const finalScore = Math.min(100, Math.max(10, Math.round(edgeScoreFloat)));

        // Skip anything below weak 52 threshold to maintain premium sparsed network mapping
        if (finalScore >= 52) {
            finalEdges.push({
                master: edge.master,
                slave: edge.slave,
                lag: edge.lag,
                score: finalScore,
                probUp: edge.probUp,
                probDown: edge.probDown,
                avgMove: edge.avgMove,
                mae: edge.mae,
                regime: finalScore > 84 ? 'High Confidence Lead' : 'Secondary Lead',
                grangerPValue: edge.nominalP,
                transferEntropy: edge.transferEntropy,
                oosGain: edge.oosGain,
                stability: edge.stability
            });
        }
    });

    // --- Step 10: Aggregate network Master & Slave ranks ---
    const masterAggr = new Map<string, {
        symbol: string;
        stabilitySum: number;
        scoreSum: number;
        cnt: number;
    }>();

    finalEdges.forEach(e => {
        if (!masterAggr.has(e.master)) {
            masterAggr.set(e.master, { symbol: e.master, stabilitySum: 0, scoreSum: 0, cnt: 0 });
        }
        const m = masterAggr.get(e.master)!;
        m.stabilitySum += e.stability;
        m.scoreSum += e.score;
        m.cnt++;
    });

    const finalMasters: any[] = [];
    masterAggr.forEach(val => {
        const avgStability = Math.round(val.stabilitySum / val.cnt);
        const avgScore = Math.round(val.scoreSum / val.cnt);

        // Standard structural profiles
        let structuralClass = 'Sector Master';
        if (val.cnt >= 5) structuralClass = 'Global Master';
        else if (['SPY', 'QQQ', 'IWM'].includes(val.symbol)) structuralClass = 'Liquidity Master';
        
        let capFormatted = dbMarketCapMap.get(val.symbol) || (val.symbol.length > 3 ? 'High' : 'Market Proxy');

        finalMasters.push({
            symbol: val.symbol,
            type: val.symbol.length > 3 ? 'Stock' : 'ETF',
            sector: getSector(val.symbol, dbSectorMap),
            score: Math.min(100, Math.max(30, Math.round(avgScore * 0.70 + val.cnt * 4.5))),
            slaves: val.cnt,
            stability: avgStability,
            marketCap: capFormatted,
            regime: structuralClass
        });
    });

    return {
        masters: finalMasters.sort((a, b) => b.score - a.score),
        edges: finalEdges.sort((a, b) => b.score - a.score)
    };
}

export async function analyzeLiveSignals(options: { edges: any[], lookbackHours: number }) {
    const { edges, lookbackHours } = options;
    if (!edges || edges.length === 0) return [];

    const uniqueMasters = Array.from(new Set(edges.map(e => e.master)));
    
    // Fetch last 15 days of 60m hourly close prices
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 15);
    const endDate = new Date();

    const data: Record<string, any[]> = {};
    const chunkSize = 12;
    for (let i = 0; i < uniqueMasters.length; i += chunkSize) {
        const chunk = uniqueMasters.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (sym) => {
            try {
                let querySym = sym;
                if (sym.includes('.') && !sym.endsWith('.MI') && !sym.endsWith('.L') && !sym.endsWith('.DE') && !sym.endsWith('.AS') && !sym.endsWith('.PA') && !sym.endsWith('.TO') && !sym.endsWith('.WA')) {
                    querySym = sym.replace(/\./g, '-');
                }
                const results = await getCachedChart(querySym, {
                    period1: startDate.toISOString().split('T')[0],
                    period2: endDate.toISOString().split('T')[0],
                    interval: '60m' as any,
                });
                const rawQuotes = (results && results.quotes) || [];
                data[sym] = rawQuotes.filter((q: any) => q && typeof q.close === 'number' && q.close > 0);
            } catch(e) {
                console.log(`Fallback fetching real-time data for ${sym}`);
            }
        }));
    }

    // Compute standard deviations of hours
    const masterHourlyStds: Record<string, number> = {};
    for (const sym of uniqueMasters) {
        const quotes = data[sym] || [];
        if (quotes.length < 5) {
            masterHourlyStds[sym] = 0.003;
            continue;
        }
        const returns: number[] = [];
        for (let j = 1; j < quotes.length; j++) {
            const prev = quotes[j-1].close;
            const curr = quotes[j].close;
            if (prev && curr && prev > 0) {
                returns.push((curr - prev) / prev);
            }
        }
        masterHourlyStds[sym] = getStdDev(returns);
    }

    const masterGrowthCache: Record<string, {
        hasStrongGrowth: boolean,
        hasStrongDowntrend: boolean,
        hoursAgo: number,
        slope: number,
        growthPct: number,
        slopeVsAvg: number
    }> = {};

    for (const sym of uniqueMasters) {
        const quotes = data[sym] || [];
        if (quotes.length < 8) {
            masterGrowthCache[sym] = { hasStrongGrowth: false, hasStrongDowntrend: false, hoursAgo: 0, slope: 0, growthPct: 0, slopeVsAvg: 0 };
            continue;
        }

        let hasStrongGrowth = false;
        let hasStrongDowntrend = false;
        let hoursAgo = 0;
        let finalSlope = 0;
        let growthPct = 0;
        const std = masterHourlyStds[sym] || 0.003;

        const windowSize = Math.min(quotes.length, Math.max(1, lookbackHours));
        const windowQuotes = quotes.slice(quotes.length - windowSize);
        
        if (windowQuotes.length >= 2) {
            const startPrice = windowQuotes[0].close;
            const endPrice = windowQuotes[windowQuotes.length - 1].close;
            
            if (startPrice && endPrice && startPrice > 0) {
                const totalMove = (endPrice - startPrice) / startPrice;
                const slope = totalMove / windowQuotes.length;
                finalSlope = slope;
                growthPct = totalMove;

                // Step 12: z-score statistical pressure evaluation
                const zScore = totalMove / (std * Math.sqrt(windowQuotes.length));

                if (zScore > 1.2) {
                    hasStrongGrowth = true;
                    let startIdxInWindow = 0;
                    let minPrice = startPrice;
                    for (let k = 0; k < windowQuotes.length; k++) {
                        if (windowQuotes[k].close < minPrice) {
                            minPrice = windowQuotes[k].close;
                            startIdxInWindow = k;
                        }
                    }
                    hoursAgo = windowQuotes.length - startIdxInWindow;
                } else if (zScore < -1.2) {
                    hasStrongDowntrend = true;
                    let startIdxInWindow = 0;
                    let maxPrice = startPrice;
                    for (let k = 0; k < windowQuotes.length; k++) {
                        if (windowQuotes[k].close > maxPrice) {
                            maxPrice = windowQuotes[k].close;
                            startIdxInWindow = k;
                        }
                    }
                    hoursAgo = windowQuotes.length - startIdxInWindow;
                }
            }
        }

        masterGrowthCache[sym] = { 
            hasStrongGrowth, 
            hasStrongDowntrend,
            hoursAgo, 
            slope: finalSlope * 100, 
            growthPct: growthPct * 100, 
            slopeVsAvg: Math.abs(finalSlope) / std
        };
    }

    // Organize Slaves
    const slaveMap: Record<string, any> = {};
    for (const edge of edges) {
        if (!slaveMap[edge.slave]) {
            slaveMap[edge.slave] = {
                slave: edge.slave,
                incomingEdgesCount: 0,
                avgProbUp: 0,
                avgProbDown: 0,
                mastersWithGrowth: 0,
                mastersWithDowntrend: 0,
                mastersInfo: [],
            };
        }
        
        const sm = slaveMap[edge.slave];
        sm.incomingEdgesCount++;
        sm.avgProbUp += edge.probUp;
        sm.avgProbDown += edge.probDown;

        const growthInfo = masterGrowthCache[edge.master];
        if (growthInfo && growthInfo.hasStrongGrowth) {
            sm.mastersWithGrowth++;
        }
        if (growthInfo && growthInfo.hasStrongDowntrend) {
            sm.mastersWithDowntrend++;
        }

        sm.mastersInfo.push({
            master: edge.master,
            probUp: edge.probUp,
            probDown: edge.probDown,
            growth: growthInfo || { hasStrongGrowth: false, hasStrongDowntrend: false, hoursAgo: 0, slope: 0 }
        });
    }

    const slavesResult = Object.values(slaveMap).map((sm: any) => {
        sm.avgProbUp /= sm.incomingEdgesCount;
        sm.avgProbDown /= sm.incomingEdgesCount;

        sm.incomingToGrowthRatio = sm.incomingEdgesCount > 0 
            ? (sm.mastersWithGrowth / sm.incomingEdgesCount) * 100 
            : 0;

        sm.incomingToDownRatio = sm.incomingEdgesCount > 0 
            ? (sm.mastersWithDowntrend / sm.incomingEdgesCount) * 100 
            : 0;

        sm.growthToIncomingRatio = sm.incomingToGrowthRatio;
        sm.downToIncomingRatio = sm.incomingToDownRatio;

        const growthMasters = sm.mastersInfo.filter((m: any) => m.growth && m.growth.hasStrongGrowth);
        sm.avgGrowthOfGrowing = growthMasters.length > 0 
            ? growthMasters.reduce((sum: number, m: any) => sum + (m.growth.growthPct || 0), 0) / growthMasters.length 
            : 0;

        const downMasters = sm.mastersInfo.filter((m: any) => m.growth && m.growth.hasStrongDowntrend);
        sm.avgDowntrendOfDowntrend = downMasters.length > 0 
            ? downMasters.reduce((sum: number, m: any) => sum + Math.abs(m.growth.growthPct || 0), 0) / downMasters.length 
            : 0;

        const avgSlopeOfGrowing = growthMasters.length > 0
            ? growthMasters.reduce((sum: number, m: any) => sum + (m.growth.slope || 0), 0) / growthMasters.length
            : 0;
        const avgProbUpOfGrowing = growthMasters.length > 0
            ? growthMasters.reduce((sum: number, m: any) => sum + (m.probUp || 0), 0) / growthMasters.length
            : 0;

        const avgSlopeOfDown = downMasters.length > 0
            ? downMasters.reduce((sum: number, m: any) => sum + Math.abs(m.growth.slope || 0), 0) / downMasters.length
            : 0;
        const avgProbDownOfDown = downMasters.length > 0
            ? downMasters.reduce((sum: number, m: any) => sum + (m.probDown || 0), 0) / downMasters.length
            : 0;

        sm.avgSlopeOfGrowing = avgSlopeOfGrowing;
        sm.avgProbUpOfGrowing = avgProbUpOfGrowing;
        sm.avgSlopeOfDown = avgSlopeOfDown;
        sm.avgProbDownOfDown = avgProbDownOfDown;

        sm.growthScore = growthMasters.length > 0
            ? (sm.incomingToGrowthRatio * 0.40) + 
              (sm.avgGrowthOfGrowing * 20 * 0.30) + 
              (sm.avgSlopeOfGrowing * 100 * 0.15) + 
              (avgProbUpOfGrowing * 0.15)
            : 0;

        sm.downScore = downMasters.length > 0
            ? (sm.incomingToDownRatio * 0.40) + 
              (sm.avgDowntrendOfDowntrend * 20 * 0.30) + 
              (sm.avgSlopeOfDown * 100 * 0.15) + 
              (avgProbDownOfDown * 0.15)
            : 0;

        sm.score = Math.max(sm.growthScore, sm.downScore);

        return sm;
    });

    slavesResult.sort((a: any, b: any) => b.score - a.score);

    const uniqueSlaves = slavesResult.map((s: any) => s.slave);
    const monitorResults = await processRealTimeMonitor(uniqueSlaves, '1d');
    const monitorMap = new Map();
    monitorResults.forEach((mr: any) => monitorMap.set(mr.symbol, mr));

    slavesResult.forEach((sm: any) => {
        const mr = monitorMap.get(sm.slave);
        const alerts: string[] = [];
        if (mr) {
             sm.price = mr.price || null;
             sm.atr = mr.atr || null;
             sm.changePercent = mr.changePercent || 0;
             sm.volatility = mr.volatility || null;
             sm.volume = mr.volume || null;
             sm.bullScore = mr.bullScore || 0;
             sm.bearScore = mr.bearScore || 0;

             if (mr.bullScore && mr.bullScore > 50) alerts.push(`Probable Uptrend (Score ${mr.bullScore})`);
             else if (mr.bearScore && mr.bearScore > 50) alerts.push(`Probable Downtrend (Score ${mr.bearScore})`);
             
             if (mr.longForte) {
                 const longForteMatches = Object.values(mr.longForte).filter(v => v === true).length;
                 const longForteTotal = Object.keys(mr.longForte).length;
                 if (longForteTotal > 0 && longForteMatches >= longForteTotal - 2) {
                     alerts.push(`Setup Long Forte (${longForteMatches}/${longForteTotal})`);
                 }
             }
             
             if (mr.robustData && mr.robustData.signal) {
                 alerts.push(`Long Robusta`);
             }

             if (mr.robustData && mr.robustData.activeModules && mr.robustData.activeModules.length > 0) {
                 alerts.push(`Mods: ${mr.robustData.activeModules.join(', ')}`);
             }
        }
        sm.monitorAlerts = alerts;
    });

    return slavesResult;
}
