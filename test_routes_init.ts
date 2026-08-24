import express from 'express';
import { setupRoutes } from './server/routes.js';
const app = express();
try {
  setupRoutes(app);
  console.log("Success");
} catch(e) {
  console.error("Error setting up routes:", e);
}
