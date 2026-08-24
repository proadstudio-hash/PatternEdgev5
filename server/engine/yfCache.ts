import yahooFinanceDefault from 'yahoo-finance2';

const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;

const QUOTE_TTL = 60 * 1000;
const CHART_TTL = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const MIN_REQUEST_SPACING_MS = 150;

interface CachedValue { data: any; timestamp: number; }
const quoteCache = new Map<string, CachedValue>();
const chartCache = new Map<string, CachedValue>();
const activeQuoteRequests = new Map<string, Promise<any>>();
const activeChartRequests = new Map<string, Promise<any>>();

let requestChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = requestChain;
  requestChain = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const wait = Math.max(0, MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestAt));
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    return await fn();
  } finally {
    release();
  }
}

function retryable(error: any): boolean {
  const status = Number(error?.statusCode || error?.status || 0);
  const msg = String(error?.message || '').toLowerCase();
  return status === 429 || status >= 500 || msg.includes('too many') || msg.includes('socket') || msg.includes('timeout') || msg.includes('fetch failed');
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await throttled(fn);
    } catch (error: any) {
      lastError = error;
      if (!retryable(error) || attempt === MAX_RETRIES - 1) break;
      const delay = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await sleep(delay);
    }
  }
  throw lastError;
}

function normalizeSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase();
  if (
    clean.includes('.') && !clean.endsWith('.MI') && !clean.endsWith('.L') &&
    !clean.endsWith('.DE') && !clean.endsWith('.AS') && !clean.endsWith('.PA') &&
    !clean.endsWith('.TO') && !clean.endsWith('.WA')
  ) return clean.replace(/\./g, '-');
  return clean;
}

function stableOptions(options: any): string {
  const normalized: any = {};
  for (const key of Object.keys(options || {}).sort()) {
    const value = options[key];
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return JSON.stringify(normalized);
}

export async function getCachedQuote(symbol: string): Promise<any> {
  const cleanSym = symbol.trim().toUpperCase();
  const cached = quoteCache.get(cleanSym);
  if (cached && Date.now() - cached.timestamp < QUOTE_TTL) return cached.data;
  const inFlight = activeQuoteRequests.get(cleanSym);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const data = await withRetry(() => yahooFinance.quote(normalizeSymbol(cleanSym)));
      if (!data) throw new Error(`Yahoo returned empty quote for ${cleanSym}`);
      quoteCache.set(cleanSym, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      if (cached) {
        console.warn(`[Yahoo] quote request failed for ${cleanSym}; returning stale cached real quote.`);
        return cached.data;
      }
      throw error;
    } finally {
      activeQuoteRequests.delete(cleanSym);
    }
  })();

  activeQuoteRequests.set(cleanSym, promise);
  return promise;
}

export async function getCachedChart(symbol: string, options: any): Promise<any> {
  const cleanSym = symbol.trim().toUpperCase();
  const cacheKey = `${cleanSym}_${stableOptions(options)}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CHART_TTL) return cached.data;
  const inFlight = activeChartRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const data = await withRetry(() => yahooFinance.chart(normalizeSymbol(cleanSym), options));
      if (!data?.quotes) throw new Error(`Yahoo returned invalid chart payload for ${cleanSym}`);
      chartCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      if (cached) {
        console.warn(`[Yahoo] chart request failed for ${cleanSym}; returning stale cached real chart.`);
        return cached.data;
      }
      throw error;
    } finally {
      activeChartRequests.delete(cacheKey);
    }
  })();

  activeChartRequests.set(cacheKey, promise);
  return promise;
}

export function clearYahooMemoryCache() {
  quoteCache.clear();
  chartCache.clear();
}
