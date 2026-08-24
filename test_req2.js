fetch('http://localhost:3000/api/scanner/train', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbols: ['AAPL'], indicators: ['MACD'], frequency: '1d', timeframe: '5y' })
}).then(r => r.json()).then(d => console.log('DATA:', d)).catch(e => console.error('ERR:', e));
