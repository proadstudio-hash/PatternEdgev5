import { getDb } from './server/db.js';
const db = getDb();
try {
  console.log("Testing trained_patterns");
  console.log(db.prepare('SELECT * FROM trained_patterns').all());
} catch(e) { console.error("Error 1", e); }
try {
  console.log("Testing settings");
  console.log(db.prepare('SELECT * FROM settings').all());
} catch(e) { console.error("Error 2", e); }
