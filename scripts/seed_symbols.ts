import Database from 'better-sqlite3';
import { ALL_SYMBOLS } from '../src/constants.js';

const db = new Database('patternedge.db', { verbose: console.log });

const insert = db.prepare('INSERT OR IGNORE INTO symbols (symbol, name, sector) VALUES (?, ?, ?)');
const update = db.prepare('UPDATE symbols SET name = ?, sector = ? WHERE symbol = ?');

console.log(`Updating ${ALL_SYMBOLS.length} symbols...`);

for (const sym of ALL_SYMBOLS) {
    try {
        const result = insert.run(sym.symbol, sym.name, sym.sector);
        if (result.changes === 0) {
            update.run(sym.name, sym.sector, sym.symbol);
        }
    } catch (e) {
        console.error(`Error updating ${sym.symbol}:`, e);
    }
}

console.log("Database updated.");
