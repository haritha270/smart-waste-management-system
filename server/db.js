'use strict';

/**
 * Database layer for the Smart Waste Management System.
 *
 * Supports MongoDB backend connectivity (local & Atlas cloud)
 * alongside embedded fast SQLite (sql.js) for resilient zero-config execution.
 * Synchronizes writes to MongoDB collections in real time.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { seed } = require('./seed');
const mongo = require('./mongodb');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'wms.sqlite');

let SQL = null;
let db = null;
let persistTimer = null;

/** ISO timestamp helper used for every timestamp written by application code. */
function now() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen','admin','worker')),
  address       TEXT,
  city          TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS workers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code   TEXT    NOT NULL UNIQUE,
  zone            TEXT,
  vehicle         TEXT,
  specialization  TEXT    DEFAULT 'General Collection',
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_leave','inactive')),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code        TEXT    NOT NULL UNIQUE,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT    NOT NULL,
  description        TEXT    NOT NULL,
  image_url          TEXT,
  address            TEXT    NOT NULL,
  locality           TEXT,
  latitude           REAL    NOT NULL,
  longitude          REAL    NOT NULL,
  reported_at        TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','assigned','in_progress','resolved')),
  priority           TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assigned_worker_id INTEGER REFERENCES workers(id) ON DELETE SET NULL,
  resolved_at        TEXT,
  admin_note         TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id    INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  worker_id    INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  assigned_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','reassigned')),
  note         TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'info',
  report_code TEXT,
  link        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id       INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  changed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_role TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT    NOT NULL UNIQUE,
  otp_code    TEXT    NOT NULL,
  expires_at  TEXT    NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient    TEXT    NOT NULL,
  recipient_name TEXT,
  subject      TEXT    NOT NULL,
  body_text    TEXT    NOT NULL,
  body_html    TEXT    NOT NULL,
  template     TEXT    NOT NULL DEFAULT 'assignment',
  report_code  TEXT,
  action_token TEXT,
  status       TEXT    NOT NULL DEFAULT 'sent',
  sent_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_workers_user     ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user     ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_worker   ON reports(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_assignments_rep  ON assignments(report_id);
CREATE INDEX IF NOT EXISTS idx_assignments_wrk  ON assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_notif_user       ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_history_report   ON status_history(report_id);
CREATE INDEX IF NOT EXISTS idx_resets_token     ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_resets_user      ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails(recipient);
CREATE INDEX IF NOT EXISTS idx_emails_code      ON emails(report_code);
CREATE INDEX IF NOT EXISTS idx_emails_token     ON emails(action_token);
`;

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

/** Run a SELECT and return every row as a plain object. */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(normalize(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Run a SELECT and return the first row (or undefined). */
function get(sql, params = []) {
  return all(sql, params)[0];
}

/** Run an INSERT/UPDATE/DELETE and flush the change to disk and MongoDB. */
function run(sql, params = []) {
  db.run(sql, normalize(params));
  flush();
  
  // Background mirror sync to MongoDB if connected
  if (mongo.isConnected) {
    syncSqlChangeToMongo(sql, params);
  }
  
  return { changes: db.getRowsModified() };
}

/** Helper to identify table and synchronize changes to MongoDB */
function syncSqlChangeToMongo(sql, params) {
  try {
    const trimmed = sql.trim();
    const match = trimmed.match(/^(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_]+)/i);
    if (!match) return;
    const table = match[1].toLowerCase();
    
    // Refresh table in background
    setTimeout(async () => {
      try {
        if (!mongo.isConnected || !mongo.db) return;
        const rows = all(`SELECT * FROM ${table}`);
        const col = mongo.db.collection(table);
        if (rows && rows.length > 0) {
          for (const row of rows) {
            const filter = row.id ? { id: row.id } : (row.token ? { token: row.token } : { _id: row._id });
            await col.updateOne(filter, { $set: row }, { upsert: true });
          }
        }
      } catch (e) {
        // silent sync
      }
    }, 50);
  } catch (err) {
    // Non-blocking
  }
}

/** Execute one or more statements without parameters (schema changes). */
function exec(sql) {
  db.run(sql);
}

/** Value of `last_insert_rowid()` for the current connection. */
function lastId() {
  const res = db.exec('SELECT last_insert_rowid() AS id');
  return res[0] && res[0].values.length ? res[0].values[0][0] : null;
}

/** sql.js only accepts number | string | null | Uint8Array as bind values. */
function normalize(params) {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

/** Flush the in-memory database to disk immediately. */
function persistNow() {
  if (!db) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[db] failed to persist database:', err.message);
  }
}

/** Debounced flush so batch writes only hit the disk once. */
function flush() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 120);
  if (persistTimer.unref) persistTimer.unref();
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

let readyPromise = null;

/**
 * Load the database (creating + seeding it on first run) and connects MongoDB.
 * Safe to call multiple times - returns the same promise.
 */
function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    SQL = await initSqlJs();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    let bytes = null;
    if (fs.existsSync(DB_FILE)) {
      try {
        bytes = fs.readFileSync(DB_FILE);
      } catch (err) {
        console.warn('[db] could not read existing database, recreating:', err.message);
      }
    }
    db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
    db.run(SCHEMA);
    await seed(api);
    persistNow();

    // Connect MongoDB in parallel/background
    try {
      const mongoRes = await mongo.connectMongo();
      if (mongoRes.ok) {
        await mongo.syncFromSqlite(api);
      }
    } catch (mErr) {
      console.warn('[db] MongoDB initialization non-blocking warning:', mErr.message);
    }

    return api;
  })();
  return readyPromise;
}

/** Drop everything and rebuild the database with a clean schema. */
async function reseed() {
  if (db) {
    db.close();
    db = null;
  }
  readyPromise = null;
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  return init();
}

/** Shared object passed to the seeder and available to route modules. */
const api = {
  get db() {
    return db;
  },
  mongo,
  all,
  get,
  run,
  exec,
  lastId,
  flush: persistNow,
  now,
};

// Flush pending writes when the process stops.
function shutdown() {
  if (persistTimer) clearTimeout(persistTimer);
  persistNow();
  mongo.closeMongo().catch(() => {});
}
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('exit', shutdown);

module.exports = { init, reseed, all, get, run, exec, lastId, now, persistNow, DB_FILE, mongo };
