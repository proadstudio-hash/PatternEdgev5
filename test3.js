const yahooFinance = require('yahoo-finance2').default;
yahooFinance.quote('AAPL').then(r => console.log(r)).catch(console.error);
