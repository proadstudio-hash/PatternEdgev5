const db = require('better-sqlite3')('patternedge.db');
try {
  const insertResult = db.prepare(`
    INSERT OR REPLACE INTO scanner_results 
    (date, symbol, setup_name, generic_score, specific_score, generic_confidence, specific_confidence, classification, probability, expectancy, risk_reward, entry_price, stop_price, target_1, target_2, holding_period, sample_size, explanation, failure_reasons)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertResult.run("2026-05-13", "AAPL", "Test Setup", 0.5, 0.5, 0.5, 0.5, "Neutral", 0.5, 0.5, 2.0, 100, 90, 120, 140, "2-5 days", 500, "desc", "reasons");
  console.log("INSERT SUCCESS");
} catch(e) {
  console.error("INSERT ERROR", e);
}
