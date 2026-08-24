import { runFullWorkflow } from './server/engine/scanner.js';
import { systemStatus } from './server/engine/status.js';

async function test() {
  await runFullWorkflow(['AAPL']);
  console.log("Status after:", systemStatus);
}
test().catch(console.error);
