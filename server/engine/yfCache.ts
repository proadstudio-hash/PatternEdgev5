import yahooFinanceDefault from 'yahoo-finance2';

const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const googleYahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;

// 3 minutes TTL for quotes, 5 minutes for charts
const QUOTE_TTL = 3 * 60 * 1000;
const CHART_TTL = 5 * 60 * 1000;

interface CachedQuote {
  data: any;
  timestamp: number;
}

interface CachedChart {
  data: any;
  timestamp: number;
}

const quoteCache = new Map<string, CachedQuote>();
const chartCache = new Map<string, CachedChart>();

// In-flight request de-duplication
const activeQuoteRequests = new Map<string, Promise<any>>();
const activeChartRequests = new Map<string, Promise<any>>();

export async function getCachedQuote(symbol: string): Promise<any> {
  const cleanSym = symbol.trim().toUpperCase();
  const now = Date.now();

  // 1. Check cache
  const cached = quoteCache.get(cleanSym);
  if (cached && (now - cached.timestamp < QUOTE_TTL)) {
    return cached.data;
  }

  // 2. Check in-flight requests to deduplicate
  const existingPromise = activeQuoteRequests.get(cleanSym);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Initiate actual request
  const fetchPromise = (async () => {
    try {
      let querySym = cleanSym;
      if (cleanSym.includes('.') && 
          !cleanSym.endsWith('.MI') && 
          !cleanSym.endsWith('.L') && 
          !cleanSym.endsWith('.DE') && 
          !cleanSym.endsWith('.AS') && 
          !cleanSym.endsWith('.PA') && 
          !cleanSym.endsWith('.TO') && 
          !cleanSym.endsWith('.WA')) {
        querySym = cleanSym.replace(/\./g, '-');
      }

      const data = await googleYahooFinance.quote(querySym);
      if (data) {
        quoteCache.set(cleanSym, { data, timestamp: Date.now() });
      }
      return data;
    } catch (err: any) {
      console.log(`[YF Cache] Quote backup loaded for ${cleanSym}`);
      // If we have a stale cache value, return it rather than crashing
      if (cached) {
        console.info(`[YF Cache] Returning stale cache fallback for ${cleanSym}`);
        return cached.data;
      }
      return null;
    } finally {
      activeQuoteRequests.delete(cleanSym);
    }
  })();

  activeQuoteRequests.set(cleanSym, fetchPromise);
  return fetchPromise;
}

export async function getCachedChart(symbol: string, options: any): Promise<any> {
  const cleanSym = symbol.trim().toUpperCase();
  const optionsKey = JSON.stringify(options);
  const cacheKey = `${cleanSym}_${optionsKey}`;
  const now = Date.now();

  // 1. Check cache
  const cached = chartCache.get(cacheKey);
  if (cached && (now - cached.timestamp < CHART_TTL)) {
    return cached.data;
  }

  // 2. Check in-flight requests to deduplicate
  const existingPromise = activeChartRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Request
  const fetchPromise = (async () => {
    try {
      let querySym = cleanSym;
      if (cleanSym.includes('.') && 
          !cleanSym.endsWith('.MI') && 
          !cleanSym.endsWith('.L') && 
          !cleanSym.endsWith('.DE') && 
          !cleanSym.endsWith('.AS') && 
          !cleanSym.endsWith('.PA') && 
          !cleanSym.endsWith('.TO') && 
          !cleanSym.endsWith('.WA')) {
        querySym = cleanSym.replace(/\./g, '-');
      }

      const data = await googleYahooFinance.chart(querySym, options);
      if (data) {
        chartCache.set(cacheKey, { data, timestamp: Date.now() });
      }
      return data;
    } catch (err: any) {
      console.log(`[YF Cache] Chart backup loaded for ${cleanSym}`);
      if (cached) {
        console.info(`[YF Cache] Returning stale chart fallback for ${cleanSym}`);
        return cached.data;
      }
      return null;
    } finally {
      activeChartRequests.delete(cacheKey);
    }
  })();

  activeChartRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}
