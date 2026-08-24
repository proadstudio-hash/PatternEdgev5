import yahooFinance from 'yahoo-finance2';

async function test() {
  const sym = 'CCO';
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const YFClass = (yahooFinance as any).default || yahooFinance;
  const yf = new YFClass();
  
  try {
    const res = await yf.historical(sym, {
      period1: startDate,
      interval: '1d',
    });
    console.log(sym, "SUCCESS", res.length);
  } catch (e: any) {
    if (e.name === 'InvalidOptionsError') {
      console.log(sym, "InvalidOptionsError result:", e.result);
    } else {
      console.log(sym, "ERROR", e);
    }
  }
}
test();
