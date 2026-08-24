import { syncRealData } from './server/engine/dataSync.js';
import { calculateFeatures } from './server/engine/indicators.js';
import { getDb } from './server/db.js';

async function test() {
  console.log("Sync...");
  await syncRealData(['AAPL']);
  const db = getDb();
  const bars = db.prepare('SELECT * FROM ohlcv WHERE symbol = "AAPL" ORDER BY datetime ASC').all();
  console.log("Bars:", bars.length);
  if (bars.length > 0) {
    console.log(bars[0]);
  }
}
test().catch(console.error);
