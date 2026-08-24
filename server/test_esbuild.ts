import yahooFinanceDefault from 'yahoo-finance2';
console.log("yahooFinanceDefault --> ", Object.keys(yahooFinanceDefault));
const YFClass = (yahooFinanceDefault as any).default || yahooFinanceDefault;
const yahooFinance = typeof YFClass === 'function' ? new YFClass() : yahooFinanceDefault;
console.log("yahooFinance --> ", Object.keys(yahooFinance), typeof yahooFinance);
