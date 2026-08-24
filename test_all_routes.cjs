const http = require('http');

['/api/trained-patterns'].forEach(path => {
  http.get(`http://localhost:3000${path}`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\n--- ${path} ---`);
      console.log(`Status: ${res.statusCode}`);
      console.log(data.substring(0, 500)); // print first 100 chars
    });
  });
});
