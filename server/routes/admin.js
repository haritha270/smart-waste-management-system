'use strict';

/**
 * /api/admin - administrator routes.
 *
 * Covers admin dashboard statistics, full complaint management (status changes,
 * notes, filters, sorting), user directory, analytics and notification broadcasts.
 */

const crypto = require('crypto');
const express = require('express');
const { hashPassword, isEmail, notify, notifyMany, applyStatus, isValidStatus, STATUS, STATUS_FLOW } = require('../utils/helpers');
const { sendWorkerAssignmentEmail, testSmtpConnection, isSmtpConfigured } = require('../utils/mailer');
const { requireRole } = require('../middleware/auth');
const { REPORT_SELECT, serializeReport, serializeWorker, serializeUser } = require('../utils/serialize');
const { historyFor } = require('./reports');
const mongo = require('../mongodb');

const router = express.Router();
router.use(requireRole('admin'));

/* ------------------------------------------------------------------ */
/* Dashboard statistics                                                */
/* ------------------------------------------------------------------ */

router.get('/stats', (req, res) => {
  const db = req.db;
  const count = (sql, ...params) => {
    const row = db.get(sql, params);
    return row ? Number(Object.values(row)[0]) : 0;
  };

  const byStatus = {};
  db.all('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').forEach((r) => { byStatus[r.status] = r.n; });

  const totalReports = count('SELECT COUNT(*) AS n FROM reports');
  const totalUsers = count("SELECT COUNT(*) AS n FROM users WHERE role = 'citizen'");
  const totalWorkers = count("SELECT COUNT(*) AS n FROM workers WHERE status = 'active'");
  const resolved = count("SELECT COUNT(*) AS n FROM reports WHERE status = 'resolved'");
  const inProgress = count("SELECT COUNT(*) AS n FROM reports WHERE status = 'in_progress'");
  const assigned = count("SELECT COUNT(*) AS n FROM reports WHERE status = 'assigned'");
  const pending = count("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'");
  const open = totalReports - resolved;

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const lastWeek = count('SELECT COUNT(*) AS n FROM reports WHERE reported_at >= ?', weekAgo);
  const prevWeek = count('SELECT COUNT(*) AS n FROM reports WHERE reported_at >= ? AND reported_at < ?', new Date(Date.now() - 14 * 864e5).toISOString(), weekAgo);

  // Average resolution time (hours)
  const avgRow = db.get(
    `SELECT AVG((julianday(resolved_at) - julianday(reported_at)) * 24) AS hours
       FROM reports WHERE status = 'resolved' AND resolved_at >= ?`,
    [new Date(Date.now() - 30 * 864e5).toISOString()]
  );

  res.json({
    ok: true,
    stats: {
      totalReports,
      pending,
      assigned,
      inProgress,
      resolved,
      open,
      totalUsers,
      totalWorkers,
      lastWeekReports: lastWeek,
      reportGrowthPct: prevWeek === 0 ? (lastWeek > 0 ? 100 : 0) : Math.round(((lastWeek - prevWeek) / prevWeek) * 100),
      avgResolutionHours: avgRow && avgRow.hours ? Math.round(avgRow.hours * 10) / 10 : null,
      unreadNotifications: count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id),
    },
    byStatus: STATUS_FLOW.map((s) => ({ status: s, label: STATUS[s].label, count: byStatus[s] || 0 })),
  });
});

/* ------------------------------------------------------------------ */
/* Complaints management                                               */
/* ------------------------------------------------------------------ */

router.get('/reports', (req, res) => {
  const db = req.db;
  const { status, priority, q, sort } = req.query;
  const clauses = [];
  const params = [];

  if (status && status !== 'all') { clauses.push('r.status = ?'); params.push(status); }
  if (priority && priority !== 'all') { clauses.push('r.priority = ?'); params.push(priority); }
  if (q && String(q).trim()) {
    clauses.push('(r.report_code LIKE ? OR r.title LIKE ? OR r.address LIKE ? OR r.locality LIKE ? OR u.name LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like, like, like);
  }

  const orderMap = {
    newest: 'r.reported_at DESC',
    oldest: 'r.reported_at ASC',
    priority: `CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, r.reported_at DESC`,
  };
  const order = orderMap[sort] || orderMap.newest;

  const rows = db.all(REPORT_SELECT + (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '') + ` ORDER BY ${order}`, params);
  res.json({ ok: true, total: rows.length, reports: rows.map((r) => serializeReport(r)) });
});

router.get('/reports/:code', (req, res) => {
  const db = req.db;
  const row = db.get(REPORT_SELECT + ' WHERE r.report_code = ?', [String(req.params.code).toUpperCase()]);
  if (!row) return res.status(404).json({ ok: false, message: 'Complaint not found.' });
  res.json({ ok: true, report: serializeReport(row, { history: historyFor(db, row.id) }) });
});

/** Update complaint status directly. */
router.patch('/reports/:code/status', (req, res) => {
  const db = req.db;
  const code = String(req.params.code).toUpperCase();
  const row = db.get(REPORT_SELECT + ' WHERE r.report_code = ?', [code]);
  if (!row) return res.status(404).json({ ok: false, message: 'Complaint not found.' });

  const next = req.body && req.body.status;
  if (!isValidStatus(next)) return res.status(400).json({ ok: false, message: 'Invalid status provided.' });

  applyStatus(db, {
    report: row,
    next,
    changedBy: req.user.id,
    role: 'admin',
    note: (req.body && req.body.note) || null,
  });

  const updated = db.get(REPORT_SELECT + ' WHERE r.id = ?', [row.id]);
  res.json({
    ok: true,
    message: `Complaint #${code} updated to ${STATUS[next].label}.`,
    report: serializeReport(updated, { history: historyFor(db, row.id) }),
  });
});

/** Assign complaint to a worker and dispatch work order email immediately. */
router.post('/reports/:code/assign', async (req, res) => {
  const db = req.db;
  const code = String(req.params.code).toUpperCase();
  const report = db.get('SELECT * FROM reports WHERE report_code = ?', [code]);
  if (!report) return res.status(404).json({ ok: false, message: 'Complaint not found.' });

  const { workerId, note } = req.body || {};
  const wid = Number(workerId);
  const worker = db.get('SELECT w.*, u.name, u.phone, u.email FROM workers w JOIN users u ON u.id = w.user_id WHERE w.id = ?', [wid]);
  if (!worker) return res.status(400).json({ ok: false, message: 'Please select a valid active worker.' });

  const now = db.now();
  // Update report
  db.run(
    `UPDATE reports SET assigned_worker_id = ?, status = 'assigned', updated_at = ? WHERE id = ?`,
    [wid, now, report.id]
  );

  // Mark old active assignments as reassigned
  db.run(
    `UPDATE assignments SET status = 'reassigned' WHERE report_id = ? AND status = 'active'`,
    [report.id]
  );

  // Create new assignment
  db.run(
    `INSERT INTO assignments (report_id, worker_id, assigned_by, assigned_at, status, note)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [report.id, wid, req.user.id, now, note || 'Assigned by administrator']
  );

  // Log to status history
  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, ?, 'assigned', ?, 'admin', ?, ?)`,
    [report.id, report.status, req.user.id, `Assigned to worker ${worker.name} (${worker.employee_code})${note ? ': ' + note : ''}`, now]
  );

  // 1. SEND EMAIL NOTIFICATION TO WORKER IMMEDIATELY (Complainant info, exact location & GPS, Yes/No action)
  const citizen = db.get('SELECT * FROM users WHERE id = ?', [report.user_id]) || { name: 'Citizen', phone: 'N/A', address: report.address };
  const emailResult = await sendWorkerAssignmentEmail(db, {
    workerEmail: worker.email,
    workerName: worker.name,
    workerCode: worker.employee_code,
    report,
    citizen,
    adminUser: req.user,
    adminNote: note || '',
  });

  // Notify the assigned worker inside the app, independently of email delivery.
  notify(db, worker.user_id, {
    title: `New Task Assigned · #${code}`,
    message: `${report.title} — ${report.locality || report.address}. Open your assigned tasks to review the work order.`,
    type: 'task',
    reportCode: code,
    link: '#/worker/tasks',
  });

  // 2. NOTIFY CITIZEN IN-APP
  notify(db, report.user_id, {
    title: `Worker Assigned for #${code}`,
    message: `Worker ${worker.name} (Phone: ${worker.phone || 'N/A'}, Vehicle: ${worker.vehicle || 'Truck'}) has been assigned to your complaint.`,
    type: 'info',
    reportCode: code,
    link: `#/reports/${code}`,
  });

  const updated = db.get(REPORT_SELECT + ' WHERE r.id = ?', [report.id]);
  let emailMessage = '';
  if (emailResult.deliveryStatus === 'sent') {
    emailMessage = `Work order email successfully delivered to ${worker.email} via Gmail.`;
  } else if (emailResult.smtpConfigured && emailResult.deliveryStatus === 'failed') {
    emailMessage = `Task assigned. Email dispatch to ${worker.email} failed (${emailResult.deliveryMessage || 'check SMTP credentials in .env'}). Available in worker portal.`;
  } else {
    emailMessage = `Work order delivered to ${worker.name}'s Dispatch Mailbox. (To send real Gmail to worker, configure GMAIL_USER and GMAIL_APP_PASSWORD in .env).`;
  }

  res.json({
    ok: true,
    message: `Complaint #${code} assigned to worker ${worker.name}. ${emailMessage}`,
    emailConfigured: emailResult.smtpConfigured,
    emailStatus: emailResult.deliveryStatus,
    emailSentTo: worker.email,
    actionToken: emailResult.actionToken,
    report: serializeReport(updated, { history: historyFor(db, report.id) }),
  });
});

/* ------------------------------------------------------------------ */
/* Workers Management                                                 */
/* ------------------------------------------------------------------ */

router.get('/workers', (req, res) => {
  const db = req.db;
  const rows = db.all(`
    SELECT w.*, u.name, u.email, u.phone, u.city, u.active,
           (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status IN ('assigned', 'in_progress')) AS active_tasks,
           (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status = 'resolved') AS completed_tasks
      FROM workers w
      JOIN users u ON u.id = w.user_id
     ORDER BY w.created_at DESC
  `);
  res.json({ ok: true, workers: rows.map((r) => serializeWorker(r)) });
});

router.post('/workers', (req, res) => {
  const db = req.db;
  const { name, email, phone, password, employeeCode: customCode, zone, vehicle, specialization } = req.body || {};
  const errors = [];
  if (!name || String(name).trim().length < 2) errors.push('Worker name is required (min. 2 chars).');
  if (!email || !isEmail(email)) errors.push('Valid email address is required.');
  if (password !== undefined && password !== '' && String(password).length < 6) errors.push('Password must be at least 6 characters.');
  if (errors.length) return res.status(400).json({ ok: false, message: errors[0], errors });

  // Password is optional: admin only needs the worker's Gmail. When omitted,
  // a random one is generated and the worker sets their own via Forgot Password.
  const workerPassword = password && String(password).length ? String(password) : crypto.randomBytes(18).toString('hex');

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing) return res.status(409).json({ ok: false, message: 'An account with this email already exists.' });

  const now = db.now();
  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, city, active, created_at)
     VALUES (?, ?, ?, ?, 'worker', 'Bengaluru', 1, ?)`,
    [String(name).trim(), cleanEmail, phone ? String(phone).trim() : null, hashPassword(workerPassword), now]
  );
  const userId = db.lastId();
  const employeeCode = customCode ? String(customCode).trim().toUpperCase() : `WRK${100 + userId}`;

  db.run(
    `INSERT INTO workers (user_id, employee_code, zone, vehicle, specialization, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [userId, employeeCode, zone ? String(zone).trim() : 'Central Zone', vehicle ? String(vehicle).trim() : 'Mini Truck', specialization ? String(specialization).trim() : 'General Collection', now]
  );
  const workerId = db.lastId();

  notify(db, userId, {
    title: 'Worker Account Created',
    message: `Welcome ${name}! You have been registered as a municipal collection worker. Your Employee Code is ${employeeCode}.`,
    type: 'success',
  });

  const created = db.get(
    `SELECT w.*, u.name, u.email, u.phone, u.active, 0 AS active_tasks, 0 AS completed_tasks
       FROM workers w JOIN users u ON u.id = w.user_id WHERE w.id = ?`,
    [workerId]
  );
  res.status(201).json({
    ok: true,
    message: `Worker ${name} added successfully with employee code ${employeeCode}. ${cleanEmail} can sign in and set their own password anytime via Forgot Password.`,
    worker: serializeWorker(created),
  });
});

router.patch('/workers/:id', (req, res) => {
  const db = req.db;
  const wid = Number(req.params.id);
  const w = db.get('SELECT * FROM workers WHERE id = ?', [wid]);
  if (!w) return res.status(404).json({ ok: false, message: 'Worker not found.' });

  const { zone, vehicle, specialization, status, name, phone } = req.body || {};
  if (zone !== undefined || vehicle !== undefined || specialization !== undefined || status !== undefined) {
    db.run(
      'UPDATE workers SET zone = ?, vehicle = ?, specialization = ?, status = ? WHERE id = ?',
      [
        zone !== undefined ? String(zone).trim() : w.zone,
        vehicle !== undefined ? String(vehicle).trim() : w.vehicle,
        specialization !== undefined ? String(specialization).trim() : w.specialization,
        status !== undefined ? String(status).trim() : w.status,
        wid,
      ]
    );
  }
  if (name !== undefined || phone !== undefined) {
    const u = db.get('SELECT * FROM users WHERE id = ?', [w.user_id]);
    db.run(
      'UPDATE users SET name = ?, phone = ? WHERE id = ?',
      [
        name !== undefined ? String(name).trim() : u.name,
        phone !== undefined ? String(phone).trim() : u.phone,
        w.user_id,
      ]
    );
  }
  const updated = db.get(
    `SELECT w.*, u.name, u.email, u.phone, u.active,
            (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status IN ('assigned', 'in_progress')) AS active_tasks,
            (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status = 'resolved') AS completed_tasks
       FROM workers w JOIN users u ON u.id = w.user_id WHERE w.id = ?`,
    [wid]
  );
  res.json({ ok: true, message: 'Worker updated successfully.', worker: serializeWorker(updated) });
});

router.delete('/workers/:id', (req, res) => {
  const db = req.db;
  const wid = Number(req.params.id);
  const w = db.get('SELECT * FROM workers WHERE id = ?', [wid]);
  if (!w) return res.status(404).json({ ok: false, message: 'Worker not found.' });

  const u = db.get('SELECT name, email FROM users WHERE id = ?', [w.user_id]);
  const workerName = u ? u.name : w.employee_code;
  const userId = w.user_id;

  // 1. Reset active assigned reports back to pending
  db.run(
    "UPDATE reports SET assigned_worker_id = NULL, status = 'pending', updated_at = ? WHERE assigned_worker_id = ? AND status IN ('assigned', 'in_progress')",
    [db.now(), wid]
  );
  // 2. Unlink any other reports
  db.run(
    "UPDATE reports SET assigned_worker_id = NULL WHERE assigned_worker_id = ?",
    [wid]
  );
  // 3. Clean up worker assignments
  db.run('DELETE FROM assignments WHERE worker_id = ?', [wid]);
  // 4. Clean up sessions, notifications, and resets for this user
  db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
  db.run('DELETE FROM password_resets WHERE user_id = ?', [userId]);
  db.run('UPDATE status_history SET changed_by = NULL WHERE changed_by = ?', [userId]);
  // 5. Delete worker and user record
  db.run('DELETE FROM workers WHERE id = ?', [wid]);
  db.run('DELETE FROM users WHERE id = ?', [userId]);

  res.json({
    ok: true,
    message: `Worker ${workerName} (${w.employee_code}) removed successfully. Active tasks reset to pending.`,
  });
});

/* ------------------------------------------------------------------ */
/* Clear / Delete Complaints (Admin Only)                             */
/* ------------------------------------------------------------------ */

router.delete('/reports/:code', (req, res) => {
  const db = req.db;
  const code = String(req.params.code).toUpperCase();
  const report = db.get('SELECT * FROM reports WHERE report_code = ?', [code]);
  if (!report) return res.status(404).json({ ok: false, message: `Complaint #${code} not found.` });

  // Clean up cascade
  db.run('DELETE FROM assignments WHERE report_id = ?', [report.id]);
  db.run('DELETE FROM status_history WHERE report_id = ?', [report.id]);
  db.run('DELETE FROM notifications WHERE report_code = ?', [code]);
  db.run('DELETE FROM emails WHERE report_code = ?', [code]);
  db.run('DELETE FROM reports WHERE id = ?', [report.id]);

  res.json({
    ok: true,
    message: `Complaint #${code} has been cleared and deleted by administrator.`,
    code,
  });
});

router.post('/reports/clear-resolved', (req, res) => {
  const db = req.db;
  const resolved = db.all("SELECT id, report_code FROM reports WHERE status = 'resolved'");
  const n = resolved.length;
  if (n === 0) {
    return res.json({ ok: true, message: 'No completed/resolved complaints to clear.', clearedCount: 0 });
  }

  resolved.forEach((r) => {
    db.run('DELETE FROM assignments WHERE report_id = ?', [r.id]);
    db.run('DELETE FROM status_history WHERE report_id = ?', [r.id]);
    db.run('DELETE FROM notifications WHERE report_code = ?', [r.report_code]);
    db.run('DELETE FROM emails WHERE report_code = ?', [r.report_code]);
    db.run('DELETE FROM reports WHERE id = ?', [r.id]);
  });

  res.json({
    ok: true,
    message: `Successfully cleared all ${n} completed/resolved complaint${n === 1 ? '' : 's'}.`,
    clearedCount: n,
  });
});

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

router.get('/users', (req, res) => {
  const db = req.db;
  const { role, q } = req.query;
  const clauses = [];
  const params = [];
  if (role && role !== 'all') { clauses.push('u.role = ?'); params.push(role); }
  if (q && String(q).trim()) {
    clauses.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like);
  }
  const rows = db.all(
    `SELECT u.*, (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS report_count
       FROM users u
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY u.created_at DESC`,
    params
  );
  res.json({
    ok: true,
    users: rows.map((u) => ({ ...serializeUser(u), reportCount: u.report_count })),
  });
});

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

router.get('/analytics', (req, res) => {
  const db = req.db;

  const statusRows = db.all('SELECT status, COUNT(*) AS n FROM reports GROUP BY status');
  const statusMap = {};
  statusRows.forEach((r) => { statusMap[r.status] = r.n; });

  // Reports over the last 30 days.
  const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const createdRows = db.all(
    `SELECT substr(reported_at, 1, 10) AS day, COUNT(*) AS n FROM reports WHERE substr(reported_at, 1, 10) >= ? GROUP BY day`,
    [since]
  );
  const resolvedRows = db.all(
    `SELECT substr(resolved_at, 1, 10) AS day, COUNT(*) AS n FROM reports WHERE resolved_at IS NOT NULL AND substr(resolved_at, 1, 10) >= ? GROUP BY day`,
    [since]
  );
  const createdMap = {};
  const resolvedMap = {};
  createdRows.forEach((r) => { createdMap[r.day] = r.n; });
  resolvedRows.forEach((r) => { resolvedMap[r.day] = r.n; });
  const overTime = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    overTime.push({ day, created: createdMap[day] || 0, resolved: resolvedMap[day] || 0 });
  }

  const topLocalities = db.all(
    `SELECT COALESCE(NULLIF(locality,''),'Unspecified') AS locality, COUNT(*) AS n
       FROM reports GROUP BY locality ORDER BY n DESC LIMIT 8`
  );

  const priorityRows = db.all('SELECT priority, COUNT(*) AS n FROM reports GROUP BY priority');

  const avgRow = db.get(
    `SELECT AVG((julianday(resolved_at) - julianday(reported_at)) * 24) AS hours FROM reports WHERE resolved_at IS NOT NULL`
  );
  const openNow = db.get(`SELECT COUNT(*) AS n FROM reports WHERE status IN ('pending','in_progress')`);
  const total = db.get('SELECT COUNT(*) AS n FROM reports');

  res.json({
    ok: true,
    analytics: {
      byStatus: STATUS_FLOW.map((s) => ({ status: s, label: STATUS[s].label, count: statusMap[s] || 0 })),
      overTime,
      topLocalities: topLocalities.map((l) => ({ locality: l.locality, count: l.n })),
      byPriority: priorityRows.map((p) => ({ priority: p.priority, count: p.n })),
      totals: {
        reports: total ? total.n : 0,
        open: openNow ? openNow.n : 0,
        resolved: statusMap.resolved || 0,
        resolutionRate: total && total.n ? Math.round(((statusMap.resolved || 0) / total.n) * 100) : 0,
        avgResolutionHours: avgRow && avgRow.hours ? Math.round(avgRow.hours * 10) / 10 : 0,
        users: db.get("SELECT COUNT(*) AS n FROM users WHERE role='citizen'").n,
      },
    },
  });
});

/* ------------------------------------------------------------------ */
/* Notifications (admin broadcast)                                     */
/* ------------------------------------------------------------------ */

router.get('/notifications', (req, res) => {
  const db = req.db;
  const rows = db.all(
    `SELECT n.*, u.name AS user_name, u.role AS user_role
       FROM notifications n JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC LIMIT 60`
  );
  res.json({ ok: true, notifications: rows });
});

router.post('/notifications/broadcast', (req, res) => {
  const db = req.db;
  const { title, message, role, userIds } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ ok: false, message: 'Notification title is required.' });
  if (!message || !String(message).trim()) return res.status(400).json({ ok: false, message: 'Notification message is required.' });

  let targets = [];
  if (Array.isArray(userIds) && userIds.length) {
    targets = userIds.map(Number).filter(Boolean);
  } else if (role && role !== 'all') {
    targets = db.all('SELECT id FROM users WHERE role = ? AND active = 1', [role]).map((r) => r.id);
  } else {
    targets = db.all('SELECT id FROM users WHERE active = 1').map((r) => r.id);
  }
  if (!targets.length) return res.status(400).json({ ok: false, message: 'No recipients selected.' });

  notifyMany(db, targets, {
    title: String(title).trim(),
    message: String(message).trim(),
    type: 'info',
  });

  res.status(201).json({ ok: true, message: `Notification sent to ${targets.length} user${targets.length === 1 ? '' : 's'}.` });
});

/* ------------------------------------------------------------------ */
/* Database Status & MongoDB Management                               */
/* ------------------------------------------------------------------ */

router.get('/db-status', async (req, res) => {
  const mongoStatus = await mongo.getMongoStatus();
  res.json({
    ok: true,
    engine: mongoStatus.connected ? 'MongoDB' : 'SQLite',
    mongo: mongoStatus,
    sqlite: {
      file: req.db.DB_FILE,
      tables: {
        users: req.db.get('SELECT COUNT(*) AS n FROM users')?.n || 0,
        workers: req.db.get('SELECT COUNT(*) AS n FROM workers')?.n || 0,
        reports: req.db.get('SELECT COUNT(*) AS n FROM reports')?.n || 0,
        assignments: req.db.get('SELECT COUNT(*) AS n FROM assignments')?.n || 0,
        notifications: req.db.get('SELECT COUNT(*) AS n FROM notifications')?.n || 0,
        emails: req.db.get('SELECT COUNT(*) AS n FROM emails')?.n || 0,
      },
    },
  });
});

router.post('/db-sync', async (req, res) => {
  const result = await mongo.syncFromSqlite(req.db);
  if (!result.synced) {
    return res.status(400).json({
      ok: false,
      message: `Failed to sync with MongoDB: ${result.error || 'MongoDB is not connected.'}`,
      result,
    });
  }
  res.json({
    ok: true,
    message: 'All tables successfully synchronized to MongoDB collections.',
    stats: result.stats,
  });
});

/* ------------------------------------------------------------------ */
/* SMTP & Mailer Management                                            */
/* ------------------------------------------------------------------ */

router.get('/smtp-status', (req, res) => {
  const configured = isSmtpConfigured();
  res.json({
    ok: true,
    configured,
    gmailUser: process.env.GMAIL_USER || process.env.ADMIN_GMAIL || null,
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    adminName: process.env.ADMIN_NAME || 'Municipal Chief Administrator',
  });
});

router.post('/test-email', async (req, res) => {
  const { recipient } = req.body || {};
  const target = (recipient && isEmail(recipient)) ? String(recipient).trim() : req.user.email;
  const result = await testSmtpConnection(target);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

module.exports = router;
