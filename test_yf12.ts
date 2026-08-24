import yahooFinanceDefault from 'yahoo-finance2';
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
async function test() {
  const quote = await yahooFinance.quote('AAPL');
  console.log(quote);
}
test();
