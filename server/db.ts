import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: any;
function openDb() {
  try {
    return new Database('patternedge.db');
  } catch (e: any) {
    if (e.code === 'SQLITE_CORRUPT') {
      const source = path.resolve('patternedge.db');
      const quarantineDir = path.resolve('backups');
      fs.mkdirSync(quarantineDir, { recursive: true });
      const quarantined = path.join(quarantineDir, `patternedge_corrupt_${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      console.error(`Database corruption detected. Preserving the damaged file at ${quarantined} before creating a new database.`);
      if (fs.existsSync(source)) fs.renameSync(source, quarantined);
      return new Database('patternedge.db');
    }
    throw e;
  }
}

db = openDb();

import { ALL_SYMBOLS } from '../src/constants';

export function initializeDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      sector TEXT,
      active INTEGER DEFAULT 1
    );`,
    `CREATE TABLE IF NOT EXISTS ohlcv (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT DEFAULT '1d',
      datetime TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      UNIQUE(symbol, interval, datetime)
    );`,
    `CREATE TABLE IF NOT EXISTS trained_patterns (
      symbol TEXT,
      setup_name TEXT,
      training_timeframe TEXT,
      patternsFound INTEGER,
      winRate REAL,
      avgExpectancy REAL,
      avgBullMove REAL,
      avgBearMove REAL,
      sampleSize INTEGER,
      teachingQuality REAL,
      modelFittingPerformance REAL,
      PRIMARY KEY (symbol, setup_name, training_timeframe)
    );`,
    `CREATE TABLE IF NOT EXISTS scanner_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      setup_name TEXT,
      generic_score REAL,
      specific_score REAL,
      generic_confidence REAL,
      specific_confidence REAL,
      classification TEXT,
      probability REAL,
      expectancy REAL,
      risk_reward REAL,
      entry_price REAL,
      stop_price REAL,
      target_1 REAL,
      target_2 REAL,
      holding_period TEXT,
      sample_size INTEGER,
      explanation TEXT,
      failure_reasons TEXT,
      UNIQUE(date, symbol, setup_name)
    );`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS ensemble_ohlcv (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      provider TEXT NOT NULL,
      interval TEXT NOT NULL,
      timestamp_utc TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      UNIQUE(symbol, provider, interval, timestamp_utc)
    );`,
    `CREATE TABLE IF NOT EXISTS ensemble_models (
      modelId TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      interval TEXT NOT NULL,
      trainingPeriod TEXT NOT NULL,
      featureVersion TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      barsUsed INTEGER DEFAULT 0,
      patternsStored INTEGER DEFAULT 0,
      minSampleSize INTEGER DEFAULT 30,
      horizonBars INTEGER DEFAULT 20,
      description TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS feature_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      provider TEXT NOT NULL,
      interval TEXT NOT NULL,
      timestamp_utc TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      model_id TEXT,
      close REAL,
      rsi14 REAL,
      macd_histogram REAL,
      adx14 REAL,
      atr14 REAL,
      supertrend_dir INTEGER,
      ema20 REAL,
      ema50 REAL,
      volume_zscore REAL,
      return_pct REAL,
      atr_pct REAL,
      pattern_label TEXT,
      future_return_pct REAL,
      future_max_gain_pct REAL,
      future_max_drawdown_pct REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol, provider, interval, timestamp_utc, feature_version, model_id)
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_model_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      symbols TEXT,
      timeframes TEXT,
      periods TEXT,
      settings_json TEXT,
      status TEXT,
      metrics_json TEXT,
      logs TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_training_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      timestamp TEXT,
      timeframe TEXT,
      period TEXT,
      feature_json TEXT,
      label_json TEXT,
      event_type TEXT,
      horizon TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_growth_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      event_start TEXT,
      event_end TEXT,
      start_price REAL,
      max_price REAL,
      max_gain_percent REAL,
      duration_days INTEGER,
      time_to_max INTEGER,
      max_adverse_excursion REAL,
      event_strength_class TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_decline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT,
      event_start TEXT,
      event_end TEXT,
      start_price REAL,
      min_price REAL,
      max_drop_percent REAL,
      duration_bars INTEGER,
      time_to_min INTEGER,
      max_adverse_bounce REAL,
      event_strength_class TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_run_id TEXT,
      symbol TEXT,
      timestamp TEXT,
      current_price REAL,
      score REAL,
      probability_1d REAL,
      probability_2d REAL,
      probability_3d REAL,
      probability_1w REAL,
      expected_gain_percent REAL,
      expected_target_price REAL,
      expected_duration INTEGER,
      stop_loss_candidate REAL,
      invalidation_level REAL,
      risk_reward_ratio REAL,
      signal_type TEXT,
      setup_type TEXT,
      explanation_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS advanced_feature_importance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_run_id TEXT,
      feature_name TEXT,
      importance_score REAL,
      horizon TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS forex_liquidity_logs (
      signalId TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT,
      statusAtDetection TEXT,
      score INTEGER,
      sweptLevel TEXT,
      entry REAL,
      stopLoss REAL,
      tp1 REAL,
      tp2 REAL,
      tp3 REAL,
      resultLater TEXT,
      maxFavorableExcursion REAL,
      maxAdverseExcursion REAL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS dataset_ranges (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'yahoo',
      first_timestamp TEXT,
      last_timestamp TEXT,
      bar_count INTEGER DEFAULT 0,
      requested_from TEXT,
      requested_to TEXT,
      last_sync TEXT,
      quality_status TEXT DEFAULT 'unknown',
      dataset_version INTEGER DEFAULT 1,
      PRIMARY KEY(symbol, interval, provider)
    );`,
    `CREATE TABLE IF NOT EXISTS data_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      provider TEXT NOT NULL,
      requested_from TEXT,
      requested_to TEXT,
      fetched_from TEXT,
      fetched_to TEXT,
      bars_fetched INTEGER DEFAULT 0,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  for (const tableSql of tables) {
    try {
      db.exec(tableSql);
    } catch (e: any) {
      console.error(`Error executing SQL: ${tableSql}`, e);
      throw e;
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval_datetime ON ohlcv(symbol, interval, datetime);
    CREATE INDEX IF NOT EXISTS idx_trained_patterns_lookup ON trained_patterns(symbol, setup_name, training_timeframe);
    CREATE INDEX IF NOT EXISTS idx_data_sync_lookup ON data_sync_log(symbol, interval, created_at);
  `);

  try {
    const ohlcvInfo = db.prepare("PRAGMA table_info(ohlcv)").all();
    if (!ohlcvInfo.find((c: any) => c.name === 'interval')) {
       console.log("Migrating ohlcv table to add interval...");
       db.exec(`
         CREATE TABLE ohlcv_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          interval TEXT DEFAULT '1d',
          datetime TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          UNIQUE(symbol, interval, datetime)
        );
        INSERT INTO ohlcv_new (id, symbol, datetime, open, high, low, close, volume)
        SELECT id, symbol, datetime, open, high, low, close, volume FROM ohlcv;
        DROP TABLE ohlcv;
        ALTER TABLE ohlcv_new RENAME TO ohlcv;
       `);
    }

    const tableInfoRow = db.prepare("PRAGMA table_info(trained_patterns)").all();
    const isPkSymbol = tableInfoRow.find((c: any) => c.name === 'symbol' && c.pk === 1) && tableInfoRow.find((c: any) => c.pk > 0) && tableInfoRow.filter((c: any)=>c.pk>0).length === 1;

    if (isPkSymbol) {
       console.log("Migrating PK for trained_patterns...");
       db.exec(`
         CREATE TABLE trained_patterns_new (
          symbol TEXT,
          setup_name TEXT,
          training_timeframe TEXT,
          patternsFound INTEGER,
          winRate REAL,
          avgExpectancy REAL,
          avgBullMove REAL,
          avgBearMove REAL,
          sampleSize INTEGER,
          teachingQuality REAL,
          modelFittingPerformance REAL,
          bullWinRate REAL,
          bearWinRate REAL,
          avgBullGain REAL,
          avgBearGain REAL,
          avgBullDrawdown REAL,
          avgBearDrawdown REAL,
          avgBullMoveTime REAL,
          avgBearMoveTime REAL,
          PRIMARY KEY (symbol, setup_name, training_timeframe)
        );
        INSERT INTO trained_patterns_new SELECT * FROM trained_patterns;
        DROP TABLE trained_patterns;
        ALTER TABLE trained_patterns_new RENAME TO trained_patterns;
       `);
    }

    const migrations = [
      "ALTER TABLE trained_patterns ADD COLUMN avgBullMove REAL DEFAULT 2.0",
      "ALTER TABLE trained_patterns ADD COLUMN avgBearMove REAL DEFAULT 2.0",
      "ALTER TABLE trained_patterns ADD COLUMN setup_name TEXT",
      "ALTER TABLE trained_patterns ADD COLUMN training_timeframe TEXT",
      "ALTER TABLE trained_patterns ADD COLUMN bullWinRate REAL",
      "ALTER TABLE trained_patterns ADD COLUMN bearWinRate REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBullGain REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBearGain REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBullDrawdown REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBearDrawdown REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBullMoveTime REAL",
      "ALTER TABLE trained_patterns ADD COLUMN avgBearMoveTime REAL",
      "ALTER TABLE scanner_results ADD COLUMN growth_strength REAL",
      "ALTER TABLE scanner_results ADD COLUMN growth_speed REAL",
      "ALTER TABLE scanner_results ADD COLUMN growth_duration INTEGER",
      "ALTER TABLE scanner_results ADD COLUMN max_estimated_value REAL",
      "ALTER TABLE scanner_results ADD COLUMN decline_strength REAL",
      "ALTER TABLE scanner_results ADD COLUMN decline_speed REAL",
      "ALTER TABLE scanner_results ADD COLUMN decline_duration INTEGER",
      "ALTER TABLE scanner_results ADD COLUMN min_estimated_value REAL"
    ];
    for (const sql of migrations) {
       try { db.exec(sql); } catch(e){}
    }
    console.log("Database columns migrated.");
  } catch (e) {
    // Parent catch
  }

  const insertSym = db.prepare('INSERT OR IGNORE INTO symbols (symbol, name, sector) VALUES (?, ?, ?)');
  const updateSym = db.prepare('UPDATE symbols SET name = ?, sector = ? WHERE symbol = ?');
  db.transaction(() => {
     for (const sym of ALL_SYMBOLS) {
        const result = insertSym.run(sym.symbol, sym.name, sym.sector);
        if (result.changes === 0) updateSym.run(sym.name, sym.sector, sym.symbol);
     }
  })();

  console.log(`Database initialized and seeded with ${ALL_SYMBOLS.length} symbols.`);
}

export function getDb() {
  return db;
}
