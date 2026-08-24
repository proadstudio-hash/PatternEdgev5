const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/scanner/run',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  res.on('data', d => process.stdout.write(d));
});
req.write(JSON.stringify({ symbols: ['AAPL'] }));
req.end();
