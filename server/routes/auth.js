'use strict';

/**
 * /api/auth - registration, login, logout, profile management.
 */

const crypto = require('crypto');
const express = require('express');
const { hashPassword, verifyPassword, isEmail, notify, notifyAdmins } = require('../utils/helpers');
const { createSession, destroySession, requireAuth } = require('../middleware/auth');
const { serializeUser, serializeWorker } = require('../utils/serialize');

const router = express.Router();

/** Public profile of the logged-in user + unread notification count + worker profile. */
function mePayload(req) {
  const db = req.db;
  const unread = db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  let worker = null;
  if (req.user.role === 'worker') {
    const w = db.get(
      `SELECT w.*, u.name, u.email, u.phone, u.city, u.active,
              (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status IN ('assigned', 'in_progress')) AS active_tasks,
              (SELECT COUNT(*) FROM reports r WHERE r.assigned_worker_id = w.id AND r.status = 'resolved') AS completed_tasks
         FROM workers w JOIN users u ON u.id = w.user_id WHERE w.user_id = ?`,
      [req.user.id]
    );
    if (w) worker = serializeWorker(w);
  }
  return {
    user: serializeUser(req.user),
    worker,
    unreadNotifications: unread ? unread.n : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Forgot Password                                                     */
/* ------------------------------------------------------------------ */

router.post('/forgot-password', (req, res) => {
  const db = req.db;
  const { email } = req.body || {};

  if (!email || !isEmail(email)) {
    return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.get('SELECT * FROM users WHERE email = ?', [cleanEmail]);

  if (!user || !user.active) {
    return res.status(404).json({ ok: false, message: 'No registered active account found with this email address.' });
  }

  // Generate 6-digit verification code & crypto token
  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const token = crypto.randomBytes(24).toString('hex');
  const now = db.now();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min validity

  // Mark previous unused reset tokens for this user as used
  db.run('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);

  db.run(
    `INSERT INTO password_resets (user_id, token, otp_code, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [user.id, token, otpCode, expiresAt, now]
  );

  // Send in-app notification to the user
  notify(db, user.id, {
    title: 'Password Reset Code',
    message: `Your password reset verification code is: ${otpCode} (valid for 15 minutes).`,
    type: 'warning',
  });

  // Notify administrators
  notifyAdmins(db, {
    title: 'Password Reset Request',
    message: `User ${user.name} (${cleanEmail}) requested a password reset. Verification code: ${otpCode}.`,
    type: 'info',
  });

  res.json({
    ok: true,
    message: `Verification code generated successfully. Use code ${otpCode} to reset your password.`,
    email: cleanEmail,
    otpCode,
    token,
    expiresAt,
  });
});

/* ------------------------------------------------------------------ */
/* Reset Password                                                      */
/* ------------------------------------------------------------------ */

router.post('/reset-password', (req, res) => {
  const db = req.db;
  const { email, otpCode, token, newPassword, confirmPassword } = req.body || {};
  const errors = [];

  if (!email || !isEmail(email)) errors.push('Valid email address is required.');
  if (!otpCode && !token) errors.push('Verification code or reset token is required.');
  if (!newPassword || String(newPassword).length < 6) errors.push('New password must be at least 6 characters long.');
  if (confirmPassword !== undefined && confirmPassword !== newPassword) errors.push('Passwords do not match.');

  if (errors.length) return res.status(400).json({ ok: false, message: errors[0], errors });

  const cleanEmail = String(email).trim().toLowerCase();
  const code = String(otpCode || '').trim();
  const tok = String(token || '').trim();

  // Find reset record
  const reset = db.get(
    `SELECT r.*, u.name, u.email, u.role
     FROM password_resets r
     JOIN users u ON u.id = r.user_id
     WHERE u.email = ? AND (r.otp_code = ? OR r.token = ?) AND r.used = 0
     ORDER BY r.id DESC LIMIT 1`,
    [cleanEmail, code, tok]
  );

  if (!reset) {
    return res.status(400).json({ ok: false, message: 'Invalid or already used verification code. Please request a new code.' });
  }

  if (new Date(reset.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ ok: false, message: 'The verification code has expired (15 minute limit). Please request a new code.' });
  }

  // Hash new password and update user
  const newHash = hashPassword(newPassword);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, reset.user_id]);
  db.run('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);

  // Invalidate any active sessions for security
  db.run('DELETE FROM sessions WHERE user_id = ?', [reset.user_id]);

  // Notify user
  notify(db, reset.user_id, {
    title: 'Password Reset Successful',
    message: 'Your account password has been updated. You can now log in with your new credentials.',
    type: 'success',
  });

  res.json({
    ok: true,
    message: 'Your password has been successfully reset! You can now sign in with your new password.',
  });
});

/* ------------------------------------------------------------------ */
/* Register                                                            */
/* ------------------------------------------------------------------ */

router.post('/register', (req, res) => {
  const db = req.db;
  const { name, email, password, confirmPassword, phone, address, city, role } = req.body || {};
  const errors = [];

  if (!name || String(name).trim().length < 2) errors.push('Please enter your full name.');
  if (!email || !isEmail(email)) errors.push('Please enter a valid email address.');
  if (!password || String(password).length < 6) errors.push('Password must be at least 6 characters long.');
  if (confirmPassword !== undefined && confirmPassword !== password) errors.push('Passwords do not match.');
  if (phone && !/^[0-9+\-\s()]{7,15}$/.test(String(phone).trim())) errors.push('Please enter a valid phone number.');

  const validRoles = ['citizen', 'admin'];
  const userRole = role && validRoles.includes(role) ? role : 'citizen';

  if (errors.length) return res.status(400).json({ ok: false, message: errors[0], errors });

  const cleanEmail = String(email).trim().toLowerCase();
  const existing = db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing) return res.status(409).json({ ok: false, message: 'An account with this email already exists. Please log in instead.' });

  const now = db.now();
  db.run(
    `INSERT INTO users (name, email, phone, password_hash, role, address, city, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [String(name).trim(), cleanEmail, phone ? String(phone).trim() : null, hashPassword(password), userRole, address ? String(address).trim() : null, city ? String(city).trim() : 'Bengaluru', now]
  );
  const id = db.lastId();

  if (userRole === 'admin') {
    notify(db, id, {
      title: 'Administrator Account Created',
      message: 'Welcome Administrator! You have full access to manage complaints, users, view the waste map and analytics.',
      type: 'success',
    });
  } else {
    notify(db, id, {
      title: 'Welcome to Smart Waste Management',
      message: 'Your citizen account is ready. Report waste in your locality and track it until it is resolved by the administrator.',
      type: 'success',
    });
    // Notify administrators that a new citizen has registered
    notifyAdmins(db, {
      title: 'New Citizen Registered',
      message: `Citizen ${String(name).trim()} (${cleanEmail}) joined the system.`,
      type: 'info',
      link: '#/admin/users',
    });
  }

  createSession(db, res, id);
  const user = db.get('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json({ ok: true, message: 'Account created successfully.', ...mePayload({ db, user }) });
});

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

router.post('/login', (req, res) => {
  const db = req.db;
  const { email, password } = req.body || {};

  if (!email || !password) return res.status(400).json({ ok: false, message: 'Email and password are required.' });

  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.get('SELECT * FROM users WHERE email = ?', [cleanEmail]);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ ok: false, message: 'Invalid email or password. Please try again.' });
  }
  if (!user.active) return res.status(403).json({ ok: false, message: 'This account has been deactivated. Contact the administrator.' });

  createSession(db, res, user.id);
  res.json({ ok: true, message: `Welcome back, ${user.name.split(' ')[0]}!`, ...mePayload({ db, user }) });
});

/* ------------------------------------------------------------------ */
/* Logout / current user                                               */
/* ------------------------------------------------------------------ */

router.post('/logout', (req, res) => {
  destroySession(req.db, req, res);
  res.json({ ok: true, message: 'You have been logged out.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, ...mePayload(req) });
});

/* ------------------------------------------------------------------ */
/* Profile update                                                      */
/* ------------------------------------------------------------------ */

router.put('/me', requireAuth, (req, res) => {
  const db = req.db;
  const { name, phone, address, city, currentPassword, newPassword } = req.body || {};

  if (name !== undefined && String(name).trim().length < 2) {
    return res.status(400).json({ ok: false, message: 'Name must be at least 2 characters.' });
  }
  if (phone && !/^[0-9+\-\s()]{7,15}$/.test(String(phone).trim())) {
    return res.status(400).json({ ok: false, message: 'Please enter a valid phone number.' });
  }

  // Password change requires the current password.
  if (newPassword) {
    if (String(newPassword).length < 6) return res.status(400).json({ ok: false, message: 'New password must be at least 6 characters.' });
    if (!currentPassword || !verifyPassword(currentPassword, req.user.password_hash)) {
      return res.status(400).json({ ok: false, message: 'Current password is incorrect.' });
    }
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
    // Keep other sessions valid but drop the current one for safety? We keep it simple: stay logged in.
  }

  db.run('UPDATE users SET name = ?, phone = ?, address = ?, city = ? WHERE id = ?', [
    name !== undefined ? String(name).trim() : req.user.name,
    phone !== undefined ? (phone ? String(phone).trim() : null) : req.user.phone,
    address !== undefined ? (address ? String(address).trim() : null) : req.user.address,
    city !== undefined ? (city ? String(city).trim() : null) : req.user.city,
    req.user.id,
  ]);

  const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true, message: 'Profile updated successfully.', user: serializeUser(user) });
});

module.exports = router;
