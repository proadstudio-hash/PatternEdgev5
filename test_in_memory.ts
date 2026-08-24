import express from 'express';
import { setupRoutes } from './server/routes.js';
import request from 'supertest';

const app = express();
app.use(express.json());
setupRoutes(app);

async function test() {
  const res = await request(app).get('/api/quotes?symbols=AAPL');
  console.log("STATUS:", res.status);
  console.log("BODY:", res.body);
  console.log("TEXT:", res.text);
}
test();
