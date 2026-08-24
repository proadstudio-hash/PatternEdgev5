import { runAdvancedLorisTeaching, DEFAULT_LORIS_SETTINGS } from "./server/engine/advancedGrowthLoris.js";
import { systemStatus } from "./server/engine/status.js";

const symbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ'];
console.log("Starting test run of Loris training with " + symbols.length + " symbols...");
runAdvancedLorisTeaching(symbols, DEFAULT_LORIS_SETTINGS)
  .then(() => {
    console.log("Completed without rejection!");
    console.log("System status:", JSON.stringify(systemStatus, null, 2));
  })
  .catch(err => {
    console.error("Test got rejected:", err);
  });

setInterval(() => {
  console.log("Current progress:", systemStatus.progress, "stage:", systemStatus.stage, "isProcessing:", systemStatus.isProcessing);
  if (!systemStatus.isProcessing) {
     console.log("Process complete - exiting");
     process.exit(0);
  }
}, 5000);
