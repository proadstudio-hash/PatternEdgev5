
import yahooFinance from 'yahoo-finance2';

const YahooFinance = (yahooFinance as any).default || yahooFinance;
const actualInst = new YahooFinance();

async function testFetch() {
  try {
    const sym = 'AAPL';
    const interval = '1d';
    const period1 = Math.floor((Date.now() - 5 * 24 * 60 * 60 * 1000) / 1000);
    const result = await actualInst.chart(sym, { period1, interval });
    console.log('Success:', result.quotes?.length);
  } catch (e) {
    console.error('Failed:', e);
  }
}

testFetch();
