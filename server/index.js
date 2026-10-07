'use strict';

/**
 * Smart Waste Management System - application server.
 *
 * Express serves the JSON API under /api, the uploaded images under /uploads
 * and the single-page application from /public (any other GET falls through to
 * index.html so hash-less deep links keep working).
 */

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

// Load environment variables (.env) robustly using dotenv & Node built-in fallback
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  try {
    if (process.loadEnvFile) {
      process.loadEnvFile(path.join(__dirname, '..', '.env'));
    }
  } catch (err) {
    // No .env file — environment variables are read directly from process.env
  }
}

const db = require('./db');
const { attachUser } = require('./middleware/auth');
const { resumeScheduledEmails } = require('./utils/mailer');
const mongo = require('./mongodb');

const PORT = process.env.PORT || 3000;

async function main() {
  await db.init();

  // Resume / flush any pending worker assignment emails
  resumeScheduledEmails(db);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Per-request database handle + MongoDB handle + current user.
  app.use((req, res, next) => {
    req.db = db;
    req.mongo = mongo;
    attachUser(db)(req, res, next);
  });

  // Request logger (silenced for static assets).
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) console.log(`${req.method} ${req.path}`);
    next();
  });

  /* API -------------------------------------------------------------- */
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', require('./routes/reports'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/worker', require('./routes/worker'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/tracking', require('./routes/tracking'));

  app.get('/api/health', async (req, res) => {
    const mongoStatus = await mongo.getMongoStatus();
    res.json({
      ok: true,
      status: 'running',
      time: db.now(),
      database: {
        engine: mongoStatus.connected ? 'MongoDB' : 'SQLite',
        mongo: mongoStatus,
        sqlite: {
          file: db.DB_FILE,
          persisted: true,
        },
      },
    });
  });

  /* Static assets ----------------------------------------------------- */
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  /* Unknown API routes ------------------------------------------------ */
  app.use('/api', (req, res) => res.status(404).json({ ok: false, message: `API route ${req.method} ${req.path} not found.` }));

  /* SPA fallback ------------------------------------------------------ */
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  /* Error handler (multer, JSON parse errors, unexpected failures) ----- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    const message = err.message || 'Something went wrong on the server.';
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ ok: false, message });
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('  ♻  Smart Waste Management System');
    console.log(`  ➜  Local:    http://localhost:${PORT}`);
    console.log(`  ➜  Database: ${mongo.isConnected ? '🍃 MongoDB (' + (mongo.db ? mongo.db.databaseName : 'connected') + ')' : '📦 SQLite (Active)'}`);
    console.log(`  ➜  Mailer:   ${process.env.GMAIL_USER ? '📧 Gmail SMTP (' + process.env.GMAIL_USER + ')' : '📬 In-App Dispatch Mailbox'}`);
    console.log('');
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
