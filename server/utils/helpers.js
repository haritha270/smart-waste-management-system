'use strict';

/**
 * Shared utilities: password hashing, session tokens, status workflow,
 * notification helpers and small validation routines used across the API.
 */

const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/* Passwords (scrypt - part of Node core, no native dependency)        */
/* ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== test.length) return false;
  return crypto.timingSafeEqual(expected, test);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/* ------------------------------------------------------------------ */
/* Complaint status workflow                                           */
/* ------------------------------------------------------------------ */

const STATUS = {
  pending: { label: 'Pending', step: 1, tone: 'amber' },
  assigned: { label: 'Assigned', step: 2, tone: 'blue' },
  in_progress: { label: 'In Progress', step: 3, tone: 'violet' },
  resolved: { label: 'Resolved', step: 4, tone: 'green' },
};

const STATUS_FLOW = ['pending', 'assigned', 'in_progress', 'resolved'];

const isValidStatus = (s) => Object.prototype.hasOwnProperty.call(STATUS, s);

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create a notification row.
 * @param {{run:Function}} db database helper
 */
function notify(db, userId, { title, message, type = 'info', reportCode = null, link = null }) {
  if (!userId) return;
  db.run(
    `INSERT INTO notifications (user_id, title, message, type, report_code, link, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [userId, title, message, type, reportCode, link, db.now()]
  );
}

/** Notify many users at once with the same message. */
function notifyMany(db, userIds, payload) {
  [...new Set(userIds.filter(Boolean))].forEach((id) => notify(db, id, payload));
}

/** Notify all active administrators in the system. */
function notifyAdmins(db, { title, message, type = 'info', reportCode = null, link = null }) {
  const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1");
  admins.forEach((a) => {
    notify(db, a.id, { title, message, type, reportCode, link });
  });
}

/** Apply a status transition and notify the Citizen, Worker, and Admin. */
function applyStatus(db, { report, next, changedBy, role = 'admin', note = null }) {
  const now = db.now();
  const patches = ['status = ?', 'updated_at = ?'];
  const values = [next, now];

  if (next === 'resolved') {
    patches.push('resolved_at = ?');
    values.push(now);
  } else if (next === 'pending') {
    patches.push('resolved_at = NULL');
  }
  if (note) {
    patches.push('admin_note = ?');
    values.push(note);
  }
  values.push(report.id);
  db.run(`UPDATE reports SET ${patches.join(', ')} WHERE id = ?`, values);

  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [report.id, report.status, next, changedBy, role, note, now]
  );

  const code = report.report_code;
  const messages = {
    assigned: {
      title: `Task Assigned to Collection Worker`,
      message: note ? `Worker assigned for #${code}: ${note}` : `A municipal worker has been assigned to collect waste for #${code}.`,
      type: 'info',
    },
    in_progress: {
      title: `Waste Collection In Progress`,
      message: note ? `Update for #${code}: ${note}` : `Field collection team is on site and clearing complaint #${code}.`,
      type: 'info',
    },
    resolved: {
      title: `Complaint #${code} Resolved`,
      message: note ? `Completed: ${note}` : `Your waste complaint #${code} has been cleared and resolved! Thank you for keeping our city clean.`,
      type: 'success',
    },
    pending: {
      title: `Complaint #${code} Reopened`,
      message: note ? `Note: ${note}` : `Complaint #${code} has been moved back to Pending.`,
      type: 'warning',
    },
  };
  if (messages[next]) {
    notify(db, report.user_id, { ...messages[next], reportCode: code, link: `#/reports/${code}` });
  }

  // If worker completed the work, also notify Admins
  if (role === 'worker' && next === 'resolved') {
    notifyAdmins(db, {
      title: `Task Completed for #${code}`,
      message: `Worker completed task #${code}${note ? `: "${note}"` : '.'}`,
      type: 'success',
      reportCode: code,
      link: `#/reports/${code}`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Small validators                                                    */
/* ------------------------------------------------------------------ */

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

function isNumber(v) {
  if (v === '' || v === null || v === undefined) return false;
  return !Number.isNaN(Number(v));
}

/** Generate the human friendly complaint id: WM1001, WM1002, ... */
function reportCodeFor(id) {
  return `WM${1000 + id}`;
}

/** Truncate helper used for short preview strings. */
function truncate(str, len = 120) {
  const s = String(str || '');
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

module.exports = {
  hashPassword,
  verifyPassword,
  newToken,
  STATUS,
  STATUS_FLOW,
  isValidStatus,
  notify,
  notifyMany,
  notifyAdmins,
  applyStatus,
  isEmail,
  isNumber,
  reportCodeFor,
  truncate,
};
