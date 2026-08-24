import Database from 'better-sqlite3';
const db = new Database('patternedge.db');
const patterns = db.prepare('SELECT * FROM trained_patterns').all();
console.log(patterns);
