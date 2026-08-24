import fs from 'fs';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import { setupRoutes } from './server/routes.js';
import { setupDatasetRoutes } from './server/datasetRoutes.js';
import { initializeDatabase } from './server/db.js';
import { applyDatabaseSafety } from './server/dbSafety.js';
import { populateSymbols } from './server/engine/dataSync.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  initializeDatabase();
  applyDatabaseSafety();
  try {
    populateSymbols();
  } catch(e) { /* ignore */ }

  try {
    setupRoutes(app);
    setupDatasetRoutes(app);
  } catch(e) {
    console.error(e);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const __dirname = path.resolve();
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
