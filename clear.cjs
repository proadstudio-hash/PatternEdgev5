const db = require('better-sqlite3')('patternedge.db');
db.prepare("DELETE FROM trained_patterns").run();
console.log("Deleted");
