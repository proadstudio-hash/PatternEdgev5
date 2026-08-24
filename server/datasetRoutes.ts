import type { Application } from 'express';
import { getDb } from './db.js';
import { CANONICAL_TRAINING_PLAN } from './engine/trainingPlan.js';
import { exportStoredDataset, getDatasetManifest, syncMarketData } from './engine/marketDataService.js';
import { analyzeMultiHorizon } from './engine/multiHorizonAnalysis.js';

export function setupDatasetRoutes(app: Application) {
  app.get('/api/datasets/manifest', (req, res) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
      res.json(getDatasetManifest(symbol));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/datasets/export', (req, res) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
      const payload = exportStoredDataset(symbol);
      const name = symbol ? `patternedge_${symbol}_dataset.json` : 'patternedge_dataset.json';
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(JSON.stringify(payload));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/datasets/import', (req, res) => {
    try {
      const payload = req.body;
      if (!payload || !Array.isArray(payload.bars)) {
        return res.status(400).json({ error: 'Invalid PatternEdge dataset: bars[] is required' });
      }
      const db = getDb();
      const insert = db.prepare(`
        INSERT OR REPLACE INTO ohlcv
          (symbol, interval, datetime, open, high, low, close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let imported = 0;
      db.transaction(() => {
        for (const b of payload.bars) {
          if (!b?.symbol || !b?.interval || !b?.datetime) continue;
          if (![b.open, b.high, b.low, b.close].every(Number.isFinite)) continue;
          insert.run(b.symbol, b.interval, b.datetime, b.open, b.high, b.low, b.close, Number.isFinite(b.volume) ? b.volume : 0);
          imported++;
        }
      })();
      res.json({ status: 'ok', imported, note: 'Imported bars are now available for offline training without re-requesting historical Yahoo data.' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/datasets/sync-canonical', async (req, res) => {
    try {
      const symbols = req.body?.symbols;
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'symbols[] is required' });
      }
      const results: any[] = [];
      for (const slice of CANONICAL_TRAINING_PLAN) {
        const sliceResults = await syncMarketData(symbols, slice.interval, slice.timeframe);
        results.push({ slice, results: sliceResults });
      }
      res.json({ status: 'ok', plan: CANONICAL_TRAINING_PLAN, results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/live/multi-horizon/:symbol', async (req, res) => {
    try {
      const result = await analyzeMultiHorizon(req.params.symbol.toUpperCase());
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/models/export-all', (req, res) => {
    try {
      const db = getDb();
      const payload = {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        trainedPatterns: db.prepare('SELECT * FROM trained_patterns').all(),
        ensembleModels: db.prepare('SELECT * FROM ensemble_models').all(),
        featureSnapshots: db.prepare('SELECT * FROM feature_snapshots').all(),
        advancedModelRuns: db.prepare('SELECT * FROM advanced_model_runs').all(),
        advancedFeatureImportance: db.prepare('SELECT * FROM advanced_feature_importance').all(),
        settings: db.prepare("SELECT * FROM settings WHERE key LIKE 'training_%' OR key LIKE 'model_%'").all(),
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="patternedge_models.json"');
      res.send(JSON.stringify(payload));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
