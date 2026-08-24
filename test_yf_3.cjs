const yf = require('yahoo-finance2').default;
yf.chart('AAPL', { period1: '2023-01-01' }).then(console.log).catch(console.error);
