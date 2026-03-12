/**
 * Mera-Pe Backend API
 * Entry point: starts Express server and mounts /api routes.
 */

require('dotenv').config();
const express = require('express');
const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { pool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);

app.use(errorHandler);

async function startServer() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.warn('PostgreSQL not available:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Mera-Pe API running at http://localhost:${PORT}`);
  });
}

startServer();
