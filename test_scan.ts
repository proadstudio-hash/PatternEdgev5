import { runFullWorkflow } from './server/engine/scanner.js';
import { initializeDatabase, getDb } from './server/db.js';

async function run() {
  initializeDatabase();
  const db = getDb();
  console.log("Starting workflow...");
  await runFullWorkflow(['AAPL', 'MSFT', 'NVDA'], { indicators: ['MACD'], isShortTerm: false });
  console.log("Done.");
  console.log(db.prepare('SELECT * FROM trained_patterns').all());
}
run().catch(console.error);
