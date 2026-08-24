import yf from 'yahoo-finance2';

async function test() {
  try {
    let yfInst: any = yf;
    if (yfInst.default) yfInst = yfInst.default;
    // Trying to instantiate if it is a class/function
    let actualInst;
    try {
        actualInst = new yfInst();
    } catch(e) {}
    if (!actualInst || !actualInst.chart) actualInst = yfInst;

    const res = await actualInst.chart('AAPL', { period1: Math.floor(Date.now()/1000 - 100*86400), interval: '1d' });
    console.log(res.quotes.length);
  } catch (e) {
    console.error(e);
  }
}

test();
