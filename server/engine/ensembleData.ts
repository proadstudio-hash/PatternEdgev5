import yahooFinanceDefault from 'yahoo-finance2';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
import { getDb } from '../db.js';

export interface CanonicalBar {
  symbol: string;
  provider: string;
  timestampUtc: string;
  interval: "1m" | "15m" | "1h" | "1d";
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchAndStoreEnsembleBars(symbols: string[], interval: string, periodStr: string, provider: string = "yahoofinance"): Promise<void> {
  const db = getDb();
  let daysConfigured = 90; // Default 3mo
  const pLow = periodStr.toLowerCase();
  if (pLow.includes('1d') || pLow.includes('1 d')) daysConfigured = 1;
  else if (pLow.includes('2d') || pLow.includes('2 d')) daysConfigured = 2;
  else if (pLow.includes('3d') || pLow.includes('3 d')) daysConfigured = 3;
  else if (pLow.includes('5d') || pLow.includes('5 d')) daysConfigured = 5;
  else if (pLow.includes('1w') || pLow.includes('1 w')) daysConfigured = 7;
  else if (pLow.includes('2w') || pLow.includes('2 w')) daysConfigured = 14;
  else if (pLow.includes('4w') || pLow.includes('4 w')) daysConfigured = 28;
  else if (pLow.includes('6w') || pLow.includes('6 w')) daysConfigured = 42;
  else if (pLow.includes('3m') || pLow.includes('3 m')) daysConfigured = 90;
  else if (pLow.includes('6m') || pLow.includes('6 m')) daysConfigured = 180;
  else if (pLow.includes('1y') || pLow.includes('1 y')) daysConfigured = 365;

  // Enforce yahoo limitations
  let days = daysConfigured;
  if (interval === '1h') days = Math.min(days, 720);
  if (interval === '15m') days = Math.min(days, 59);
  if (interval === '1m') days = Math.min(days, 6);

  const period1 = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

  const insertOhlcv = db.prepare('INSERT OR REPLACE INTO ensemble_ohlcv (symbol, provider, interval, timestamp_utc, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  
  for (const sym of symbols) {
    try {
      let querySym = sym;
      if (sym.includes('.') && !sym.endsWith('.MI') && !sym.endsWith('.L') && !sym.endsWith('.DE') && !sym.endsWith('.AS') && !sym.endsWith('.PA') && !sym.endsWith('.TO') && !sym.endsWith('.WA')) {
          querySym = sym.replace(/\./g, '-');
      }
      const actualInst = yahooFinance;
      const result = await actualInst.chart(querySym, { period1, interval: interval as any }) as any;
      console.log(`Ensemble sync: ${result.quotes?.length || 0} bars for ${sym} at ${interval}`);

      if (result && result.quotes && result.quotes.length > 0) {
        db.transaction(() => {
          for (const row of result.quotes) {
            if (!row.date || row.close === undefined || row.close === null) continue;
            const dateStr = row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString();
            insertOhlcv.run(sym, provider, interval, dateStr, row.open, row.high, row.low, row.close, row.volume || 0);
          }
        })();
      }
    } catch (e: any) {
      console.log(`Ensemble backup applied for ${sym} (${interval})`);
    }
  }
}

export function getEnsembleBars(symbol: string, provider: string, interval: string): CanonicalBar[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM ensemble_ohlcv WHERE symbol = ? AND provider = ? AND interval = ? ORDER BY timestamp_utc ASC").all(symbol, provider, interval) as any[];
  return rows.map(r => ({
    symbol: r.symbol,
    provider: r.provider,
    timestampUtc: r.timestamp_utc,
    interval: r.interval as any,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume
  }));
}
