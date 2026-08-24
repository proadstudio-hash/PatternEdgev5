import { getDb } from '../db.js';
import { systemStatus } from './status.js';
import { canonicalInterval, syncMarketData } from './marketDataService.js';

const allSymbols = [
  { sym: 'EURUSD=X', name: 'EUR/USD', sector: 'Forex' },
  { sym: 'GBPUSD=X', name: 'GBP/USD', sector: 'Forex' },
  { sym: 'JPY=X', name: 'USD/JPY', sector: 'Forex' },
  { sym: 'AUDUSD=X', name: 'AUD/USD', sector: 'Forex' },
  { sym: 'CAD=X', name: 'USD/CAD', sector: 'Forex' },
  { sym: 'AAPL', name: 'Apple Inc', sector: 'Technology' },
  { sym: 'MSFT', name: 'Microsoft Corp', sector: 'Technology' },
  { sym: 'NVDA', name: 'NVIDIA Corp', sector: 'Technology' },
  { sym: 'TSLA', name: 'Tesla Inc', sector: 'Technology' },
  { sym: 'AMZN', name: 'Amazon', sector: 'Consumer' },
  { sym: 'GOOGL', name: 'Alphabet', sector: 'Technology' },
  { sym: 'META', name: 'Meta Platforms', sector: 'Technology' },
  { sym: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'Index' },
  { sym: 'QQQ', name: 'Invesco QQQ Trust', sector: 'Index' },
  { sym: 'ENEL.MI', name: 'Enel S.p.A.', sector: 'Energy' },
  { sym: 'ENI.MI', name: 'Eni S.p.A.', sector: 'Energy' },
  { sym: 'ISP.MI', name: 'Intesa Sanpaolo', sector: 'Financial' },
  { sym: 'UCG.MI', name: 'UniCredit', sector: 'Financial' },
  { sym: 'RACE.MI', name: 'Ferrari N.V.', sector: 'Consumer' },
  { sym: 'STLAM.MI', name: 'Stellantis', sector: 'Consumer' },
  { sym: 'TIT.MI', name: 'Telecom Italia', sector: 'Telecom' },
  { sym: 'G.MI', name: 'Generali', sector: 'Financial' }
];

export function populateSymbols() {
  const db = getDb();
  const insertSymbol = db.prepare('INSERT OR IGNORE INTO symbols (symbol, name, sector, active) VALUES (?, ?, ?, 0)');
  db.transaction(() => {
    for (const s of allSymbols) insertSymbol.run(s.sym, s.name, s.sector);
  })();
}

/**
 * Incrementally extends the local OHLCV archive.
 * Existing history is NEVER deleted. Yahoo is only queried for missing/overlap/new bars.
 */
export async function syncRealData(
  symbolsToSync?: string[],
  interval: string = '1d',
  timeframe: string = 'Last 5 Years',
) {
  const db = getDb();
  let targets = symbolsToSync;
  if (!targets) {
    const activeRows = db.prepare('SELECT symbol FROM symbols WHERE active = 1').all() as { symbol: string }[];
    targets = activeRows.map(r => r.symbol);
  }

  const normalizedInterval = canonicalInterval(interval);
  if (!targets.length) return [];

  systemStatus.stage = `Syncing reliable Yahoo data (${normalizedInterval})`;
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const symbol = targets[i];
    systemStatus.details = `Extending local dataset for ${symbol} (${normalizedInterval})...`;
    systemStatus.progress = Math.round((i / targets.length) * 100);
    const [result] = await syncMarketData([symbol], normalizedInterval, timeframe);
    results.push(result);
    if (result.status === 'error') {
      console.error(`[DataSync] ${symbol} ${normalizedInterval}: ${result.message || 'Yahoo sync failed; retained local data.'}`);
    } else {
      console.log(`[DataSync] ${symbol} ${normalizedInterval}: fetched ${result.barsFetched}, stored ${result.barsStored}, status=${result.status}`);
    }
  }
  systemStatus.progress = 100;
  return results;
}
