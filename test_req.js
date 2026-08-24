import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/scanner/train',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', e => console.error(e));
req.write(JSON.stringify({
  symbols: ['AAPL'],
  indicators: ['price action'],
  frequency: '1d',
  timeframe: '5y'
}));
req.end();
