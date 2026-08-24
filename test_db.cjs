const db = require('better-sqlite3')('patternedge.db');
console.log("OHLCV count:", db.prepare('SELECT COUNT(*) as c FROM ohlcv').get());
console.log("Scanner results count:", db.prepare('SELECT COUNT(*) as c FROM scanner_results').get());
