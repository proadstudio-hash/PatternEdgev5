const yahooFinance = require('yahoo-finance2').default;
console.log("module", typeof yahooFinance);
try {
  yahooFinance.chart('AAPL', { period1: '2023-01-01', interval: '1mo' }).then(console.log).catch(console.error);
} catch (e) { console.error("sync error:", e) }
