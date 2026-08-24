const db = require('better-sqlite3')('patternedge.db');
const rows = db.prepare("SELECT DISTINCT setup_name, training_timeframe FROM trained_patterns").all();
console.log(rows);
