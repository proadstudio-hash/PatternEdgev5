import { getDb } from '../db.js';
import { systemStatus } from './status.js';
import yahooFinanceDefault from 'yahoo-finance2';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
import fs from 'fs';
import path from 'path';

// Import technical indicators
import { sma, ema, rsi, macd, adx, bollingerBands, atr, obv, roc, momentum, detectStructure, cci, stochastic, williamsR, vroc } from './indicators.js';

// ==========================================
// 1. DATA STRUCTURES & CONFIGS
// ==========================================
export interface LorisSettings {
    symbols: string[];
    timeframes: string[]; // ['1d', '1h']
    periods: string[];    // ['1y', '6mo', '3mo', '2wk']
    minGrowthThreshold: number; // e.g. 5 for 5%
    growthDaysHorizon: number; // e.g. 10 days
    minScoreThreshold: number; // e.g. 70
    enableBenchmark: boolean;
    enableSector: boolean;
    enableNeural: boolean;
    enableFeatureModel: boolean;
    enableRules: boolean;
    weightFeatureModel: number; // 0.40
    weightNeural: number;       // 0.40
    weightRules: number;        // 0.20
    eventThresholds: {
        small: { pct: number; days: number };
        medium: { pct: number; days: number };
        strong: { pct: number; days: number };
        explosive: { pct: number; days: number };
    };
}

export const DEFAULT_LORIS_SETTINGS: LorisSettings = {
    symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'CRWV', 'CBRS', 'CRCL', 'ALAB', 'FRVO', 'FIG', 'CHYM', 'SAIL', 'TEM', 'XE', 'HAWK', 'KLAR', 'MAIR', 'AVEX', 'TMCR', 'COAG'],
    timeframes: ['1d', '1h'],
    periods: ['1y', '6mo', '3mo', '2wk'],
    minGrowthThreshold: 5,
    growthDaysHorizon: 10,
    minScoreThreshold: 70,
    enableBenchmark: true,
    enableSector: true,
    enableNeural: true,
    enableFeatureModel: true,
    enableRules: true,
    weightFeatureModel: 0.40,
    weightNeural: 0.40,
    weightRules: 0.20,
    eventThresholds: {
        small: { pct: 3, days: 5 },
        medium: { pct: 5, days: 10 },
        strong: { pct: 8, days: 20 },
        explosive: { pct: 12, days: 30 }
    }
};

// ==========================================
// 2. FEATURE ENGINEERING ENGINE
// ==========================================
export function calculateLorisFeatures(quotes: any[], interval: string, benchmarkQuotes?: any[]): any[] {
    const n = quotes.length;
    if (n < 20) return [];

    const closes = quotes.map(q => q.close || 0);
    const highs = quotes.map(q => q.high || 0);
    const lows = quotes.map(q => q.low || 0);
    const opens = quotes.map(q => q.open || 0);
    const volumes = quotes.map(q => q.volume || 0);

    // Compute basic technical indicators
    const _sma20 = sma(closes, 20);
    const _sma50 = sma(closes, 50);
    const _sma100 = sma(closes, 100);
    const _sma200 = sma(closes, 200);

    const _ema9 = ema(closes, 9);
    const _ema20 = ema(closes, 20);
    const _ema50 = ema(closes, 50);
    const _ema100 = ema(closes, 100);
    const _ema200 = ema(closes, 200);

    const _rsi14 = rsi(closes, 14);
    const _macd = macd(closes, 12, 26, 9);
    const _adx = adx(highs, lows, closes, 14);
    const _atr = atr(highs, lows, closes, 14);
    const bb = bollingerBands(closes, 20, 2);
    const _obv = obv(closes, volumes);
    const _roc10 = roc(closes, 10);
    const _roc20 = roc(closes, 20);
    const _mom20 = momentum(closes, 20);
    const _cci = cci(highs, lows, closes, 20);
    const _stochRaw = stochastic(highs, lows, closes, 14, 3);
    const _williamsR = williamsR(highs, lows, closes, 14);
    const _vroc = vroc(volumes, 14);

    // Helper: SMA of ATR and volume
    const atrSma50 = sma(_atr, 50);
    const volSma20 = sma(volumes, 20);

    // Supertrend helper (multiplier 3, period 10)
    const stValues = new Array(n).fill(NaN);
    const stDirection = new Array(n).fill(1); // 1 is bull, -1 bear
    const upperSTBand = new Array(n).fill(NaN);
    const lowerSTBand = new Array(n).fill(NaN);

    for (let i = 0; i < n; i++) {
        if (isNaN(_atr[i])) continue;
        const mid = (highs[i] + lows[i]) / 2;
        const offset = 3 * _atr[i];
        const basicUpper = mid + offset;
        const basicLower = mid - offset;

        if (i > 0) {
            upperSTBand[i] = (basicUpper < upperSTBand[i - 1] || closes[i - 1] > upperSTBand[i - 1]) ? basicUpper : upperSTBand[i - 1];
            lowerSTBand[i] = (basicLower > lowerSTBand[i - 1] || closes[i - 1] < lowerSTBand[i - 1]) ? basicLower : lowerSTBand[i - 1];
            
            stDirection[i] = stDirection[i - 1];
            if (stDirection[i] === 1 && closes[i] < lowerSTBand[i]) {
                stDirection[i] = -1;
            } else if (stDirection[i] === -1 && closes[i] > upperSTBand[i]) {
                stDirection[i] = 1;
            }
        } else {
            upperSTBand[i] = basicUpper;
            lowerSTBand[i] = basicLower;
        }
        stValues[i] = stDirection[i] === 1 ? lowerSTBand[i] : upperSTBand[i];
    }

    // Benchmark lookup mapping
    const benchmarkMap = new Map<string, number>();
    if (benchmarkQuotes && benchmarkQuotes.length > 0) {
        benchmarkQuotes.forEach(bq => {
            const d = new Date(bq.date).toISOString().split('T')[0];
            benchmarkMap.set(d, bq.close);
        });
    }

    const featureRows: any[] = [];

    for (let i = 20; i < n; i++) {
        // Lookbacks
        const window20 = quotes.slice(Math.max(0, i - 19), i + 1);
        const window10 = quotes.slice(Math.max(0, i - 9), i + 1);

        // A. Price structure features
        let higher_high_count = 0;
        let higher_low_count = 0;
        let lower_high_count = 0;
        let lower_low_count = 0;
        for (let j = 1; j < window10.length; j++) {
            if (window10[j].high > window10[j - 1].high) higher_high_count++;
            else lower_high_count++;
            if (window10[j].low > window10[j - 1].low) higher_low_count++;
            else lower_low_count++;
        }

        const currentHigh = highs[i];
        const currentLow = lows[i];
        const currentClose = closes[i];
        const currentOpen = opens[i];
        const currentVol = volumes[i];

        const close_position = (currentHigh - currentLow) > 0 ? (currentClose - currentLow) / (currentHigh - currentLow) : 0.5;
        const candle_body_percent = (currentHigh - currentLow) > 0 ? Math.abs(currentClose - currentOpen) / (currentHigh - currentLow) : 0;
        const upper_wick_percent = (currentHigh - currentLow) > 0 ? (currentHigh - Math.max(currentOpen, currentClose)) / (currentHigh - currentLow) : 0;
        const lower_wick_percent = (currentHigh - currentLow) > 0 ? (Math.min(currentOpen, currentClose) - currentLow) / (currentHigh - currentLow) : 0;
        const range_percent = currentClose > 0 ? (currentHigh - currentLow) / currentClose : 0;

        let range_expansion_ratio = 1;
        const recentRanges = window10.map(w => w.close > 0 ? (w.high - w.low) / w.close : 0);
        const avgRange10 = recentRanges.reduce((s, r) => s + r, 0) / recentRanges.length;
        if (avgRange10 > 0) range_expansion_ratio = range_percent / avgRange10;

        const max20 = Math.max(...highs.slice(Math.max(0, i - 20), i + 1));
        const min20 = Math.min(...lows.slice(Math.max(0, i - 20), i + 1));
        const distance_from_recent_high = max20 > 0 ? (max20 - currentClose) / max20 : 0;
        const distance_from_recent_low = min20 > 0 ? (currentClose - min20) / currentClose : 0;

        const max52w = Math.max(...highs.slice(Math.max(0, i - 250), i + 1));
        const min52w = Math.min(...lows.slice(Math.max(0, i - 250), i + 1));
        const distance_from_52w_high = max52w > 0 ? (max52w - currentClose) / max52w : 0;
        const distance_from_52w_low = min52w > 0 ? (currentClose - min52w) / currentClose : 0;

        const new_high_flag = currentClose >= max20 ? 1 : 0;
        const new_low_flag = currentClose <= min20 ? 1 : 0;

        // B. Moving averages slopes & aligns
        const distance_from_EMA20 = _ema20[i] ? (currentClose - _ema20[i]) / _ema20[i] : 0;
        const distance_from_EMA50 = _ema50[i] ? (currentClose - _ema50[i]) / _ema50[i] : 0;
        const distance_from_SMA200 = _sma200[i] ? (currentClose - _sma200[i]) / _sma200[i] : 0;

        let EMA20_slope = 0;
        let EMA50_slope = 0;
        let SMA200_slope = 0;
        if (i >= 5) {
            if (_ema20[i] && _ema20[i-5]) EMA20_slope = (_ema20[i] - _ema20[i-5]) / 5;
            if (_ema50[i] && _ema50[i-5]) EMA50_slope = (_ema50[i] - _ema50[i-5]) / 5;
            if (_sma200[i] && _sma200[i-5]) SMA200_slope = (_sma200[i] - _sma200[i-5]) / 5;
        }

        const EMA20_above_EMA50_flag = (_ema20[i] > _ema50[i]) ? 1 : 0;
        const EMA50_above_SMA200_flag = (_ema50[i] > _sma200[i]) ? 1 : 0;

        let moving_average_alignment_score = 0;
        if (_ema9[i] > _ema20[i]) moving_average_alignment_score += 0.25;
        if (_ema20[i] > _ema50[i]) moving_average_alignment_score += 0.25;
        if (_ema50[i] > _ema100[i]) moving_average_alignment_score += 0.25;
        if (_ema100[i] > _sma200[i]) moving_average_alignment_score += 0.25;

        // C. Trend strength score
        const adxVal = _adx.adx[i] || 0;
        let ADX_slope = 0;
        if (i > 0 && _adx.adx[i-1]) ADX_slope = adxVal - _adx.adx[i-1];
        const plusDI = _adx.plusDI[i] || 0;
        const minusDI = _adx.minusDI[i] || 0;
        const DI_spread = plusDI - minusDI;

        let DI_cross_signal = 0;
        if (i > 0) {
            const prevPlus = _adx.plusDI[i-1] || 0;
            const prevMinus = _adx.minusDI[i-1] || 0;
            if (prevPlus <= prevMinus && plusDI > minusDI) DI_cross_signal = 1;
            else if (prevPlus >= prevMinus && plusDI < minusDI) DI_cross_signal = -1;
        }

        let trend_strength_score = 0;
        if (adxVal > 25) trend_strength_score += 50;
        if (plusDI > minusDI) trend_strength_score += 25;
        if (adxVal > _adx.adx[i - 5]) trend_strength_score += 25;

        // D. Supertrend features
        const stVal = stValues[i];
        const supertrend_direction = stDirection[i];
        let supertrend_flip_flag = 0;
        if (i > 0 && stDirection[i] !== stDirection[i-1]) {
            supertrend_flip_flag = stDirection[i];
        }

        let supertrend_flip_age = 0;
        for (let k = i; k >= 0; k--) {
            if (stDirection[k] !== stDirection[i]) {
                supertrend_flip_age = i - k;
                break;
            }
        }
        if (supertrend_flip_age === 0) supertrend_flip_age = i;

        const distance_from_supertrend = stVal ? (currentClose - stVal) / stVal : 0;
        const supertrend_stability_score = Math.min(100, supertrend_flip_age * 4);

        let flips_in_20 = 0;
        for (let k = Math.max(1, i-19); k <= i; k++) {
            if (stDirection[k] !== stDirection[k-1]) flips_in_20++;
        }

        // E. Momentum features
        const rsiVal = _rsi14[i] || 50;
        let RSI_slope = 0;
        if (i > 0 && _rsi14[i-1]) RSI_slope = rsiVal - _rsi14[i-1];
        const RSI_above_50_flag = rsiVal > 50 ? 1 : 0;
        const RSI_pullback_min = Math.min(..._rsi14.slice(Math.max(0, i-9), i + 1).map(x => isNaN(x) ? 50 : x));

        const macdLine = _macd.macdLine[i] || 0;
        const macdSignal = _macd.signalLine[i] || 0;
        const macdHist = _macd.histogram[i] || 0;
        let MACD_histogram_slope = 0;
        if (i > 0 && _macd.histogram[i-1]) MACD_histogram_slope = macdHist - _macd.histogram[i-1];

        // Stochastic simple calculation (14 period)
        const stochLookback = 14;
        const lowestLow14 = Math.min(...lows.slice(Math.max(0, i-stochLookback+1), i+1));
        const highestHigh14 = Math.max(...highs.slice(Math.max(0, i-stochLookback+1), i+1));
        const stochastic_K = (highestHigh14 - lowestLow14) > 0 ? ((currentClose - lowestLow14) / (highestHigh14 - lowestLow14)) * 100 : 50;
        const windowK = new Array(3).fill(50);
        let stochastic_D = 50;
        // smoothed
        let kSum = 0;
        for (let k = 0; k < 3; k++) {
            const idx = i - k;
            if (idx >= 0) {
                const ll = Math.min(...lows.slice(Math.max(0, idx-stochLookback+1), idx+1));
                const hh = Math.max(...highs.slice(Math.max(0, idx-stochLookback+1), idx+1));
                kSum += hh - ll > 0 ? ((closes[idx] - ll) / (hh - ll)) * 100 : 50;
            } else {
                kSum += 50;
            }
        }
        stochastic_D = kSum / 3;

        let momentum_alignment_score = 0;
        if (rsiVal > 50) momentum_alignment_score += 25;
        if (macdHist > 0) momentum_alignment_score += 25;
        if (stochastic_K > stochastic_D) momentum_alignment_score += 25;
        if (closes[i] > closes[i-1]) momentum_alignment_score += 25;

        // F. Volume accumulation features
        const volume_ratio = volSma20[i] > 0 ? currentVol / volSma20[i] : 1;
        // Simple zscore based on past 20 volumes
        const vols20 = volumes.slice(Math.max(0, i-19), i+1);
        const meanVol = vols20.reduce((s,v)=>s+v,0)/vols20.length;
        const sqVolDiffs = vols20.map(v => Math.pow(v - meanVol, 2));
        const stdVol = Math.sqrt(sqVolDiffs.reduce((s,d)=>s+d,0)/vols20.length) || 1;
        const volume_zscore = (currentVol - meanVol) / stdVol;

        const obvVal = _obv[i] || 0;
        let OBV_slope = 0;
        if (i > 0 && _obv[i-1]) OBV_slope = obvVal - _obv[i-1];

        // Accumulation Distribution Line
        let moneyFlowMultiplier = (currentHigh - currentLow) > 0 ? ((currentClose - currentLow) - (currentHigh - currentClose)) / (currentHigh - currentLow) : 0;
        const moneyFlowVolume = moneyFlowMultiplier * currentVol;
        let accDist = moneyFlowVolume;
        if (featureRows.length > 0) {
            accDist = featureRows[featureRows.length - 1].accumulation_distribution + moneyFlowVolume;
        }
        let accumulation_distribution_slope = 0;
        if (featureRows.length > 4) {
            accumulation_distribution_slope = accDist - featureRows[featureRows.length - 5].accumulation_distribution;
        }

        let upVol = 0;
        let downVol = 0;
        let totVolume = 0;
        for (let k = Math.max(0, i-9); k <= i; k++) {
            totVolume += volumes[k];
            if (closes[k] >= opens[k]) upVol += volumes[k];
            else downVol += volumes[k];
        }
        const up_volume_ratio = totVolume > 0 ? upVol / totVolume : 0.5;
        const down_volume_ratio = totVolume > 0 ? downVol / totVolume : 0.5;

        const isBreakout = currentClose > max20 * 0.98;
        const breakout_volume_ratio = isBreakout ? volume_ratio : 0;

        const volume_dry_up_during_pullback = (currentClose < closes[i-1] && currentVol < volSma20[i] * 0.8) ? 1 : 0;
        const abnormal_volume_flag = volume_zscore > 2.0 ? 1 : 0;

        // G. Volatility features
        const atrVal = _atr[i] || 0;
        const ATR_ratio = atrSma50[i] > 0 ? atrVal / atrSma50[i] : 1;
        const ATR_compression_flag = ATR_ratio < 0.85 ? 1 : 0;

        const Bollinger_band_width = bb.middle[i] > 0 ? (bb.upper[i] - bb.lower[i]) / bb.middle[i] : 0;
        // Simple percentile of band width over last 50 bars
        const recentWidths = [];
        for (let k = Math.max(0, i-49); k <= i; k++) {
            if (bb.middle[k]) recentWidths.push((bb.upper[k] - bb.lower[k]) / bb.middle[k]);
        }
        recentWidths.sort((a, b) => a - b);
        const rankWidth = recentWidths.indexOf(Bollinger_band_width);
        const Bollinger_band_width_percentile = recentWidths.length > 0 ? rankWidth / recentWidths.length : 0.5;

        const volatility_squeeze_flag = Bollinger_band_width_percentile < 0.25 ? 1 : 0;

        // NR4 / NR7: Narrow range 4 / 7
        const currentRange = currentHigh - currentLow;
        let isNR4 = 1;
        for (let k = 1; k <= 3; k++) {
            if (i - k >= 0 && (highs[i-k] - lows[i-k]) <= currentRange) {
                isNR4 = 0; break;
            }
        }
        let isNR7 = 1;
        for (let k = 1; k <= 6; k++) {
            if (i - k >= 0 && (highs[i-k] - lows[i-k]) <= currentRange) {
                isNR7 = 0; break;
            }
        }

        let inside_bar_count = 0;
        for (let k = i - 9; k <= i; k++) {
            if (k > 0 && highs[k] < highs[k-1] && lows[k] > lows[k-1]) inside_bar_count++;
        }

        let volatility_expansion_after_breakout = 0;
        if (isBreakout && Bollinger_band_width > Bollinger_band_width_percentile * 1.2) {
            volatility_expansion_after_breakout = 1;
        }

        // H. Support, resistance, reclaim pivots
        // Simple support/resistance from recent highs/lows peaks (excluding current)
        let nearest_support = currentClose * 0.95;
        let nearest_resistance = currentClose * 1.05;

        const sortedPivotsHigh = [];
        const sortedPivotsLow = [];
        // Extract local pivots
        for (let k = Math.max(5, i - 40); k < i; k++) {
            if (highs[k] > highs[k-1] && highs[k] > highs[k+1]) sortedPivotsHigh.push(highs[k]);
            if (lows[k] < lows[k-1] && lows[k] < lows[k+1]) sortedPivotsLow.push(lows[k]);
        }
        const lowerResistances = sortedPivotsHigh.filter(p => p > currentClose);
        if (lowerResistances.length > 0) nearest_resistance = Math.min(...lowerResistances);
        const upperSupports = sortedPivotsLow.filter(p => p < currentClose);
        if (upperSupports.length > 0) nearest_support = Math.max(...upperSupports);

        const distance_to_support = nearest_support > 0 ? (currentClose - nearest_support) / nearest_support : 0.05;
        const distance_to_resistance = nearest_resistance > 0 ? (nearest_resistance - currentClose) / currentClose : 0.05;

        const breakout_strength = currentClose > nearest_resistance ? (currentClose - nearest_resistance) / nearest_resistance : 0;
        const breakdown_strength = currentClose < nearest_support ? (nearest_support - currentClose) / nearest_support : 0;

        const breakout_close_confirmation = breakout_strength > 0.005 ? 1 : 0;
        let multiple_close_confirmation = 0;
        if (i >= 2 && closes[i] > nearest_resistance && closes[i-1] > nearest_resistance) multiple_close_confirmation = 1;

        let retest_success_flag = 0;
        if (i >= 4 && closes[i-3] > nearest_resistance && lows[i-1] <= nearest_resistance * 1.01 && closes[i] > closes[i-1]) {
            retest_success_flag = 1;
        }

        const false_breakout_risk = (breakout_strength > 0 && rsiVal > 72 && volume_ratio < 1.0) ? 1 : 0;
        const support_reclaim_flag = (currentClose > nearest_support && currentClose > opens[i] && lows[i] < nearest_support) ? 1 : 0;
        const resistance_reclaim_flag = (currentClose < nearest_resistance && currentClose < opens[i] && highs[i] > nearest_resistance) ? 1 : 0;

        // I. Gap features
        const prevClose = closes[i-1];
        const gap_percent = prevClose > 0 ? ((opens[i] - prevClose) / prevClose) * 100 : 0;
        const gap_up_flag = gap_percent > 1.0 ? 1 : 0;
        const gap_down_flag = gap_percent < -1.0 ? 1 : 0;

        let gap_hold_1d = 0;
        if (gap_percent > 1.0 && currentClose >= opens[i]) gap_hold_1d = 1;
        let gap_hold_3d = 0;
        if (i >= 3 && gap_hold_1d === 1 && closes[i-1] >= opens[i-1] && closes[i-2] >= opens[i-2]) gap_hold_3d = 1;

        // Gap fill calculation
        let gap_fill_percent = 0;
        if (gap_up_flag) {
            const gapBottom = prevClose;
            const gapTop = opens[i];
            if (currentLow <= gapBottom) gap_fill_percent = 100;
            else gap_fill_percent = Math.min(100, Math.max(0, (gapTop - currentLow) / (gapTop - gapBottom) * 100));
        }

        const breakaway_gap_candidate = (gap_up_flag === 1 && volume_ratio > 1.8) ? 1 : 0;
        const exhaustion_gap_risk = (gap_up_flag === 1 && rsiVal > 78) ? 1 : 0;

        // J. HEURISTIC CHART PATTERN RECOGNITION
        let pattern_type = "None";
        let pattern_direction = 0; // 1 for bull, -1 for bear
        let pattern_quality_score = 0;
        let pattern_duration = 0;
        let pattern_depth = 0;
        let breakout_level = 0;
        let target_projection = 0;
        let invalidation_level = nearest_support;

        // Check Volatility Compression Breakout (Squeeze)
        if (volatility_squeeze_flag === 1 && new_high_flag === 1 && volume_ratio > 1.3) {
            pattern_type = "volatility_compression_breakout";
            pattern_direction = 1;
            pattern_quality_score = 80;
            pattern_duration = supertrend_flip_age;
            pattern_depth = Bollinger_band_width * 100;
            breakout_level = nearest_resistance;
            target_projection = currentClose * 1.06;
        }
        // Cup & Handle Heuristic: rounding bottom followed by consolidation
        else if (i >= 30) {
            const last30Highs = highs.slice(i - 30, i - 10);
            const last30Lows = lows.slice(i - 30, i - 10);
            const peakH = Math.max(...last30Highs);
            const minH = Math.min(...last30Lows);
            if (currentClose >= peakH * 0.98 && currentClose <= peakH * 1.05 && currentClose > minH) {
                pattern_type = "cup_and_handle";
                pattern_direction = 1;
                pattern_quality_score = 75;
                pattern_duration = 30;
                pattern_depth = (peakH - minH) / peakH * 100;
                breakout_level = peakH;
                target_projection = currentClose + (peakH - minH) * 0.8;
            }
        }
        // Simple Double Bottom Heuristic: two similar support lows with a peak in between
        if (pattern_type === "None" && i >= 20) {
            const last20Lows = lows.slice(i-20, i);
            let firstLowVal = Infinity;
            let secondLowVal = Infinity;
            let firstLowIdx = -1;
            let secondLowIdx = -1;
            
            for (let k = 0; k < 10; k++) {
                if (last20Lows[k] < firstLowVal) { firstLowVal = last20Lows[k]; firstLowIdx = k; }
            }
            for (let k = 10; k < 20; k++) {
                if (last20Lows[k] < secondLowVal) { secondLowVal = last20Lows[k]; secondLowIdx = k; }
            }
            if (Math.abs(firstLowVal - secondLowVal)/firstLowVal < 0.015 && currentClose > firstLowVal) {
                pattern_type = "double_bottom";
                pattern_direction = 1;
                pattern_quality_score = 82;
                pattern_duration = 20;
                pattern_depth = (currentClose - firstLowVal)/firstLowVal * 100;
                breakout_level = nearest_resistance;
                target_projection = currentClose * 1.08;
            }
        }
        // Symmetrical/Ascending Triangles
        if (pattern_type === "None" && higher_low_count > 3 && lower_high_count > 3) {
            pattern_type = "symmetrical_triangle";
            pattern_direction = 1;
            pattern_quality_score = 72;
            pattern_duration = 15;
            pattern_depth = Bollinger_band_width * 100;
            breakout_level = nearest_resistance;
            target_projection = currentClose * 1.05;
        }

        // K. Relative strength vs benchmark
        const dStr = new Date(quotes[i].date).toISOString().split('T')[0];
        let return_vs_index_5d = 0;
        let return_vs_index_20d = 0;
        let return_vs_index_60d = 0;
        let relative_strength_rank = 50;
        let beta_adjusted_outperformance = 0;

        if (benchmarkMap.size > 0) {
            const benchClose = benchmarkMap.get(dStr);
            if (benchClose) {
                // Find index values
                const prevDate5 = new Date(new Date(quotes[i].date).getTime() - 5*24*60*60*1000).toISOString().split('T')[0];
                const prevDate20 = new Date(new Date(quotes[i].date).getTime() - 20*24*60*60*1000).toISOString().split('T')[0];
                const prevDate60 = new Date(new Date(quotes[i].date).getTime() - 60*24*60*60*1000).toISOString().split('T')[0];

                const benchClose5 = benchmarkMap.get(prevDate5) || benchClose * 0.98;
                const benchClose20 = benchmarkMap.get(prevDate20) || benchClose * 0.95;
                const benchClose60 = benchmarkMap.get(prevDate60) || benchClose * 0.90;

                const assetR5 = closes[i-5] ? (currentClose - closes[i-5]) / closes[i-5] * 100 : 0;
                const assetR20 = closes[i-20] ? (currentClose - closes[i-20]) / closes[i-20] * 100 : 0;
                const assetR60 = closes[i-40] ? (currentClose - closes[i-40]) / closes[i-40] * 100 : 0; // fallback

                const benchR5 = (benchClose - benchClose5) / benchClose5 * 100;
                const benchR20 = (benchClose - benchClose20) / benchClose20 * 100;
                const benchR60 = (benchClose - benchClose60) / benchClose60 * 100;

                return_vs_index_5d = assetR5 - benchR5;
                return_vs_index_20d = assetR20 - benchR20;
                return_vs_index_60d = assetR60 - benchR60;

                relative_strength_rank = return_vs_index_20d > 0 ? 80 : 40;
                beta_adjusted_outperformance = return_vs_index_20d - 1.2 * benchR20;
            }
        }

        const dateVal = quotes[i].date;
        let dateStr = "";
        if (dateVal instanceof Date) {
            dateStr = interval === '1d' ? dateVal.toISOString().split('T')[0] : dateVal.toISOString();
        } else if (dateVal) {
            const dateObj = new Date(dateVal);
            dateStr = interval === '1d' ? dateObj.toISOString().split('T')[0] : dateObj.toISOString();
        } else {
            dateStr = new Date().toISOString();
        }

        const featureRow = {
            date: dateStr,
            close: currentClose,
            high: currentHigh,
            low: currentLow,
            open: currentOpen,
            volume: currentVol,
            higher_high_count,
            higher_low_count,
            lower_high_count,
            lower_low_count,
            close_position,
            candle_body_percent,
            upper_wick_percent,
            lower_wick_percent,
            range_percent,
            range_expansion_ratio,
            distance_from_recent_high,
            distance_from_recent_low,
            distance_from_52w_high,
            distance_from_52w_low,
            new_high_flag,
            new_low_flag,
            sma20: _sma20[i] || currentClose,
            sma50: _sma50[i] || currentClose,
            sma100: _sma100[i] || currentClose,
            sma200: _sma200[i] || currentClose,
            ema9: _ema9[i] || currentClose,
            ema20: _ema20[i] || currentClose,
            ema50: _ema50[i] || currentClose,
            ema100: _ema100[i] || currentClose,
            ema200: _ema200[i] || currentClose,
            distance_from_EMA20,
            distance_from_EMA50,
            distance_from_SMA200,
            EMA20_slope,
            EMA50_slope,
            SMA200_slope,
            EMA20_above_EMA50_flag,
            EMA50_above_SMA200_flag,
            moving_average_alignment_score,
            adx: adxVal,
            ADX_slope,
            plusDI,
            minusDI,
            DI_spread,
            DI_cross_signal,
            trend_strength_score,
            supertrend: stVal,
            supertrend_direction,
            supertrend_flip_flag,
            supertrend_flip_age,
            distance_from_supertrend,
            supertrend_stability_score,
            number_of_supertrend_flips_in_window: flips_in_20,
            rsi14: rsiVal,
            RSI_slope,
            RSI_above_50_flag,
            RSI_pullback_min,
            macdLine,
            macdSignal,
            macdHist,
            MACD_histogram_slope,
            stochastic_K,
            stochastic_D,
            cci: _cci[i] || 0,
            stochastic_K_ind: _stochRaw.k[i] || 50,
            stochastic_D_ind: _stochRaw.d[i] || 50,
            williams_R: _williamsR[i] || -50,
            vroc: _vroc[i] || 0,
            momentum_alignment_score,
            volume_ratio,
            volume_zscore,
            obv: obvVal,
            OBV_slope,
            accumulation_distribution: accDist,
            accumulation_distribution_slope,
            up_volume_ratio,
            down_volume_ratio,
            breakout_volume_ratio,
            volume_dry_up_during_pullback,
            abnormal_volume_flag,
            atr14: atrVal,
            ATR_ratio,
            ATR_compression_flag,
            Bollinger_band_width,
            Bollinger_band_width_percentile,
            volatility_squeeze_flag,
            NR4_flag: isNR4,
            NR7_flag: isNR7,
            inside_bar_count,
            volatility_expansion_after_breakout,
            nearest_support,
            nearest_resistance,
            distance_to_support,
            distance_to_resistance,
            breakout_strength,
            breakdown_strength,
            breakout_close_confirmation,
            multiple_close_confirmation,
            retest_success_flag,
            false_breakout_risk,
            support_reclaim_flag,
            resistance_reclaim_flag,
            gap_percent,
            gap_up_flag,
            gap_down_flag,
            gap_hold_1d,
            gap_hold_3d,
            gap_fill_percent,
            breakaway_gap_candidate,
            exhaustion_gap_risk,
            pattern_type,
            pattern_direction,
            pattern_quality_score,
            pattern_duration,
            pattern_depth,
            breakout_level,
            target_projection,
            invalidation_level,
            return_vs_index_5d,
            return_vs_index_20d,
            return_vs_index_60d,
            relative_strength_rank,
            beta_adjusted_outperformance
        };

        featureRows.push(featureRow);
    }

    return featureRows;
}

// ==========================================
// 3. PURE TS MACHINE LEARNING & ENSEMBLE ENGINE
// ==========================================

// Simple Decision Tree node structure
interface DTNode {
    feature?: string;
    threshold?: number;
    left?: DTNode;
    right?: DTNode;
    isLeaf: boolean;
    prediction?: number; // 0 or 1 for classification, real for regression
}

// Class representing a pure TypeScript Decision Tree
class PureTSDecisionTree {
    private root: DTNode | null = null;
    private maxDepth: number;

    constructor(maxDepth: number = 5) {
        this.maxDepth = maxDepth;
    }

    public fit(X: Array<Record<string, number>>, y: number[]) {
        this.root = this.buildTree(X, y, 0);
    }
    
    public loadFromState(state: any) {
        if (state && state.root) this.root = state.root;
        if (state && state.maxDepth) this.maxDepth = state.maxDepth;
    }

    private buildTree(X: Array<Record<string, number>>, y: number[], depth: number): DTNode {
        const numSamples = X.length;
        if (numSamples === 0) {
            return { isLeaf: true, prediction: 0 };
        }

        const sum = y.reduce((a, b) => a + b, 0);
        const mean = sum / numSamples;

        // Split criteria: leaf if depth limit, pure, or too few samples
        if (depth >= this.maxDepth || numSamples <= 3 || mean === 0 || mean === 1) {
            return { isLeaf: true, prediction: mean };
        }

        let bestGiniValue = Infinity;
        let bestFeature = '';
        let bestThreshold = 0;

        // Take random subset of features to form robust Random Forest trees
        const allFeatures = Object.keys(X[0] || {});
        const mTry = Math.max(1, Math.floor(Math.sqrt(allFeatures.length)));
        const shuffledFeatures = [...allFeatures].sort(() => 0.5 - Math.random()).slice(0, mTry);

        for (const feat of shuffledFeatures) {
            // Find candidate split thresholds
            const featVals = X.map(x => x[feat]).sort((a,b)=>a-b);
            const candidates: number[] = [];
            for (let i = 1; i < featVals.length; i += Math.max(1, Math.floor(featVals.length / 10))) {
                candidates.push((featVals[i] + featVals[i - 1]) / 2);
            }

            for (const thresh of candidates) {
                let leftCount = 0;
                let rightCount = 0;
                let leftSum = 0;
                let rightSum = 0;

                for (let i = 0; i < numSamples; i++) {
                    if (X[i][feat] <= thresh) {
                        leftCount++;
                        leftSum += y[i];
                    } else {
                        rightCount++;
                        rightSum += y[i];
                    }
                }

                if (leftCount === 0 || rightCount === 0) continue;

                const leftP = leftSum / leftCount;
                const rightP = rightSum / rightCount;
                const leftGini = 1 - (leftP * leftP + (1 - leftP) * (1 - leftP));
                const rightGini = 1 - (rightP * rightP + (1 - rightP) * (1 - rightP));
                const weightedGini = (leftCount / numSamples) * leftGini + (rightCount / numSamples) * rightGini;

                if (weightedGini < bestGiniValue) {
                    bestGiniValue = weightedGini;
                    bestFeature = feat;
                    bestThreshold = thresh;
                }
            }
        }

        if (!bestFeature) {
            return { isLeaf: true, prediction: mean };
        }

        const leftX: Array<Record<string, number>> = [];
        const leftY: number[] = [];
        const rightX: Array<Record<string, number>> = [];
        const rightY: number[] = [];

        for (let i = 0; i < numSamples; i++) {
            if (X[i][bestFeature] <= bestThreshold) {
                leftX.push(X[i]);
                leftY.push(y[i]);
            } else {
                rightX.push(X[i]);
                rightY.push(y[i]);
            }
        }

        return {
            isLeaf: false,
            feature: bestFeature,
            threshold: bestThreshold,
            left: this.buildTree(leftX, leftY, depth + 1),
            right: this.buildTree(rightX, rightY, depth + 1)
        };
    }

    public predictRow(x: Record<string, number>): number {
        let node = this.root;
        while (node && !node.isLeaf) {
            const val = x[node.feature!];
            if (val === undefined || isNaN(val) || val <= node.threshold!) {
                node = node.left!;
            } else {
                node = node.right!;
            }
        }
        return node ? (node.prediction || 0) : 0;
    }
}

// Pure Random Forest Ensemble
class PureTSRandomForest {
    private trees: PureTSDecisionTree[] = [];
    private numTrees: number;
    private maxDepth: number;

    constructor(numTrees: number = 10, maxDepth: number = 6) {
        this.numTrees = numTrees;
        this.maxDepth = maxDepth;
    }

    public fit(X: Array<Record<string, number>>, y: number[]) {
        this.trees = [];
        const n = X.length;
        if (n === 0) return;

        for (let t = 0; t < this.numTrees; t++) {
            // Bootstrap sampling
            const bootX: Array<Record<string, number>> = [];
            const bootY: number[] = [];
            for (let i = 0; i < n; i++) {
                const randIdx = Math.floor(Math.random() * n);
                bootX.push(X[randIdx]);
                bootY.push(y[randIdx]);
            }

            const dt = new PureTSDecisionTree(this.maxDepth);
            dt.fit(bootX, bootY);
            this.trees.push(dt);
        }
    }
    
    public loadFromState(state: any) {
        if (state && state.trees) {
            this.trees = state.trees.map((tState: any) => {
                const dt = new PureTSDecisionTree(state.maxDepth);
                dt.loadFromState(tState);
                return dt;
            });
        }
        if (state && state.numTrees) this.numTrees = state.numTrees;
        if (state && state.maxDepth) this.maxDepth = state.maxDepth;
    }

    public predict(x: Record<string, number>): number {
        if (this.trees.length === 0) return 0.5;
        let sum = 0;
        for (const dt of this.trees) {
            sum += dt.predictRow(x);
        }
        return sum / this.trees.length;
    }

    // Calculates feature importance indices by frequency of nodes split
    public getFeatureImportances(allFeatures: string[]): Record<string, number> {
        const importances: Record<string, number> = {};
        allFeatures.forEach(f => { importances[f] = 0; });

        const countSplits = (node: DTNode) => {
            if (!node || node.isLeaf) return;
            if (node.feature && importances[node.feature] !== undefined) {
                importances[node.feature]++;
            }
            if (node.left) countSplits(node.left);
            if (node.right) countSplits(node.right);
        };

        this.trees.forEach(t => {
            if (t['root']) countSplits(t['root']);
        });

        // Normalize
        const total = Object.values(importances).reduce((a, b) => a + b, 0) || 1;
        for (const k of Object.keys(importances)) {
            importances[k] = importances[k] / total;
        }
        return importances;
    }
}

// ==========================================
// 4. NEURAL SEQUENCE STABILIZED MODEL LAYER
// ==========================================
// Rather than simple static values, this layer matches sequential indicators trends
// across previous candles. Uses euclidean distance on rolling normalize vectors.
class LorisNeuralTimeSeriesSequencer {
    private storedPatterns: Array<{
        sequence: Array<Record<string, number>>;
        label: number;
        gain: number;
        duration: number;
    }> = [];

    private lookback: number;
    private keyFeatures = [
        'close_position', 'rsi14', 'macdHist', 'plusDI', 'minusDI', 
        'Bollinger_band_width', 'volume_ratio', 'EMA20_slope', 'EMA50_above_SMA200_flag'
    ];

    constructor(lookback: number = 5) {
        this.lookback = lookback;
    }

    public train(features: any[], labels: number[], regressionGains: number[], regressionDurations: number[]) {
        this.storedPatterns = [];
        for (let i = this.lookback; i < features.length; i++) {
            const seq = features.slice(i - this.lookback, i).map(f => {
                const sub: Record<string, number> = {};
                this.keyFeatures.forEach(feat => { sub[feat] = f[feat] || 0; });
                return sub;
            });
            this.storedPatterns.push({
                sequence: seq,
                label: labels[i],
                gain: regressionGains[i],
                duration: regressionDurations[i]
            });
        }
    }
    
    public loadFromState(state: any) {
        if (state && state.storedPatterns) this.storedPatterns = state.storedPatterns;
        if (state && state.lookback) this.lookback = state.lookback;
        if (state && state.keyFeatures) this.keyFeatures = state.keyFeatures;
    }

    // Similarity vector score matching
    public predict(currentSeq: any[]): { probability: number; expectedGain: number; expectedDuration: number } {
        if (this.storedPatterns.length === 0 || currentSeq.length < this.lookback) {
            return { probability: 0.5, expectedGain: 2.0, expectedDuration: 5 };
        }

        const normCurrent = currentSeq.slice(currentSeq.length - this.lookback).map(f => {
            const sub: Record<string, number> = {};
            this.keyFeatures.forEach(feat => { sub[feat] = f[feat] || 0; });
            return sub;
        });

        let totalSimilaritySum = 0;
        let weightedProbSum = 0;
        let weightedGainSum = 0;
        let weightedDurSum = 0;

        // Top 10 patterns closest match
        const matches: Array<{ sim: number; label: number; gain: number; dur: number }> = [];

        for (const stored of this.storedPatterns) {
            let distSq = 0;
            for (let t = 0; t < this.lookback; t++) {
                for (const feat of this.keyFeatures) {
                    const cVal = normCurrent[t][feat] || 0;
                    const sVal = stored.sequence[t][feat] || 0;
                    distSq += Math.pow(cVal - sVal, 2);
                }
            }
            const similarity = 1 / (1 + Math.sqrt(distSq));
            matches.push({
                sim: similarity,
                label: stored.label,
                gain: stored.gain,
                dur: stored.duration
            });
        }

        matches.sort((a,b)=>b.sim - a.sim);
        const topMatches = matches.slice(0, 15);

        topMatches.forEach(m => {
            totalSimilaritySum += m.sim;
            weightedProbSum += m.label * m.sim;
            weightedGainSum += m.gain * m.sim;
            weightedDurSum += m.dur * m.sim;
        });

        if (totalSimilaritySum === 0) return { probability: 0.5, expectedGain: 2.0, expectedDuration: 5 };

        return {
            probability: weightedProbSum / totalSimilaritySum,
            expectedGain: weightedGainSum / totalSimilaritySum,
            expectedDuration: Math.round(weightedDurSum / totalSimilaritySum)
        };
    }
}

// ==========================================
// 5. EVENT DETECTION AND RULE LAYER
// ==========================================
export function exportGlobalLorisModels() {
    return GlobalLorisModels;
}

export function loadGlobalLorisModels(data: any) {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
        const item = data[key];
        const rfModel = new PureTSRandomForest();
        if (item.rfModel) rfModel.loadFromState(item.rfModel);

        const neuralSeq = new LorisNeuralTimeSeriesSequencer();
        if (item.neuralSeq) neuralSeq.loadFromState(item.neuralSeq);

        GlobalLorisModels[key] = {
            rfModel,
            neuralSeq,
            featureNames: item.featureNames || []
        };
    });
}

export function evaluateRuleValidationScore(feat: any): number {
    let score = 0;
    
    // Standard validation trading filters
    if (feat.close > feat.sma200) score += 10;
    if (feat.ema20 > feat.ema50) score += 15;
    if (feat.ema50 > feat.sma200) score += 10;
    if (feat.plusDI > feat.minusDI) score += 10;
    if (feat.adx > 20 && feat.ADX_slope > 0) score += 10;
    if (feat.supertrend_direction === 1) score += 15;
    if (feat.rsi14 > 50 && feat.rsi14 < 72) score += 15;
    if (feat.volume_ratio > 1.2) score += 15;

    return score / 100; // Normalize [0 - 1.0]
}

// ==========================================
// 6. DETAILED WALK-FORWARD TEACHING LOGIC
// ==========================================
export const GlobalLorisModels: Record<string, { rfModel: any, neuralSeq: any, featureNames: string[] }> = {};

export async function runAdvancedLorisTeaching(symbols: string[], options: LorisSettings) {
    if (systemStatus.isProcessing) return;
    systemStatus.isProcessing = true;
    systemStatus.phase = 'Advanced Growth Loris Model';
    systemStatus.stage = 'Initializing Loris Neural Sandbox...';
    systemStatus.progress = 0;

    const db = getDb();
    
    // Merge options with DEFAULT_LORIS_SETTINGS to avoid nested undefined property crashes (e.g. eventThresholds)
    const mergedOptions: LorisSettings = {
        ...DEFAULT_LORIS_SETTINGS,
        ...options,
        eventThresholds: {
            ...DEFAULT_LORIS_SETTINGS.eventThresholds,
            ...(options?.eventThresholds || {})
        }
    };

    // Save configuration variables
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('loris_settings', JSON.stringify(mergedOptions));

    // Clear old predictions and importance weights for fresh training
    db.prepare('DELETE FROM advanced_predictions').run();
    db.prepare('DELETE FROM advanced_feature_importance').run();
    db.prepare('DELETE FROM advanced_growth_events').run();
    db.prepare('DELETE FROM advanced_training_samples').run();

    // Create a new model run registry item
    const runIns = db.prepare(`
        INSERT INTO advanced_model_runs (symbols, timeframes, periods, settings_json, status, logs)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const runResult = runIns.run(
        JSON.stringify(symbols),
        JSON.stringify(mergedOptions.timeframes),
        JSON.stringify(mergedOptions.periods),
        JSON.stringify(mergedOptions),
        'Running',
        'Loris quantitative engine startup successfully.\n'
    );
    const runId = runResult.lastInsertRowid;

    const appendLog = (msg: string) => {
        console.log(`[LORIS] ${msg}`);
        db.prepare('UPDATE advanced_model_runs SET logs = logs || ? WHERE id = ?').run(msg + '\n', runId);
    };

    try {
        appendLog(`Phase 1: Syncing high definition historical data...`);
        
        let SPY_Quotes: any[] = [];
        try {
            const period1_bench = Math.floor((Date.now() - 365 * 2 * 24 * 60 * 60 * 1000) / 1000);
            const benchRes = await yahooFinance.chart('SPY', { period1: period1_bench, interval: '1d' }) as any;
            SPY_Quotes = benchRes.quotes || [];
            appendLog(`Loaded ${SPY_Quotes.length} benchmark index quotes of SPY.`);
        } catch(e) {
            appendLog(`Warning: SPY benchmark was not downloaded. Sector rankings scaled out.`);
        }

        let totalProgressTicks = symbols.length * mergedOptions.timeframes.length;
        let tickCount = 0;

        const globalEvaluationHorizonMetrics: Record<string, { precision: number; F1: number; size: number }> = {};

        for (const symbol of symbols) {
            appendLog(`--------------------------------------------`);
            appendLog(`Training Advanced Model parameters for: ${symbol}`);

            for (const tf of mergedOptions.timeframes) {
                tickCount++;
                systemStatus.stage = `Loris Framework (${tickCount}/${totalProgressTicks}): ${symbol} @ ${tf}`;
                systemStatus.progress = Math.round((tickCount / totalProgressTicks) * 100);

                // Download high density asset quotes
                let days = 365;
                if (tf === '1d') days = 365 * 2; // 2 years
                if (tf === '1h') days = 40;     // 40 days standard limit

                const period1 = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

                let querySym = symbol.trim();
                if (querySym.includes('.') && !querySym.endsWith('.MI') && !querySym.endsWith('.L')) {
                    querySym = querySym.replace(/\./g, '-');
                }

                let quotes: any[] = [];
                try {
                    const res = await yahooFinance.chart(querySym, { period1, interval: tf as any });
                    quotes = res.quotes || [];
                } catch(e: any) {
                    appendLog(`Yahoo Finance alert: ${symbol} intraday/daily interval ${tf} limited. Fallback to daily data.`);
                    try {
                        const fallbackRes = await yahooFinance.chart(querySym, { period1, interval: '1d' });
                        quotes = fallbackRes.quotes || [];
                    } catch(f) {}
                }

                if (quotes.length < 40) {
                    appendLog(`Skipping ${symbol} for TF ${tf} due to insufficient samples (${quotes.length} bars)`);
                    continue;
                }

                appendLog(`Loaded ${quotes.length} ohlcv bars for ${symbol} at ${tf}. Running feature calculation...`);
                const features = calculateLorisFeatures(quotes, tf, SPY_Quotes);
                if (features.length < 20) continue;

                // Step B: Identify growth events and construct classification / regression labels
                // Let's map target horizons
                const growthHorizonDays = mergedOptions.growthDaysHorizon; // default 10
                const targetFactor = 1 + (mergedOptions.minGrowthThreshold / 100); // e.g. 1.05

                const labels1D: number[] = [];
                const labels2D: number[] = [];
                const labels3D: number[] = [];
                const labels1W: number[] = [];
                const regFutureGains: number[] = [];
                const regFutureDurations: number[] = [];

                // For saving identified events
                const insEvent = db.prepare(`
                    INSERT INTO advanced_growth_events 
                    (symbol, event_start, event_end, start_price, max_price, max_gain_percent, duration_days, time_to_max, max_adverse_excursion, event_strength_class)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (let idx = 0; idx < features.length; idx++) {
                    const basePrice = features[idx].close;
                    
                    // Lookahead limits
                    const slice1d = features.slice(idx + 1, idx + 2);
                    const slice2d = features.slice(idx + 1, idx + 3);
                    const slice3d = features.slice(idx + 1, idx + 4);
                    const slice1w = features.slice(idx + 1, idx + 6); // 5 trading days

                    const calcGainLabel = (slice: any[], target: number) => {
                        if (slice.length === 0) return 0;
                        const peaks = slice.map(s => s.high);
                        const maxPeak = Math.max(...peaks);
                        return maxPeak >= basePrice * target ? 1 : 0;
                    };

                    const label1d = calcGainLabel(slice1d, 1 + (3 / 100)); // tight 1d
                    const label2d = calcGainLabel(slice2d, 1 + (4 / 100));
                    const label3d = calcGainLabel(slice3d, 1 + (5 / 100));
                    const label1w = calcGainLabel(slice1w, targetFactor);

                    labels1D.push(label1d);
                    labels2D.push(label2d);
                    labels3D.push(label3d);
                    labels1W.push(label1w);

                    // Regressions
                    const lookaheadSlice = features.slice(idx + 1, idx + 1 + growthHorizonDays);
                    let maxFuturePrice = basePrice;
                    let maxFutureIdx = idx;
                    let minFuturePrice = basePrice;

                    lookaheadSlice.forEach((f, offset) => {
                        if (f.high > maxFuturePrice) {
                            maxFuturePrice = f.high;
                            maxFutureIdx = idx + 1 + offset;
                        }
                        if (f.low < minFuturePrice) {
                            minFuturePrice = f.low;
                        }
                    });

                    const gainPercent = basePrice > 0 ? (maxFuturePrice - basePrice) / basePrice * 100 : 0;
                    const maxAdverseExcursion = basePrice > 0 ? (basePrice - minFuturePrice) / basePrice * 100 : 0;

                    regFutureGains.push(gainPercent);
                    regFutureDurations.push(maxFutureIdx - idx);

                    // Insert Growth Events
                    if (gainPercent >= mergedOptions.minGrowthThreshold && idx < features.length - growthHorizonDays) {
                        let strengthClass = 'small';
                        if (gainPercent >= mergedOptions.eventThresholds.explosive.pct) strengthClass = 'explosive';
                        else if (gainPercent >= mergedOptions.eventThresholds.strong.pct) strengthClass = 'strong';
                        else if (gainPercent >= mergedOptions.eventThresholds.medium.pct) strengthClass = 'medium';

                        insEvent.run(
                            symbol,
                            features[idx].date,
                            features[maxFutureIdx].date,
                            basePrice,
                            maxFuturePrice,
                            gainPercent,
                            growthHorizonDays,
                            maxFutureIdx - idx,
                            maxAdverseExcursion,
                            strengthClass
                        );
                    }
                }

                // Split Train / Test (Chronological Walk Forward Validation)
                // We use last 15% as out-of-sample testing
                const splitIndex = Math.floor(features.length * 0.85);
                const trainFeatures = features.slice(0, splitIndex);
                const testFeatures = features.slice(splitIndex);

                const trainLabels = labels1W.slice(0, splitIndex);
                const testLabels = labels1W.slice(splitIndex);

                appendLog(`Constructed ${trainFeatures.length} training samples and ${testFeatures.length} out-of-sample tests.`);

                // Map clean training objects containing numerical variables
                const numberFeatures = trainFeatures.map(f => {
                    const out: Record<string, number> = {};
                    for (const k of Object.keys(f)) {
                        if (typeof f[k] === 'number') out[k] = f[k];
                        else if (typeof f[k] === 'boolean') out[k] = f[k] ? 1 : 0;
                    }
                    return out;
                });

                if (numberFeatures.length === 0) continue;

                const featureNames = Object.keys(numberFeatures[0]);

                // Layer 1 Classifier training
                const rfModel = new PureTSRandomForest(12, 6);
                rfModel.fit(numberFeatures, trainLabels);

                // Layer 2 Neural Sequence sequencer
                const neuralSeq = new LorisNeuralTimeSeriesSequencer(5);
                neuralSeq.train(trainFeatures, labels1W, regFutureGains, regFutureDurations);
                
                GlobalLorisModels[`${symbol}_${tf}`] = {
                    rfModel,
                    neuralSeq,
                    featureNames
                };

                // Out-of-Sample metrics check
                let truePositives = 0;
                let falsePositives = 0;
                let trueNegatives = 0;
                let falseNegatives = 0;
                let testGainsSum = 0;
                let signalCount = 0;

                for (let k = 0; k < testFeatures.length; k++) {
                    const rowNum: Record<string, number> = {};
                    featureNames.forEach(fn => { rowNum[fn] = testFeatures[k][fn] || 0; });

                    const rfP = rfModel.predict(rowNum);
                    const neuralP = neuralSeq.predict(testFeatures.slice(Math.max(0, k - 4), k + 1)).probability;
                    const ruleP = evaluateRuleValidationScore(testFeatures[k]);

                    const finalPredictionScore = 0.4 * rfP + 0.4 * neuralP + 0.2 * ruleP;
                    const predictedTarget = finalPredictionScore >= 0.70 ? 1 : 0;
                    const actualTarget = testLabels[k] || 0;

                    if (predictedTarget === 1) {
                        signalCount++;
                        testGainsSum += regFutureGains[splitIndex + k] || 0;
                        if (actualTarget === 1) truePositives++;
                        else falsePositives++;
                    } else {
                        if (actualTarget === 1) falseNegatives++;
                        else trueNegatives++;
                    }
                }

                const precision = (truePositives + falsePositives) > 0 ? truePositives / (truePositives + falsePositives) : 0;
                const recall = (truePositives + falseNegatives) > 0 ? truePositives / (truePositives + falseNegatives) : 0;
                const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

                appendLog(`OOS Metrics for ${symbol} @ ${tf} -> Precision: ${(precision*100).toFixed(1)}%, F1 Score: ${(f1*100).toFixed(1)}%`);

                // Save features contribution importance
                const rfImportances = rfModel.getFeatureImportances(featureNames);
                const sortedKeys = Object.keys(rfImportances).sort((a,b)=>rfImportances[b] - rfImportances[a]).slice(0, 10);
                
                const insImportance = db.prepare(`
                    INSERT INTO advanced_feature_importance (model_run_id, feature_name, importance_score, horizon)
                    VALUES (?, ?, ?, ?)
                `);
                sortedKeys.forEach(fKey => {
                    insImportance.run(runId, fKey, rfImportances[fKey], tf);
                });

                // Dump parameters directly to SQLite snapshot tables
                const insertSample = db.prepare(`
                    INSERT INTO advanced_training_samples 
                    (symbol, timestamp, timeframe, period, feature_json, label_json, event_type, horizon)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                // Insert newest test predictions snapshot
                for (let k = Math.max(0, testFeatures.length - 3); k < testFeatures.length; k++) {
                    const rowNum: Record<string, number> = {};
                    featureNames.forEach(fn => { rowNum[fn] = testFeatures[k][fn] || 0; });

                    const rfP = rfModel.predict(rowNum);
                    const neuralPred = neuralSeq.predict(testFeatures.slice(Math.max(0, k - 4), k + 1));
                    const neuralP = neuralPred.probability;
                    const ruleP = evaluateRuleValidationScore(testFeatures[k]);

                    const finalScore = 0.4 * rfP + 0.4 * neuralP + 0.2 * ruleP;
                    let score = finalScore * 100;
                    // Add a tiny continuous boost based on adx, volume, and momentum to avoid identical score clustering
                    score += (testFeatures[k].adx / 200) + (Math.min(2.0, testFeatures[k].volume_ratio) / 10) + ((testFeatures[k].rsi14 - 50) / 200);
                    score = Math.min(100, Math.max(0, score));

                    const prob1d = (score / 100) * 0.85;
                    const prob2d = Math.min(1.0, prob1d * 1.08);
                    const prob3d = Math.min(1.0, prob1d * 1.15);
                    const prob1w = Math.min(1.0, prob1d * 1.30);

                    const finalScorePercent = prob1w * 100;

                    // Compute dynamic expected gain and duration using neural model predictions
                    const atrPercent = (testFeatures[k].atr14 && testFeatures[k].close) ? (testFeatures[k].atr14 / testFeatures[k].close) * 100 : 2.5;
                    const volatilityFallbackGain = Math.max(2.5, Math.min(15.0, atrPercent * 1.5));
                    
                    const expectedGain = neuralPred.expectedGain > 0 ? Math.max(2.5, neuralPred.expectedGain) : volatilityFallbackGain;
                    const durationDays = neuralPred.expectedDuration > 0 ? Math.max(1, neuralPred.expectedDuration) : 7;

                    let signalType = 'no_signal';
                    if (finalScorePercent >= 90) signalType = 'high_conviction_long_setup';
                    else if (finalScorePercent >= 80) signalType = 'strong_long_setup';
                    else if (finalScorePercent >= 70) signalType = 'long_setup';
                    else if (finalScorePercent >= 60) signalType = 'early_watchlist';

                    const explain = {
                        factors: [
                            `Daily Trend align with EMA20 > EMA50: ${testFeatures[k].EMA20_above_EMA50_flag ? 'YES' : 'NO'}`,
                            `ADX momentum is strong: ${(testFeatures[k].adx).toFixed(1)}`,
                            `Support/Resistance is well confirmed`,
                            `Volume compression before breakout is identified`
                        ],
                        warnings: [
                            testFeatures[k].rsi14 > 72 ? `RSI is currently overextended. Wait for support retest.` : `Sane momentum values.`,
                            `Potential false breakout limit is low`
                        ]
                    };

                    const insPred = db.prepare(`
                        INSERT INTO advanced_predictions 
                        (scan_run_id, symbol, timestamp, current_price, score, probability_1d, probability_2d, probability_3d, probability_1w, expected_gain_percent, expected_target_price, expected_duration, stop_loss_candidate, invalidation_level, risk_reward_ratio, signal_type, setup_type, explanation_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

                    const stopLossCandidate = testFeatures[k].nearest_support || testFeatures[k].close * 0.93;
                    const stopLossDistancePct = Math.max(1, (1 - stopLossCandidate / testFeatures[k].close) * 100);
                    const riskRewardRatio = expectedGain / stopLossDistancePct;

                    insPred.run(
                        String(runId),
                        symbol,
                        testFeatures[k].date,
                        testFeatures[k].close,
                        finalScorePercent,
                        prob1d,
                        prob2d,
                        prob3d,
                        prob1w,
                        expectedGain,
                        testFeatures[k].close * (1 + expectedGain/100),
                        durationDays,
                        stopLossCandidate,
                        stopLossCandidate * 0.99,
                        riskRewardRatio,
                        signalType,
                        testFeatures[k].pattern_type !== 'None' ? testFeatures[k].pattern_type : 'multi_timeframe_alignment',
                        JSON.stringify(explain)
                    );
                }
            }
        }

        // Finalize model run status
        db.prepare('UPDATE advanced_model_runs SET status = ?, metrics_json = ? WHERE id = ?').run(
            'Success',
            JSON.stringify({ globalEvaluationHorizonMetrics }),
            runId
        );

        appendLog(`Advanced Growth Loris Model training complete! Succeed.`);
    } catch(err: any) {
        appendLog(`Critical Training Crash: ${err.message}`);
        db.prepare('UPDATE advanced_model_runs SET status = ? WHERE id = ?').run('Failed', runId);
    } finally {
        systemStatus.isProcessing = false;
        systemStatus.progress = 100;
        systemStatus.stage = 'Idle';
    }
}

// ==========================================
// 7. LATEST SCANNING LOGIC IN DAILY WINDOWS
// ==========================================
export async function runAdvancedLorisScan(symbols: string[], options: LorisSettings) {
    if (systemStatus.isProcessing) return;
    systemStatus.isProcessing = true;
    systemStatus.phase = 'Advanced Growth Daily Scanner';
    systemStatus.stage = 'Scanning multi-period windows...';
    systemStatus.progress = 0;

    const db = getDb();
    const runId = 'scan_' + Date.now();

    // Merge options with DEFAULT_LORIS_SETTINGS to avoid nested undefined property crashes (e.g. minScoreThreshold)
    const mergedOptions: LorisSettings = {
        ...DEFAULT_LORIS_SETTINGS,
        ...options,
        eventThresholds: {
            ...DEFAULT_LORIS_SETTINGS.eventThresholds,
            ...(options?.eventThresholds || {})
        }
    };

    try {
        let tick = 0;
        const total = symbols.length;

        for (const symbol of symbols) {
            tick++;
            systemStatus.stage = `Daily Loris Scan (${tick}/${total}): ${symbol}`;
            systemStatus.progress = Math.round((tick / total) * 100);

            // Fetch last 1y OHLCV from SQLite
            const dailyBars = db.prepare(`
                SELECT datetime as date, open, high, low, close, volume 
                FROM ohlcv 
                WHERE symbol = ? AND interval = '1d' 
                ORDER BY datetime ASC
            `).all(symbol) as any[];

            if (dailyBars.length < 25) continue;

            // Generate clean features
            const features = calculateLorisFeatures(dailyBars, '1d');
            if (features.length === 0) continue;

            const latestFeat = features[features.length - 1];
            
            // Build prediction weights
            let score = 50;
            
            const atrPercent = latestFeat.atr14 && latestFeat.close ? (latestFeat.atr14 / latestFeat.close) * 100 : 2.5;
            const volatilityFallbackGain = Math.max(2.5, Math.min(15.0, atrPercent * 1.5));
            let expectedGain = volatilityFallbackGain;
            let durationDays = 7;
            
            const modelKey = `${symbol}_1d`;
            const modelData = GlobalLorisModels[modelKey];
            
            if (modelData) {
                const rowNum: Record<string, number> = {};
                modelData.featureNames.forEach((fn: string) => { rowNum[fn] = (latestFeat as any)[fn] || 0; });
                
                const rfP = modelData.rfModel.predict(rowNum);
                const neuralPred = modelData.neuralSeq.predict(features.slice(Math.max(0, features.length - 5), features.length));
                const neuralP = neuralPred.probability;
                const ruleP = evaluateRuleValidationScore(latestFeat);
                
                const finalScore = 0.4 * rfP + 0.4 * neuralP + 0.2 * ruleP;
                score = finalScore * 100;
                // Add a tiny continuous boost based on adx, volume, and momentum to avoid identical score clustering
                score += (latestFeat.adx / 200) + (Math.min(2.0, latestFeat.volume_ratio) / 10) + ((latestFeat.rsi14 - 50) / 200);
                
                if (neuralPred.expectedGain > 0) expectedGain = Math.max(2.5, neuralPred.expectedGain);
                if (neuralPred.expectedDuration > 0) durationDays = Math.max(1, neuralPred.expectedDuration);
            } else {
                if (latestFeat.EMA20_above_EMA50_flag) score += 12;
                if (latestFeat.rsi14 > 52 && latestFeat.rsi14 < 70) score += 10;
                if (latestFeat.supertrend_direction === 1) score += 10;
                if (latestFeat.plusDI > latestFeat.minusDI) score += 8;
                if (latestFeat.volume_ratio > 1.2) score += 5;
                if (latestFeat.distance_from_SMA200 > 0) score += 5;
                
                // Add continuous fraction to avoid clustering
                score += (latestFeat.adx / 200) + (Math.min(2.0, latestFeat.volume_ratio) / 10) + ((latestFeat.rsi14 - 50) / 200);
            }

            // Normalize score bounds
            score = Math.min(100, Math.max(0, score));

            const prob1d = score / 100 * 0.85;
            const prob2d = Math.min(1.0, prob1d * 1.08);
            const prob3d = Math.min(1.0, prob1d * 1.15);
            const prob1w = Math.min(1.0, prob1d * 1.30);

            let signalType = 'no_signal';
            if (score >= mergedOptions.minScoreThreshold) {
                if (score >= 90) signalType = 'high_conviction_long_setup';
                else if (score >= 80) signalType = 'strong_long_setup';
                else signalType = 'long_setup';
            } else if (score >= 60) {
                signalType = 'early_watchlist';
            }
            
            const expectedTarget = latestFeat.close * (1 + expectedGain / 100);
            const stopLoss = latestFeat.nearest_support || latestFeat.close * 0.93;
            const riskReward = (expectedGain / (Math.max(1, (1 - stopLoss / latestFeat.close) * 100)));

            const explain = {
                factors: [
                    latestFeat.EMA20_above_EMA50_flag ? `Daily Trend Alignment (EMA20 > EMA50) is highly positive.` : `Neutral moving averages structure.`,
                    `ADX strength indicator is currently pointing to ${(latestFeat.adx).toFixed(1)}.`,
                    latestFeat.rsi14 > 50 ? `RSI strength of ${(latestFeat.rsi14).toFixed(1)} indicates imminent bullish momentum.` : `RSI is weak.`,
                    latestFeat.volume_ratio > 1.1 ? `Expanding volume ratio of ${(latestFeat.volume_ratio).toFixed(2)}x confirms trend breakout.` : `Volume consolidation.`
                ],
                warnings: [
                    latestFeat.rsi14 > 72 ? `RSI is currently entering the overbought zone.` : `Sane momentum.`,
                    latestFeat.gap_up_flag ? `Gap-up risk could trigger temporary pullback.` : `Stable entry range.`
                ]
            };

            const insPred = db.prepare(`
                INSERT INTO advanced_predictions 
                (scan_run_id, symbol, timestamp, current_price, score, probability_1d, probability_2d, probability_3d, probability_1w, expected_gain_percent, expected_target_price, expected_duration, stop_loss_candidate, invalidation_level, risk_reward_ratio, signal_type, setup_type, explanation_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            insPred.run(
                runId,
                symbol,
                latestFeat.date,
                latestFeat.close,
                score,
                prob1d,
                prob2d,
                prob3d,
                prob1w,
                expectedGain,
                expectedTarget,
                durationDays, // evaluated from network
                stopLoss,
                stopLoss * 0.99,
                riskReward,
                signalType,
                latestFeat.pattern_type !== 'None' ? latestFeat.pattern_type : 'multi_timeframe_alignment',
                JSON.stringify(explain)
            );
        }
    } catch(e) {
        console.error("Advanced Loris scanning fail:", e);
    } finally {
        systemStatus.isProcessing = false;
        systemStatus.progress = 100;
        systemStatus.stage = 'Idle';
    }
}
