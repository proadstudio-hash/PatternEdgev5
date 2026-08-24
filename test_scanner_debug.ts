import { runFullWorkflow } from './server/engine/scanner.js';
import { systemStatus } from './server/engine/status.js';

(async () => {
    console.log("Starting debug run");
    await runFullWorkflow(['NVDA'], { timeframe: '5 Years', frequency: '1 Day', indicators: ['sma200', 'adx', 'rsi14', 'macd'] });
    console.log("Status:", JSON.stringify(systemStatus, null, 2));
    console.log("Done");
})();
