import { getDb } from '../db.js';
import { OHLCV } from '../models.js';

export function generateMockDataIfNeeded() {
  const db = getDb();
  
  const countObj = db.prepare('SELECT COUNT(*) as count FROM symbols').get() as { count: number };
  if (countObj.count > 0) {
    return; // Already populated
  }

  console.log("Generating Mock Data for MVP...");
  const symbols = ['AAPL', 'MSFT', 'NVDA', 'SPY', 'QQQ'];
  
  const insertSymbol = db.prepare('INSERT INTO symbols (symbol, name, sector) VALUES (?, ?, ?)');
  const insertOhlcv = db.prepare('INSERT INTO ohlcv (symbol, interval, datetime, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  
  db.transaction(() => {
    for (const sym of symbols) {
      insertSymbol.run(sym, sym + ' Inc', 'Technology');
      
      let currentPrice = sym === 'SPY' || sym === 'QQQ' ? 400 : 150;
      const today = new Date();
      
      for (let i = 250; i >= 0; i--) {
        const date = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000));
        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        
        const drift = 0.0005; // Base drift
        const vol = 0.02; // Base volatility
        const return_pct = drift + (Math.random() - 0.5) * vol;
        
        const open = currentPrice;
        const close = currentPrice * (1 + return_pct);
        const high = Math.max(open, close) * (1 + Math.random() * 0.01);
        const low = Math.min(open, close) * (1 - Math.random() * 0.01);
        const volume = Math.floor(Math.random() * 10000000) + 1000000;
        
        insertOhlcv.run(
          sym,
          '1d',
          date.toISOString().split('T')[0], 
          open, 
          high, 
          low, 
          close, 
          volume
        );
        
        currentPrice = close;
      }
    }
  })();
  
  console.log("Mock data generated.");
}
