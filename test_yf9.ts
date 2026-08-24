import YahooFinanceClass from 'yahoo-finance2';
const yahooFinance = new YahooFinanceClass();
async function test() {
  const quote = await yahooFinance.quote('AAPL');
  console.log(quote?.regularMarketPrice);
}
test();
