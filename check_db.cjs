const Database = require('better-sqlite3');
const db = new Database('patternedge.db');
console.log('scanner_results_count', db.prepare('SELECT COUNT(*) FROM scanner_results').get());
console.log('ohlcv_count', db.prepare('SELECT COUNT(*) FROM ohlcv').get());
console.log('symbols_count', db.prepare('SELECT COUNT(*) FROM symbols').get());
