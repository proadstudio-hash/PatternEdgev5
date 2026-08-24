import { getDb } from '../db.js';
import { getCachedChart } from './yfCache.js';

export type SupportedInterval = '1m' | '5m' | '15m' | '1h' | '60m' | '1d';

export interface StoredBar {
  symbol: string;
  interval: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SyncResult {
  symbol: string;
  interval: string;
  requestedFrom: string;
  requestedTo: string;
  availableFrom: string | null;
  availableTo: string | null;
  barsStored: number;
  barsFetched: number;
  provider: 'yahoo';
  status: 'ok' | 'partial' | 'cached' | 'error';
  message?: string;
}

const DAY = 24 * 60 * 60 * 1000;

const INTERVAL_LIMIT_DAYS: Record<string, number | null> = {
  '1m': 7,
  '5m': 60,
  '15m': 60,
  '1h': 730,
  '60m': 730,
  '1d': null,
};

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '60m': 60 * 60_000,
  '1d': DAY,
};

export function canonicalInterval(interval: string): SupportedInterval {
  const v = String(interval || '1d').trim().toLowerCase();
  if (v === '60m' || v === '1h' || v === '1 hour' || v === '1hour') return '1h';
  if (v === '15m' || v === '15 minutes' || v === '15minutes') return '15m';
  if (v === '5m' || v === '5 minutes' || v === '5minutes') return '5m';
  if (v === '1m' || v === '1 minute' || v === '1minute') return '1m';
  return '1d';
}

export function yahooInterval(interval: string): string {
  const v = canonicalInterval(interval);
  return v === '1h' ? '60m' : v;
}

export function normalizeYahooSymbol(symbol: string): string {
  const clean = String(symbol || '').trim().toUpperCase();
  if (!clean) return clean;
  if (
    clean.includes('.') &&
    !clean.endsWith('.MI') && !clean.endsWith('.L') && !clean.endsWith('.DE') &&
    !clean.endsWith('.AS') && !clean.endsWith('.PA') && !clean.endsWith('.TO') &&
    !clean.endsWith('.WA')
  ) return clean.replace(/\./g, '-');
  return clean;
}

export function timeframeToDays(timeframe: string): number {
  const t = String(timeframe || '').toLowerCase();
  if (t.includes('1 hour')) return 1 / 24;
  if (t.includes('6 hour')) return 0.25;
  if (t.includes('48 hour')) return 2;
  if (t.includes('1 day')) return 1;
  if (t.includes('2 day')) return 2;
  if (t.includes('3 day')) return 3;
  if (t.includes('5 day')) return 5;
  if (t.includes('1 week')) return 7;
  if (t.includes('2 week')) return 14;
  if (t.includes('4 week') || t.includes('1 month')) return 30;
  if (t.includes('6 week')) return 42;
  if (t.includes('3 month')) return 90;
  if (t.includes('6 month')) return 180;
  if (t.includes('1 year')) return 365;
  if (t.includes('2 year')) return 730;
  if (t.includes('5 year')) return 1825;
  return 365;
}

function ensureMarketDataTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_ranges (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'yahoo',
      first_timestamp TEXT,
      last_timestamp TEXT,
      bar_count INTEGER DEFAULT 0,
      requested_from TEXT,
      requested_to TEXT,
      last_sync TEXT,
      quality_status TEXT DEFAULT 'unknown',
      dataset_version INTEGER DEFAULT 1,
      PRIMARY KEY(symbol, interval, provider)
    );
    CREATE TABLE IF NOT EXISTS data_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      provider TEXT NOT NULL,
      requested_from TEXT,
      requested_to TEXT,
      fetched_from TEXT,
      fetched_to TEXT,
      bars_fetched INTEGER DEFAULT 0,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval_datetime
      ON ohlcv(symbol, interval, datetime);
    CREATE INDEX IF NOT EXISTS idx_data_sync_symbol_interval
      ON data_sync_log(symbol, interval, created_at);
  `);
}

function dbDate(date: Date, interval: string): string {
  return canonicalInterval(interval) === '1d'
    ? date.toISOString().slice(0, 10)
    : date.toISOString();
}

function dateFromStored(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampYahooStart(requestedFrom: Date, interval: string, now: Date): Date {
  const limit = INTERVAL_LIMIT_DAYS[canonicalInterval(interval)];
  if (!limit) return requestedFrom;
  const earliestYahoo = new Date(now.getTime() - limit * DAY);
  return requestedFrom < earliestYahoo ? earliestYahoo : requestedFrom;
}

async function fetchYahooSegment(symbol: string, interval: string, from: Date, to: Date): Promise<any[]> {
  if (from >= to) return [];
  const yInterval = yahooInterval(interval);
  const result = await getCachedChart(normalizeYahooSymbol(symbol), {
    period1: from,
    period2: to,
    interval: yInterval as any,
  });
  if (!result?.quotes?.length) return [];

  return result.quotes.filter((q: any) => {
    return q?.date != null &&
      Number.isFinite(q.open) && Number.isFinite(q.high) &&
      Number.isFinite(q.low) && Number.isFinite(q.close);
  });
}

function insertQuotes(symbol: string, interval: string, quotes: any[]): number {
  const db = getDb();
  const normalizedInterval = canonicalInterval(interval);
  const insert = db.prepare(`
    INSERT OR REPLACE INTO ohlcv
      (symbol, interval, datetime, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let count = 0;
  db.transaction(() => {
    for (const q of quotes) {
      const d = q.date instanceof Date ? q.date : new Date(q.date);
      if (Number.isNaN(d.getTime())) continue;
      insert.run(
        symbol,
        normalizedInterval,
        dbDate(d, normalizedInterval),
        Number(q.open), Number(q.high), Number(q.low), Number(q.close),
        Number.isFinite(q.volume) ? Number(q.volume) : 0,
      );
      count++;
    }
  })();
  return count;
}

function getRange(symbol: string, interval: string) {
  const db = getDb();
  return db.prepare(`
    SELECT MIN(datetime) AS minDate, MAX(datetime) AS maxDate, COUNT(*) AS count
    FROM ohlcv WHERE symbol = ? AND interval = ?
  `).get(symbol, canonicalInterval(interval)) as { minDate: string | null; maxDate: string | null; count: number };
}

function refreshDatasetRange(symbol: string, interval: string, requestedFrom: Date, requestedTo: Date, quality: string) {
  const db = getDb();
  const normalizedInterval = canonicalInterval(interval);
  const range = getRange(symbol, normalizedInterval);
  const existing = db.prepare(`SELECT dataset_version, first_timestamp, last_timestamp, bar_count FROM dataset_ranges WHERE symbol=? AND interval=? AND provider='yahoo'`).get(symbol, normalizedInterval) as any;
  const changed = !existing || existing.first_timestamp !== range.minDate || existing.last_timestamp !== range.maxDate || existing.bar_count !== range.count;
  const version = existing ? Number(existing.dataset_version || 1) + (changed ? 1 : 0) : 1;
  db.prepare(`
    INSERT INTO dataset_ranges
      (symbol, interval, provider, first_timestamp, last_timestamp, bar_count,
       requested_from, requested_to, last_sync, quality_status, dataset_version)
    VALUES (?, ?, 'yahoo', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, interval, provider) DO UPDATE SET
      first_timestamp=excluded.first_timestamp,
      last_timestamp=excluded.last_timestamp,
      bar_count=excluded.bar_count,
      requested_from=excluded.requested_from,
      requested_to=excluded.requested_to,
      last_sync=excluded.last_sync,
      quality_status=excluded.quality_status,
      dataset_version=excluded.dataset_version
  `).run(
    symbol, normalizedInterval, range.minDate, range.maxDate, range.count,
    requestedFrom.toISOString(), requestedTo.toISOString(), new Date().toISOString(), quality, version,
  );
  return range;
}

export async function syncSymbolRange(
  symbol: string,
  interval: string,
  requestedFrom: Date,
  requestedTo: Date = new Date(),
): Promise<SyncResult> {
  ensureMarketDataTables();
  const db = getDb();
  const normalizedInterval = canonicalInterval(interval);
  const now = new Date();
  const before = getRange(symbol, normalizedInterval);
  const minStored = dateFromStored(before.minDate);
  const maxStored = dateFromStored(before.maxDate);
  const overlap = (INTERVAL_MS[normalizedInterval] || DAY) * 3;
  let barsFetched = 0;
  let status: SyncResult['status'] = 'cached';
  let message = '';

  try {
    // Fill an older missing head only if Yahoo can still provide it.
    if (!minStored || requestedFrom < minStored) {
      const headTo = minStored ? new Date(minStored.getTime() + overlap) : requestedTo;
      const yahooFrom = clampYahooStart(requestedFrom, normalizedInterval, now);
      if (yahooFrom < headTo) {
        const head = await fetchYahooSegment(symbol, normalizedInterval, yahooFrom, headTo);
        barsFetched += insertQuotes(symbol, normalizedInterval, head);
      }
      if (yahooFrom > requestedFrom) {
        status = 'partial';
        message = `Yahoo ${normalizedInterval} retention does not reach the requested start; preserved local history and fetched the oldest currently available segment.`;
      }
    }

    // Extend the newest edge. Never delete accumulated intraday history.
    const current = getRange(symbol, normalizedInterval);
    const newest = dateFromStored(current.maxDate);
    const tailFromRaw = newest ? new Date(newest.getTime() - overlap) : requestedFrom;
    const tailFrom = clampYahooStart(tailFromRaw < requestedFrom ? requestedFrom : tailFromRaw, normalizedInterval, now);
    if (tailFrom < requestedTo) {
      const tail = await fetchYahooSegment(symbol, normalizedInterval, tailFrom, requestedTo);
      barsFetched += insertQuotes(symbol, normalizedInterval, tail);
    }

    if (barsFetched > 0 && status !== 'partial') status = 'ok';
    const after = refreshDatasetRange(symbol, normalizedInterval, requestedFrom, requestedTo, status === 'partial' ? 'partial' : 'ok');

    db.prepare(`
      INSERT INTO data_sync_log
        (symbol, interval, provider, requested_from, requested_to, fetched_from, fetched_to, bars_fetched, status, message)
      VALUES (?, ?, 'yahoo', ?, ?, ?, ?, ?, ?, ?)
    `).run(symbol, normalizedInterval, requestedFrom.toISOString(), requestedTo.toISOString(), after.minDate, after.maxDate, barsFetched, status, message || null);

    return {
      symbol,
      interval: normalizedInterval,
      requestedFrom: requestedFrom.toISOString(),
      requestedTo: requestedTo.toISOString(),
      availableFrom: after.minDate,
      availableTo: after.maxDate,
      barsStored: after.count,
      barsFetched,
      provider: 'yahoo',
      status,
      message: message || undefined,
    };
  } catch (error: any) {
    const after = refreshDatasetRange(symbol, normalizedInterval, requestedFrom, requestedTo, 'error');
    const msg = error?.message || String(error);
    db.prepare(`
      INSERT INTO data_sync_log
        (symbol, interval, provider, requested_from, requested_to, fetched_from, fetched_to, bars_fetched, status, message)
      VALUES (?, ?, 'yahoo', ?, ?, ?, ?, ?, 'error', ?)
    `).run(symbol, normalizedInterval, requestedFrom.toISOString(), requestedTo.toISOString(), after.minDate, after.maxDate, barsFetched, msg);

    // Existing local data remains usable. Do not replace it with synthetic candles.
    return {
      symbol,
      interval: normalizedInterval,
      requestedFrom: requestedFrom.toISOString(),
      requestedTo: requestedTo.toISOString(),
      availableFrom: after.minDate,
      availableTo: after.maxDate,
      barsStored: after.count,
      barsFetched,
      provider: 'yahoo',
      status: 'error',
      message: msg,
    };
  }
}

export async function syncMarketData(symbols: string[], interval: string, timeframe: string) {
  const days = timeframeToDays(timeframe);
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY);
  const results: SyncResult[] = [];
  for (const symbol of symbols) {
    results.push(await syncSymbolRange(symbol, interval, from, to));
  }
  return results;
}

export async function getHistoricalBars(
  symbol: string,
  interval: string,
  from: Date,
  to: Date = new Date(),
  options: { sync?: boolean; minBars?: number } = { sync: true },
): Promise<StoredBar[]> {
  ensureMarketDataTables();
  const normalizedInterval = canonicalInterval(interval);
  if (options.sync !== false) await syncSymbolRange(symbol, normalizedInterval, from, to);

  const db = getDb();
  const rows = db.prepare(`
    SELECT symbol, interval, datetime, open, high, low, close, COALESCE(volume,0) AS volume
    FROM ohlcv
    WHERE symbol = ? AND interval = ? AND datetime >= ? AND datetime <= ?
    ORDER BY datetime ASC
  `).all(symbol, normalizedInterval, dbDate(from, normalizedInterval), dbDate(to, normalizedInterval)) as StoredBar[];

  if (options.minBars && rows.length < options.minBars) {
    throw new Error(`Insufficient real market data for ${symbol} ${normalizedInterval}: ${rows.length}/${options.minBars} bars`);
  }
  return rows;
}

export function getDatasetManifest(symbol?: string) {
  ensureMarketDataTables();
  const db = getDb();
  const where = symbol ? 'WHERE symbol = ?' : '';
  const ranges = symbol
    ? db.prepare(`SELECT * FROM dataset_ranges ${where} ORDER BY symbol, interval`).all(symbol)
    : db.prepare(`SELECT * FROM dataset_ranges ORDER BY symbol, interval`).all();
  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: 'yahoo',
    ranges,
  };
}

export function exportStoredDataset(symbol?: string) {
  ensureMarketDataTables();
  const db = getDb();
  const rows = symbol
    ? db.prepare(`SELECT symbol, interval, datetime, open, high, low, close, COALESCE(volume,0) AS volume FROM ohlcv WHERE symbol=? ORDER BY interval, datetime`).all(symbol)
    : db.prepare(`SELECT symbol, interval, datetime, open, high, low, close, COALESCE(volume,0) AS volume FROM ohlcv ORDER BY symbol, interval, datetime`).all();
  return { manifest: getDatasetManifest(symbol), bars: rows };
}
