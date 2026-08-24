const YF = require('yahoo-finance2').default;
const yf = new YF();
yf.chart('AAPL', { period1: '2023-01-01' }).then((res) => console.log(res ? 'success' : 'fail')).catch(console.error);
