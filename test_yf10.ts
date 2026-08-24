import YahooFinance from 'yahoo-finance2';
async function test() {
  const quote = await YahooFinance.quote('AAPL');
  console.log(quote);
}
test();
