const http = require('http');

['/api/symbols', '/api/trained-patterns', '/api/scanner/status', '/api/scanner/results'].forEach(path => {
  http.get(`http://localhost:3000${path}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\n--- ${path} ---`);
      console.log(`Status: ${res.statusCode}`);
      console.log(data.substring(0, 100)); // print first 100 chars
    });
  });
});
