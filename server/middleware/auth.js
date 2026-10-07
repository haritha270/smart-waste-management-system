'use strict';

/**
 * Authentication / authorisation middleware.
 *
 * Sessions are random tokens stored in the `sessions` table and exposed to the
 * browser as an httpOnly cookie, so the frontend never handles credentials
 * after login.
 */

const COOKIE = 'wms_sid';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/** Resolve the current request to a user (attaches req.user). */
function attachUser(db) {
  return (req, res, next) => {
    req.db = db;
    req.user = null;
    const token = req.cookies && req.cookies[COOKIE];
    if (token) {
      const row = db.get(
        `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.phone, u.role, u.address, u.city, u.active, u.created_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ?`,
        [token]
      );
      if (row && new Date(row.expires_at).getTime() > Date.now() && row.active) {
        req.user = row;
        req.sessionToken = token;
      } else if (row) {
        db.run('DELETE FROM sessions WHERE token = ?', [token]);
      }
    }
    next();
  };
}

/** Create a session for a user id and set the cookie. */
function createSession(db, res, userId) {
  const token = require('../utils/helpers').newToken();
  const expires = new Date(Date.now() + SEVEN_DAYS).toISOString();
  db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    db.now(),
    expires,
  ]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // set true when serving over HTTPS
    maxAge: SEVEN_DAYS,
    path: '/',
  });
  return token;
}

function destroySession(db, req, res) {
  if (req.sessionToken) db.run('DELETE FROM sessions WHERE token = ?', [req.sessionToken]);
  res.clearCookie(COOKIE, { path: '/' });
}

/** 401 if nobody is logged in. */
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, message: 'Please log in to continue.' });
  next();
}

/** 403 unless the user has one of the listed roles. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Please log in to continue.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: 'You do not have permission to access this page.' });
    }
    next();
  };
}

module.exports = { COOKIE, attachUser, createSession, destroySession, requireAuth, requireRole };
