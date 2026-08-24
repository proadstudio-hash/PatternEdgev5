import yf from 'yahoo-finance2';
async function test() {
  try {
    const yahooFinance = new yf();
    const quote = await yahooFinance.quote('AAPL');
    console.log(quote?.regularMarketPrice);
  } catch (e) {
    console.error(e);
  }
}
test();
