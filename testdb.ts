import { getDb } from "./server/db.js";
const db = getDb();
console.log(db.prepare("SELECT COUNT(*) FROM feature_snapshots").get());
console.log(db.prepare("SELECT COUNT(*) as bullish FROM feature_snapshots WHERE pattern_label = 'bullish'").get());
console.log(db.prepare("SELECT COUNT(*) as bearish FROM feature_snapshots WHERE pattern_label = 'bearish'").get());
console.log(db.prepare("SELECT COUNT(*) as null_label FROM feature_snapshots WHERE pattern_label IS NULL").get());
