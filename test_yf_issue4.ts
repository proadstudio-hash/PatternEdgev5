import yahooFinance from 'yahoo-finance2';

async function test() {
  const sym = 'CCO';
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const endDate = new Date();
  const YFClass = (yahooFinance as any).default || yahooFinance;
  const yf = new YFClass();
  
  const res = await yf.chart(sym, {
    period1: startDate.toISOString().split('T')[0],
    period2: endDate.toISOString().split('T')[0],
    interval: '1d',
  });
  console.log(typeof res.quotes[0].date, res.quotes[0].date instanceof Date);
}
test();
