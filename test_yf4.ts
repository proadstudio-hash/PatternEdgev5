import yahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const yf = yahooFinance as any;
    const yfInst = yf.default ? yf.default : yf;
    const res = await yfInst.chart('AAPL', { period1: Math.floor(Date.now()/1000 - 100*86400), interval: '1d' });
    console.log(res.quotes.length);
  } catch (e) {
    console.error(e);
  }
}

test();
