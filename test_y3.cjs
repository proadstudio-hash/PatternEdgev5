const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();
yf.chart('AAPL', { period1: '2023-01-01', interval: '1mo' }).then(r => console.log(r.quotes.length)).catch(console.error);
