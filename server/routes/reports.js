'use strict';

/**
 * Citizen facing routes: creating reports, "my reports", citizen messages,
 * report details (with status timeline) and the waste map data.
 */

const express = require('express');
const { notify, notifyAdmins, isNumber, reportCodeFor, STATUS_FLOW, STATUS } = require('../utils/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');
const { REPORT_SELECT, serializeReport, serializeHistory } = require('../utils/serialize');
const { handleUpload } = require('../utils/upload');

const router = express.Router();

/** Status timeline rows (with the name of whoever changed the status). */
function historyFor(db, reportId) {
  const rows = db.all(
    `SELECT h.*, u.name AS changed_by_name
       FROM status_history h
       LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.report_id = ?
      ORDER BY h.created_at ASC, h.id ASC`,
    [reportId]
  );
  return serializeHistory(rows);
}

/* ------------------------------------------------------------------ */
/* Public reference data (headline statistics)                        */
/* ------------------------------------------------------------------ */

/** Aggregated numbers shown on the landing page (no sensitive data). */
router.get('/public-stats', (req, res) => {
  const db = req.db;
  const n = (sql) => {
    const row = db.get(sql);
    return row ? Number(Object.values(row)[0]) : 0;
  };
  const reports = n('SELECT COUNT(*) AS n FROM reports');
  const resolved = n("SELECT COUNT(*) AS n FROM reports WHERE status = 'resolved'");
  const citizens = n("SELECT COUNT(*) AS n FROM users WHERE role = 'citizen'");
  const localities = n("SELECT COUNT(DISTINCT locality) AS n FROM reports WHERE locality IS NOT NULL AND locality != ''");
  res.json({
    ok: true,
    stats: {
      reports,
      resolved,
      resolutionRate: reports ? Math.round((resolved / reports) * 100) : 0,
      citizens,
      localities,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Create a report / complaint                                         */
/* ------------------------------------------------------------------ */

router.post('/reports', requireRole('citizen'), handleUpload('image'), (req, res) => {
  const db = req.db;
  const body = req.body || {};
  const errors = [];

  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const address = String(body.address || '').trim();
  const locality = String(body.locality || '').trim();
  const lat = String(body.latitude ?? '').trim();
  const lng = String(body.longitude ?? '').trim();
  const reportedAt = String(body.reportedAt || body.reported_at || '').trim();

  if (!title) errors.push('Waste title is required.');
  else if (title.length < 5) errors.push('Waste title must be at least 5 characters long.');
  else if (title.length > 120) errors.push('Waste title must be under 120 characters.');

  if (!description) errors.push('Waste description is required.');
  else if (description.length < 10) errors.push('Please describe the problem in at least 10 characters.');

  if (!address) errors.push('Location address is required.');
  else if (address.length < 5) errors.push('Please enter a more detailed address.');

  if (!isNumber(lat) || !isNumber(lng)) errors.push('Latitude and longitude are required. Use "Use my location" or pick a point on the map.');
  else {
    const la = Number(lat);
    const lo = Number(lng);
    if (la < -90 || la > 90 || lo < -180 || lo > 180) errors.push('Latitude / longitude must be valid coordinates.');
  }

  if (!reportedAt) errors.push('Date and time of the observation is required.');
  else if (Number.isNaN(new Date(reportedAt).getTime())) errors.push('Invalid date and time.');
  else if (new Date(reportedAt).getTime() > Date.now() + 5 * 60 * 1000) errors.push('Date and time cannot be in the future.');

  if (!req.file) errors.push('Please upload a waste image (JPG, PNG, WEBP or GIF, max 3 MB).');

  if (errors.length) return res.status(400).json({ ok: false, message: errors[0], errors });

  const now = db.now();
  const reportedISO = new Date(reportedAt).toISOString();
  db.run(
    `INSERT INTO reports (report_code, user_id, title, description, image_url, address, locality,
                          latitude, longitude, reported_at, status, priority, created_at, updated_at)
     VALUES ('TMP', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'medium', ?, ?)`,
    [req.user.id, title, description, `/uploads/${req.file.filename}`, address, locality || null, Number(lat), Number(lng), reportedISO, now, now]
  );
  const reportId = db.lastId();

  const code = reportCodeFor(reportId);
  db.run('UPDATE reports SET report_code = ? WHERE id = ?', [code, reportId]);
  db.run(
    `INSERT INTO status_history (report_id, from_status, to_status, changed_by, changed_by_role, note, created_at)
     VALUES (?, NULL, 'pending', ?, 'citizen', ?, ?)`,
    [reportId, req.user.id, 'Complaint submitted by citizen', now]
  );

  // Notify Citizen
  notify(db, req.user.id, {
    title: `Complaint #${code} submitted`,
    message: `Your waste complaint "${title}" has been registered. The administrator has been notified.`,
    type: 'success',
    reportCode: code,
    link: `#/reports/${code}`,
  });

  // Notify Admin(s)
  notifyAdmins(db, {
    title: `New Waste Complaint #${code}`,
    message: `Citizen ${req.user.name} reported: "${title}" at ${locality || address}.`,
    type: 'warning',
    reportCode: code,
    link: `#/reports/${code}`,
  });

  const row = db.get(REPORT_SELECT + ' WHERE r.id = ?', [reportId]);
  res.status(201).json({ ok: true, message: `Complaint submitted successfully. Your complaint ID is ${code}.`, report: serializeReport(row, { history: historyFor(db, reportId) }) });
});

/* ------------------------------------------------------------------ */
/* Citizen message / query to Admin                                    */
/* ------------------------------------------------------------------ */

router.post('/messages', requireAuth, (req, res) => {
  const db = req.db;
  const { message, subject, reportCode } = req.body || {};
  const text = String(message || '').trim();
  if (!text || text.length < 5) {
    return res.status(400).json({ ok: false, message: 'Please write a message of at least 5 characters.' });
  }
  const subj = subject ? String(subject).trim() : (reportCode ? `Query regarding Complaint #${reportCode}` : 'Citizen Message');

  notifyAdmins(db, {
    title: `Message from ${req.user.name}`,
    message: `${subj}: ${text}`,
    type: 'info',
    reportCode: reportCode || null,
    link: reportCode ? `#/reports/${reportCode}` : `#/notifications`,
  });

  notify(db, req.user.id, {
    title: 'Message delivered to Administrator',
    message: `Your message "${subj}" has been forwarded to the municipal administrator.`,
    type: 'success',
    reportCode: reportCode || null,
    link: reportCode ? `#/reports/${reportCode}` : `#/notifications`,
  });

  res.json({ ok: true, message: 'Your message has been sent to the administrator.' });
});

/* ------------------------------------------------------------------ */
/* My reports                                                          */
/* ------------------------------------------------------------------ */

router.get('/reports/mine', requireRole('citizen'), (req, res) => {
  const db = req.db;
  const status = req.query.status;
  const params = [req.user.id];
  let where = 'WHERE r.user_id = ?';
  if (status && status !== 'all') {
    where += ' AND r.status = ?';
    params.push(status);
  }
  const rows = db.all(REPORT_SELECT + ` ${where} ORDER BY r.reported_at DESC`, params);
  res.json({ ok: true, reports: rows.map((r) => serializeReport(r)) });
});

/* ------------------------------------------------------------------ */
/* Report detail (owner / admin)                                       */
/* ------------------------------------------------------------------ */

router.get('/reports/:code', requireAuth, (req, res) => {
  const db = req.db;
  const row = db.get(REPORT_SELECT + ' WHERE r.report_code = ?', [String(req.params.code).toUpperCase()]);
  if (!row) return res.status(404).json({ ok: false, message: 'Report not found.' });

  const isOwner = row.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ ok: false, message: 'You do not have access to this report.' });
  }

  const payload = serializeReport(row, { history: historyFor(db, row.id) });
  if (isAdmin) payload.canManage = true;
  res.json({ ok: true, report: payload, canManage: isAdmin });
});

/* ------------------------------------------------------------------ */
/* Waste map data                                                      */
/* ------------------------------------------------------------------ */

router.get('/map/reports', requireAuth, (req, res) => {
  const db = req.db;
  const rows = db.all(REPORT_SELECT + ' ORDER BY r.reported_at DESC');
  res.json({
    ok: true,
    reports: rows.map((r) => ({
      code: r.report_code,
      title: r.title,
      status: r.status,
      statusLabel: STATUS[r.status] ? STATUS[r.status].label : r.status,
      priority: r.priority,
      locality: r.locality,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      reportedAt: r.reported_at,
      image: r.image_url,
      reporter: r.reporter_name,
    })),
    flow: STATUS_FLOW,
  });
});

module.exports = router;
module.exports.historyFor = historyFor;
