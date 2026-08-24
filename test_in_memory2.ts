import express from 'express';
import { setupRoutes } from './server/routes.js';

const app = express();
app.use(express.json());
setupRoutes(app);

const server = app.listen(3002, async () => {
  try {
    const res = await fetch('http://localhost:3002/api/quotes?symbols=AAPL');
    const text = await res.text();
    console.log("TEXT:", text);
  } catch(e) {
    console.error(e);
  } finally {
    server.close();
  }
});
