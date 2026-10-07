'use strict';

/**
 * /api/notifications - the citizen/admin in-app notification centre.
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** Unread badge count for the top bar. */
router.get('/unread-count', (req, res) => {
  const row = req.db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true, count: row ? row.n : 0 });
});

/** Paginated notification feed for the logged-in user. */
router.get('/', (req, res) => {
  const db = req.db;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const only = req.query.unread === 'true' ? 'AND is_read = 0' : '';

  const rows = db.all(
    `SELECT * FROM notifications WHERE user_id = ? ${only} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [req.user.id, limit, offset]
  );
  const totals = db.get(`SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? ${only}`, [req.user.id]);
  const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);

  res.json({
    ok: true,
    notifications: rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      reportCode: n.report_code,
      link: n.link,
      isRead: !!n.is_read,
      createdAt: n.created_at,
    })),
    total: totals ? totals.total : 0,
    unreadCount: unread ? unread.n : 0,
  });
});

/** Mark one notification as read. */
router.post('/:id/read', (req, res) => {
  const db = req.db;
  db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true, unreadCount: unread ? unread.n : 0 });
});

/** Mark everything as read. */
router.post('/read-all', (req, res) => {
  const db = req.db;
  db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true, message: 'All notifications marked as read.', unreadCount: 0 });
});

/** Remove a single notification. */
router.delete('/:id', (req, res) => {
  req.db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
