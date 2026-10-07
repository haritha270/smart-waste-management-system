'use strict';

/**
 * /api/worker - Collection worker routes.
 *
 * Handles:
 * 1. Public email-action endpoint (Yes/No response from work order email links)
 * 2. Worker Dispatch Mailbox (viewing emails sent to the worker)
 * 3. Worker Dashboard summary and assigned tasks
 * 4. In-app task completion & map tracking
 */

const express = require('express');
const { requireRole } = require('../middleware/auth');
const { notify, notifyAdmins, applyStatus } = require('../utils/helpers');
const { REPORT_SELECT, serializeReport, serializeHistory } = require('../utils/serialize');
const { forceDeliverEmail } = require('../utils/mailer');
const { historyFor } = require('./reports');

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Public Email Action Endpoints (Invoked from Email Yes/No Buttons)   */
/* ------------------------------------------------------------------ */

/**
 * GET or POST /api/worker/email-action
 * Query or Body params:
 *   code: string (e.g. WM1001)
 *   token: string (action_token from emails table)
 *   action: 'completed' | 'in_progress' | 'yes' | 'no'
 *   note: optional string
 */
async function handleEmailAction(req, res) {
  const db = req.db;
  const code = (req.query.code || req.body.code || '').trim().toUpperCase();
  const token = (req.query.token || req.body.token || '').trim();
  const actionRaw = (req.query.action || req.body.action || '').trim().toLowerCase();
  const note = (req.query.note || req.body.note || '').trim();

  if (!code || !token) {
    return res.status(400).json({
      ok: false,
      message: 'Invalid email action link. Missing complaint code or verification token.',
    });
  }

  // Verify email token
  const emailRecord = db.get(
    'SELECT * FROM emails WHERE report_code = ? AND action_token = ?',
    [code, token]
  );

  if (!emailRecord) {
    return res.status(403).json({
      ok: false,
      message: 'Invalid or expired work order token. Please check your latest dispatch email.',
    });
  }

  // Fetch report and assigned worker
  const report = db.get('SELECT * FROM reports WHERE report_code = ?', [code]);
  if (!report) {
    return res.status(404).json({ ok: false, message: `Complaint #${code} not found.` });
  }

  const worker = report.assigned_worker_id
    ? db.get('SELECT w.*, u.name, u.email FROM workers w JOIN users u ON u.id = w.user_id WHERE w.id = ?', [report.assigned_worker_id])
    : null;

  const isYes = actionRaw === 'completed' || actionRaw === 'yes' || actionRaw === 'resolved';
  const isNo = actionRaw === 'in_progress' || actionRaw === 'no';

  if (!isYes && !isNo) {
    return res.status(400).json({
      ok: false,
      message: 'Invalid action specified. Supported actions: "completed" (Yes) or "in_progress" (No).',
    });
  }

  const nextStatus = isYes ? 'resolved' : 'in_progress';
  const defaultNote = isYes
    ? `Completed work confirmed by ${worker ? worker.name : 'worker'} via dispatch email.`
    : `Worker confirmed on site / collection in progress via email.`;
  const cleanNote = note || defaultNote;

  // Complete assignment if resolved
  if (isYes) {
    db.run(
      "UPDATE assignments SET status = 'completed', completed_at = ? WHERE report_id = ? AND status = 'active'",
      [db.now(), report.id]
    );
  }

  applyStatus(db, {
    report,
    next: nextStatus,
    changedBy: worker ? worker.user_id : null,
    role: 'worker',
    note: cleanNote,
  });

  const updated = db.get(`${REPORT_SELECT} WHERE r.id = ?`, [report.id]);
  const history = historyFor(db, report.id);
  const serialized = serializeReport(updated, { history });

  const message = isYes
    ? `🎉 Excellent! Complaint #${code} has been marked as COMPLETED. Citizen and Administrator have been notified.`
    : `⏳ Complaint #${code} status updated to IN PROGRESS. Safe travels on your collection run!`;

  res.json({
    ok: true,
    action: nextStatus,
    message,
    task: serialized,
    report: serialized,
  });
}

router.get('/email-action', handleEmailAction);
router.post('/email-action', handleEmailAction);

/**
 * Preview email content by token or ID (useful for dev and in-browser email preview).
 */
router.get('/email-preview/:idOrToken', (req, res) => {
  const db = req.db;
  const param = req.params.idOrToken;
  const email = db.get(
    'SELECT * FROM emails WHERE id = ? OR action_token = ? OR report_code = ? ORDER BY id DESC',
    [param, param, param]
  );
  if (!email) {
    return res.status(404).send('<h2>Email not found</h2>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(email.body_html);
});

/* ------------------------------------------------------------------ */
/* Authenticated Worker Middleware                                     */
/* ------------------------------------------------------------------ */

router.use(requireRole('worker'));

router.use((req, res, next) => {
  const w = req.db.get('SELECT * FROM workers WHERE user_id = ?', [req.user.id]);
  if (!w) return res.status(403).json({ ok: false, message: 'Worker profile not found for this account.' });
  req.worker = w;
  next();
});

/* ------------------------------------------------------------------ */
/* Worker Dispatch Mailbox                                             */
/* ------------------------------------------------------------------ */

router.get('/emails', (req, res) => {
  const db = req.db;
  const emails = db.all(
    'SELECT id, recipient, recipient_name, subject, body_text, report_code, action_token, status, sent_at FROM emails WHERE recipient = ? ORDER BY sent_at DESC',
    [req.user.email]
  );
  res.json({ ok: true, emails });
});

router.get('/emails/:id', (req, res) => {
  const db = req.db;
  const email = db.get(
    'SELECT * FROM emails WHERE id = ? AND recipient = ?',
    [req.params.id, req.user.email]
  );
  if (!email) return res.status(404).json({ ok: false, message: 'Email not found.' });
  res.json({ ok: true, email });
});

router.post('/emails/:id/force-send', async (req, res) => {
  const db = req.db;
  try {
    const result = await forceDeliverEmail(db, req.params.id);
    if (!result.ok) return res.status(404).json({ ok: false, message: result.message || 'Email not found.' });
    if (result.deliveryStatus === 'failed') {
      return res.status(502).json({ ok: false, message: result.message, result });
    }
    res.json({ ok: true, message: result.message, result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

/* ------------------------------------------------------------------ */
/* Worker summary & dashboard                                          */
/* ------------------------------------------------------------------ */

router.get('/summary', (req, res) => {
  const db = req.db;
  const wid = req.worker.id;

  const count = (sql, ...params) => {
    const r = db.get(sql, params);
    return r ? Number(Object.values(r)[0]) : 0;
  };

  const assigned = count("SELECT COUNT(*) AS n FROM reports WHERE assigned_worker_id = ? AND status = 'assigned'", wid);
  const inProgress = count("SELECT COUNT(*) AS n FROM reports WHERE assigned_worker_id = ? AND status = 'in_progress'", wid);
  const resolved = count("SELECT COUNT(*) AS n FROM reports WHERE assigned_worker_id = ? AND status = 'resolved'", wid);
  const total = assigned + inProgress + resolved;
  const unreadEmails = count("SELECT COUNT(*) AS n FROM emails WHERE recipient = ?", req.user.email);

  const statsObj = {
    total,
    assigned,
    inProgress,
    resolved,
    active: assigned + inProgress,
    unreadEmails,
    completionRate: total ? Math.round((resolved / total) * 100) : 0,
  };

  res.json({
    ok: true,
    worker: {
      id: req.worker.id,
      code: req.worker.employee_code,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      zone: req.worker.zone,
      vehicle: req.worker.vehicle,
      specialization: req.worker.specialization,
      status: req.worker.status,
    },
    counts: statsObj,
    stats: statsObj,
  });
});

/* ------------------------------------------------------------------ */
/* Assigned tasks list                                                 */
/* ------------------------------------------------------------------ */

router.get('/tasks', (req, res) => {
  const db = req.db;
  const wid = req.worker.id;
  const status = req.query.status;

  let where = 'WHERE r.assigned_worker_id = ?';
  const params = [wid];

  if (status && status !== 'all') {
    if (status === 'active') {
      where += " AND r.status IN ('assigned', 'in_progress')";
    } else {
      where += ' AND r.status = ?';
      params.push(status);
    }
  }

  const rows = db.all(`${REPORT_SELECT} ${where} ORDER BY r.reported_at DESC, r.id DESC`, params);
  res.json({
    ok: true,
    tasks: rows.map((r) => serializeReport(r)),
  });
});

/* ------------------------------------------------------------------ */
/* Task details                                                        */
/* ------------------------------------------------------------------ */

router.get('/tasks/:code', (req, res) => {
  const db = req.db;
  const row = db.get(`${REPORT_SELECT} WHERE r.report_code = ? AND r.assigned_worker_id = ?`, [req.params.code, req.worker.id]);

  if (!row) {
    return res.status(404).json({ ok: false, message: 'Task not found or not assigned to you.' });
  }

  const history = historyFor(db, row.id);
  const email = db.get('SELECT * FROM emails WHERE report_code = ? AND recipient = ? ORDER BY id DESC', [row.report_code, req.user.email]);

  res.json({
    ok: true,
    task: serializeReport(row, { history }),
    dispatchEmail: email || null,
  });
});

/* ------------------------------------------------------------------ */
/* Update task status / "I completed the work"                         */
/* ------------------------------------------------------------------ */

router.post('/tasks/:code/status', (req, res) => {
  const db = req.db;
  const row = db.get('SELECT * FROM reports WHERE report_code = ? AND assigned_worker_id = ?', [req.params.code, req.worker.id]);

  if (!row) {
    return res.status(404).json({ ok: false, message: 'Task not found or not assigned to you.' });
  }

  const { status: next, note } = req.body || {};
  const allowed = ['in_progress', 'resolved'];

  if (!allowed.includes(next)) {
    return res.status(400).json({ ok: false, message: 'Invalid status update for worker.' });
  }

  const cleanNote = note && String(note).trim() ? String(note).trim() : (next === 'resolved' ? 'I completed the work and collected the waste.' : 'Started waste collection on site.');

  // Update assignment completed_at if resolved
  if (next === 'resolved') {
    db.run(
      "UPDATE assignments SET status = 'completed', completed_at = ? WHERE report_id = ? AND worker_id = ? AND status = 'active'",
      [db.now(), row.id, req.worker.id]
    );
  }

  applyStatus(db, {
    report: row,
    next,
    changedBy: req.user.id,
    role: 'worker',
    note: cleanNote,
  });

  const updated = db.get(`${REPORT_SELECT} WHERE r.id = ?`, [row.id]);
  const history = historyFor(db, row.id);
  const serialized = serializeReport(updated, { history });

  res.json({
    ok: true,
    message: next === 'resolved' ? 'Great job! Task marked as completed.' : 'Collection started successfully.',
    task: serialized,
    report: serialized,
  });
});

module.exports = router;
