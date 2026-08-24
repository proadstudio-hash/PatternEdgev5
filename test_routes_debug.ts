import express from 'express';
import { setupRoutes } from './server/routes.js';
const app = express();
app.use(express.json());
setupRoutes(app);
app.listen(3001, () => "started");
