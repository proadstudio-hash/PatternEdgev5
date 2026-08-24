import { Candle } from '../../src/types/forexLiquidity';
import { getCachedQuote } from './yfCache.js';
import { canonicalInterval, getHistoricalBars, normalizeYahooSymbol } from './marketDataService.js';

export interface MarketDataProvider {
  getSymbols(assetClass: string): Promise<string[]>;
  getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]>;
  getLatestPrice(symbol: string): Promise<{ bid: number; ask: number; mid: number; spread: number; time: Date }>;
  getSpread(symbol: string): Promise<number>;
  getMarketStatus(symbol: string): Promise<{ status: string; session: string }>;
}

export function mapToYahooFinanceSymbol(symbol: string): string {
  let sym = symbol.toUpperCase().replace(/\s+/g, '');
  const compact = sym.replace('/', '').replace('_', '').replace('-', '');
  const fxPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'AUDJPY', 'NZDJPY', 'CADJPY'];
  if (fxPairs.includes(compact)) return `${compact}=X`;
  if (compact === 'SPX' || compact === 'SPX500') return '^GSPC';
  if (compact === 'NDX' || compact === 'NAS100') return '^NDX';
  if (compact === 'DJI' || compact === 'US30') return '^DJI';
  if (compact === 'GER30' || compact === 'DAX') return '^GDAXI';
  if (compact === 'UK100') return '^FTSE';
  if (compact === 'JPN225' || compact === 'NIKKEI') return '^N225';
  const cryptos = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT'];
  if (compact.endsWith('USD')) {
    const prefix = compact.replace('USD', '');
    if (cryptos.includes(prefix)) return `${prefix}-USD`;
  }
  if (cryptos.includes(compact)) return `${compact}-USD`;
  return symbol;
}

function timeframeToInterval(timeframe: string): string {
  const tf = String(timeframe || '').toUpperCase();
  if (tf === 'M1' || tf === '1M') return '1m';
  if (tf === 'M5' || tf === '5M') return '5m';
  if (tf === 'M15' || tf === '15M') return '15m';
  if (tf === 'H1' || tf === '1H' || tf === '60M') return '1h';
  return '1d';
}

/**
 * Production Yahoo provider. It is intentionally strict: no synthetic fallback is
 * allowed when real data is unavailable. This protects training/backtests/live scans
 * from being silently contaminated by mock candles or prices.
 */
export class YahooFinanceProvider implements MarketDataProvider {
  async getSymbols(assetClass: string): Promise<string[]> {
    switch (assetClass.toUpperCase()) {
      case 'FOREX_MAJORS': return ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'];
      case 'FOREX_MINORS': return ['EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'EUR/CHF', 'AUD/JPY', 'NZD/JPY', 'CAD/JPY'];
      case 'INDICES': return ['SPX', 'NDX', 'GER30', 'UK100', 'JPN225'];
      case 'STOCKS': return ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'];
      case 'CRYPTO': return ['BTC-USD', 'ETH-USD', 'SOL-USD', 'DOGE-USD'];
      default: return [];
    }
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    const yfSymbol = mapToYahooFinanceSymbol(symbol);
    const interval = canonicalInterval(timeframeToInterval(timeframe));
    const bars = await getHistoricalBars(yfSymbol, interval, from, to, { sync: true });
    if (!bars.length) {
      throw new Error(`DATA_UNAVAILABLE: no real Yahoo/local bars for ${symbol} ${interval}`);
    }
    return bars.map(b => ({
      time: b.datetime.length === 10 ? new Date(`${b.datetime}T00:00:00.000Z`).toISOString() : new Date(b.datetime).toISOString(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume || 0,
    }));
  }

  async getLatestPrice(symbol: string): Promise<{ bid: number; ask: number; mid: number; spread: number; time: Date }> {
    const yfSymbol = normalizeYahooSymbol(mapToYahooFinanceSymbol(symbol));
    const quote = await getCachedQuote(yfSymbol);
    if (!quote || !Number.isFinite(quote.regularMarketPrice ?? quote.price)) {
      throw new Error(`DATA_UNAVAILABLE: no real quote for ${symbol}`);
    }
    const mid = Number(quote.regularMarketPrice ?? quote.price);
    const bid = Number.isFinite(quote.bid) && quote.bid > 0 ? Number(quote.bid) : mid;
    const ask = Number.isFinite(quote.ask) && quote.ask > 0 ? Number(quote.ask) : mid;
    const spread = Math.max(0, ask - bid);
    return { bid, ask, mid, spread, time: new Date(quote.regularMarketTime || Date.now()) };
  }

  async getSpread(symbol: string): Promise<number> {
    return (await this.getLatestPrice(symbol)).spread;
  }

  async getMarketStatus(symbol: string): Promise<{ status: string; session: string }> {
    const yfSymbol = normalizeYahooSymbol(mapToYahooFinanceSymbol(symbol));
    const quote = await getCachedQuote(yfSymbol);
    if (!quote) throw new Error(`DATA_UNAVAILABLE: market status unavailable for ${symbol}`);
    return {
      status: quote.marketState || 'UNKNOWN',
      session: quote.exchange || quote.fullExchangeName || 'UNKNOWN',
    };
  }
}

/**
 * Explicit DEMO provider only. It must be selected deliberately and is never used as
 * a fallback by YahooFinanceProvider.
 */
export class MockProvider implements MarketDataProvider {
  async getSymbols(assetClass: string): Promise<string[]> {
    return new YahooFinanceProvider().getSymbols(assetClass);
  }

  async getCandles(symbol: string, timeframe: string, from: Date, to: Date): Promise<Candle[]> {
    const candles: Candle[] = [];
    let price = symbol.toUpperCase().includes('JPY') ? 158.50 : symbol.toUpperCase().includes('BTC') ? 65000 : symbol.toUpperCase().includes('AAPL') ? 185 : 1.0820;
    const interval = timeframeToInterval(timeframe);
    const barMs = interval === '1m' ? 60_000 : interval === '5m' ? 300_000 : interval === '15m' ? 900_000 : interval === '1h' ? 3_600_000 : 86_400_000;
    const totalBars = Math.max(2, Math.min(5000, Math.floor((to.getTime() - from.getTime()) / barMs)));
    for (let i = 0; i < totalBars; i++) {
      const open = price;
      const close = price * (1 + (Math.random() - 0.5) * 0.001);
      candles.push({
        time: new Date(from.getTime() + i * barMs).toISOString(),
        open,
        high: Math.max(open, close) * (1 + Math.random() * 0.0005),
        low: Math.min(open, close) * (1 - Math.random() * 0.0005),
        close,
        volume: 1000 + Math.floor(Math.random() * 5000),
      });
      price = close;
    }
    return candles;
  }

  async getLatestPrice(symbol: string) {
    const mid = symbol.toUpperCase().includes('JPY') ? 158.45 : symbol.toUpperCase().includes('BTC') ? 65420 : 1.0828;
    return { bid: mid, ask: mid, mid, spread: 0, time: new Date() };
  }
  async getSpread() { return 0; }
  async getMarketStatus() { return { status: 'DEMO', session: 'DEMO' }; }
}

export class TwelveDataProvider extends YahooFinanceProvider {
  apiKey: string;
  constructor(apiKey = process.env.TWELVE_DATA_API_KEY || '') { super(); this.apiKey = apiKey; }
}

export class PolygonProvider extends YahooFinanceProvider {
  apiKey: string;
  constructor(apiKey = process.env.POLYGON_API_KEY || '') { super(); this.apiKey = apiKey; }
}

export class OandaProvider extends YahooFinanceProvider {
  apiKey: string;
  accountId: string;
  constructor(apiKey = process.env.OANDA_API_KEY || '', accountId = process.env.OANDA_ACCOUNT_ID || '') {
    super(); this.apiKey = apiKey; this.accountId = accountId;
  }
}
