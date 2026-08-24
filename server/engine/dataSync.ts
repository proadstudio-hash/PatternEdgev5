import yahooFinanceDefault from 'yahoo-finance2';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
import { getDb } from '../db.js';
import { systemStatus } from './status.js';
import fs from 'fs';

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
    for (const s of allSymbols) {
      insertSymbol.run(s.sym, s.name, s.sector);
    }
  })();
}

export async function syncRealData(symbolsToSync?: string[], interval: string = '1d', timeframe: string = 'Last 5 Years') {
  const db = getDb();
  
  let targets = symbolsToSync;
  if (!targets) {
     const activeRows = db.prepare('SELECT symbol FROM symbols WHERE active = 1').all() as {symbol: string}[];
     targets = activeRows.map(r => r.symbol);
  }

  const deleteOhlcv = db.prepare('DELETE FROM ohlcv WHERE symbol = ? AND interval = ?');
  const insertOhlcv = db.prepare('INSERT OR REPLACE INTO ohlcv (symbol, interval, datetime, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  for (let i = 0; i < targets.length; i++) {
    const sym = targets[i];
    systemStatus.details = `Fetching ${sym} (${interval})...`;
    systemStatus.progress = Math.round((i / targets.length) * 100);

    try {
      db.transaction(() => {
         deleteOhlcv.run(sym, interval);
      })();
      // Base translation of timeframe to days
      let daysConfigured = 1825; // 5 years
      if (timeframe.includes('1 Day')) daysConfigured = 1;
      else if (timeframe.includes('2 Days')) daysConfigured = 2;
      else if (timeframe.includes('3 Days')) daysConfigured = 3;
      else if (timeframe.includes('5 Days')) daysConfigured = 5;
      else if (timeframe.includes('1 Week')) daysConfigured = 7;
      else if (timeframe.includes('2 Weeks')) daysConfigured = 14;
      else if (timeframe.includes('4 Weeks')) daysConfigured = 28;
      else if (timeframe.includes('6 Weeks')) daysConfigured = 42;
      else if (timeframe.includes('3 Months')) daysConfigured = 90;
      else if (timeframe.includes('6 Months')) daysConfigured = 180;
      else if (timeframe.includes('1 Year')) daysConfigured = 365;
      else if (timeframe.includes('2 Years')) daysConfigured = 730;
      else if (timeframe.includes('5 Years')) daysConfigured = 1825;

      let days = daysConfigured; 
      if (interval === '1d' && days < 250) days = 250;
      if (interval === '1h' && days < 40) days = 40;
      if (interval === '15m' && days < 10) days = 10;
      if (interval === '1m' && days < 2) days = 2;

      if (interval === '1h') days = Math.min(days, 720); // max ~2 years for 1h
      if (interval === '15m') days = Math.min(days, 59); // max ~60 days for 15m
      if (interval === '1m') days = Math.min(days, 6); // max 7 days for 1m

      const period1 = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
      let querySym = sym;
      if (sym.includes('.') && !sym.endsWith('.MI') && !sym.endsWith('.L') && !sym.endsWith('.DE') && !sym.endsWith('.AS') && !sym.endsWith('.PA') && !sym.endsWith('.TO') && !sym.endsWith('.WA')) {
          querySym = sym.replace(/\./g, '-');
      }
      const actualInst = yahooFinance;
      const result = await actualInst.chart(querySym, { period1, interval: interval as any }) as any;
      
      console.log(`Synced ${result.quotes?.length || 0} bars for ${sym} at ${interval}`);

      if (result && result.quotes && result.quotes.length > 0) {
        db.transaction(() => {
          for (const row of result.quotes) {
            if (!row.date || row.close === undefined || row.close === null) continue;
            
            // Format datetime: YYYY-MM-DD for daily, full ISO for intraday
            let dateStr = "";
            if (interval === '1d') {
                dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : new Date(row.date).toISOString().split('T')[0];
            } else {
                dateStr = row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString();
            }
            
            const vol = row.volume || 0;
            insertOhlcv.run(sym, interval, dateStr, row.open, row.high, row.low, row.close, vol);
          }
        })();
      }
    } catch (e: any) {
      console.error(`Failed to fetch ${sym}:`, e);
      try {
        fs.appendFileSync('sync_errors.log', `${new Date().toISOString()} ${sym}: ${e.message}\n`);
      } catch(err) {}
    }
  }
}
