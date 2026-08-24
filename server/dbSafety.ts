import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';

export function applyDatabaseSafety() {
  const db = getDb();
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
}

/** Creates a timestamped SQLite backup before operations that may materially alter datasets. */
export function backupDatabase(reason: string = 'manual') {
  const source = path.resolve('patternedge.db');
  if (!fs.existsSync(source)) return null;
  const dir = path.resolve('backups');
  fs.mkdirSync(dir, { recursive: true });
  const safeReason = reason.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  const target = path.join(dir, `patternedge_${new Date().toISOString().replace(/[:.]/g, '-')}_${safeReason}.db`);
  fs.copyFileSync(source, target);
  return target;
}
