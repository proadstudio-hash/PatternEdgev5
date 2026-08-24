import { calculateFeatures } from './indicators.js';
import { getHistoricalBars } from './marketDataService.js';
import { LIVE_WINDOWS } from './trainingPlan.js';
import { getDb } from '../db.js';

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

export async function analyzeMultiHorizon(symbol: string) {
  const now = new Date();
  const windowResults: any[] = [];

  for (const window of LIVE_WINDOWS) {
    let selected: any = null;
    for (const interval of window.preferredIntervals) {
      const from = new Date(now.getTime() - Math.max(window.lookbackMs, interval === '1m' ? 2 * 3600000 : 0));
      try {
        const bars = await getHistoricalBars(symbol, interval, from, now, { sync: true });
        if (bars.length >= 20) {
          selected = { interval, bars };
          break;
        }
      } catch { /* try next compatible sampling rate */ }
    }
    if (!selected) {
      windowResults.push({ id: window.id, label: window.label, status: 'insufficient_data' });
      continue;
    }

    const features = calculateFeatures(selected.bars.map((b: any) => ({
      datetime: b.datetime,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })) as any);
    const last: any = features[features.length - 1];
    const firstClose = selected.bars[0].close;
    const lastClose = selected.bars[selected.bars.length - 1].close;
    const returnPct = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
    const atrPct = last?.atr14 && lastClose ? (last.atr14 / lastClose) * 100 : 0;
    const rsi = Number.isFinite(last?.rsi14) ? last.rsi14 : 50;
    const adx = Number.isFinite(last?.adx) ? last.adx : 0;
    const macdHist = Number.isFinite(last?.macdHist) ? last.macdHist : 0;
    const st = last?.supertrendDir || 0;
    const emaBull = Number.isFinite(last?.ema20) && Number.isFinite(last?.ema50) ? last.ema20 > last.ema50 : false;
    const emaBear = Number.isFinite(last?.ema20) && Number.isFinite(last?.ema50) ? last.ema20 < last.ema50 : false;

    let bullEvidence = 0;
    let bearEvidence = 0;
    if (returnPct > 0) bullEvidence += Math.min(0.25, Math.abs(returnPct) / Math.max(1, atrPct * 6) * 0.25);
    if (returnPct < 0) bearEvidence += Math.min(0.25, Math.abs(returnPct) / Math.max(1, atrPct * 6) * 0.25);
    if (emaBull) bullEvidence += 0.20;
    if (emaBear) bearEvidence += 0.20;
    if (macdHist > 0) bullEvidence += 0.15; else if (macdHist < 0) bearEvidence += 0.15;
    if (st === 1) bullEvidence += 0.15; else if (st === -1) bearEvidence += 0.15;
    if (rsi >= 55 && rsi <= 75) bullEvidence += 0.15;
    if (rsi <= 45 && rsi >= 25) bearEvidence += 0.15;
    if (adx >= 20) {
      if (bullEvidence > bearEvidence) bullEvidence += 0.10;
      else if (bearEvidence > bullEvidence) bearEvidence += 0.10;
    }

    const bull = clamp01(bullEvidence);
    const bear = clamp01(bearEvidence);
    const direction = bull - bear > 0.12 ? 'UP' : bear - bull > 0.12 ? 'DOWN' : 'NEUTRAL';

    windowResults.push({
      id: window.id,
      label: window.label,
      status: 'ok',
      interval: selected.interval,
      bars: selected.bars.length,
      returnPct,
      atrPct,
      rsi,
      adx,
      macdHist,
      direction,
      bullEvidence: bull,
      bearEvidence: bear,
    });
  }

  const valid = windowResults.filter(r => r.status === 'ok');
  const weights: Record<string, number> = { '1w': 0.25, '5d': 0.20, '48h': 0.20, '6h': 0.20, '1h': 0.15 };
  let bull = 0, bear = 0, totalWeight = 0;
  for (const r of valid) {
    const w = weights[r.id] || 0.1;
    bull += r.bullEvidence * w;
    bear += r.bearEvidence * w;
    totalWeight += w;
  }
  if (totalWeight > 0) { bull /= totalWeight; bear /= totalWeight; }

  const db = getDb();
  const trained = db.prepare(`
    SELECT setup_name, training_timeframe, winRate, avgBullGain, avgBearGain, avgBullMoveTime, avgBearMoveTime, sampleSize
    FROM trained_patterns WHERE symbol = ?
  `).all(symbol) as any[];
  const reliable = trained.filter(t => Number(t.sampleSize || 0) >= 20 && Number.isFinite(t.winRate));
  const learnedWin = reliable.length ? reliable.reduce((s, t) => s + Number(t.winRate || 0), 0) / reliable.length : null;
  const avgBullGain = reliable.length ? reliable.reduce((s, t) => s + Number(t.avgBullGain || 0), 0) / reliable.length : 0;
  const avgBearGain = reliable.length ? reliable.reduce((s, t) => s + Math.abs(Number(t.avgBearGain || 0)), 0) / reliable.length : 0;
  const avgBullDuration = reliable.length ? reliable.reduce((s, t) => s + Number(t.avgBullMoveTime || 0), 0) / reliable.length : 0;
  const avgBearDuration = reliable.length ? reliable.reduce((s, t) => s + Number(t.avgBearMoveTime || 0), 0) / reliable.length : 0;

  const net = bull - bear;
  const direction = net > 0.10 ? 'UP' : net < -0.10 ? 'DOWN' : 'NEUTRAL';
  const confidence = clamp01(Math.abs(net) + (learnedWin != null ? Math.max(0, learnedWin - 0.5) * 0.35 : 0));
  const strength = Math.round(confidence * 100);

  return {
    symbol,
    timestamp: now.toISOString(),
    direction,
    confidence,
    strength,
    expectedMovePct: direction === 'UP' ? avgBullGain : direction === 'DOWN' ? -avgBearGain : 0,
    expectedDurationBars: direction === 'UP' ? avgBullDuration : direction === 'DOWN' ? avgBearDuration : 0,
    learnedWinRate: learnedWin,
    trainedModelsUsed: reliable.length,
    windows: windowResults,
  };
}
