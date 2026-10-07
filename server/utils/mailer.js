'use strict';

/**
 * Mailer service: handles email notifications to workers for task assignments,
 * containing full complainant details, exact GPS coordinates, map navigation,
 * live vehicle tracking links, and one-click "Yes / No" work completion action links.
 *
 * Supports real Gmail SMTP dispatch via nodemailer (using GMAIL_USER and GMAIL_APP_PASSWORD)
 * with instant delivery and graceful fallback to in-app dispatch mailbox.
 */

const crypto = require('crypto');
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

/**
 * Create a nodemailer transporter for Gmail / SMTP if configured in environment.
 */
function createTransporter() {
  if (!nodemailer) return null;

  const gmailUser = (process.env.GMAIL_USER || process.env.ADMIN_GMAIL || process.env.SMTP_USER || '').trim();
  let gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS || '').trim();
  const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const smtpPort = Number(process.env.SMTP_PORT || 465);

  if (gmailUser && gmailPass) {
    // Remove all whitespace from Google App Passwords (e.g. "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
    gmailPass = gmailPass.replace(/\s+/g, '');

    const isGmail = !process.env.SMTP_HOST || smtpHost.includes('gmail.com');

    if (isGmail) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });
    }

    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return null;
}

function isSmtpConfigured() {
  return Boolean(
    nodemailer
    && (process.env.GMAIL_USER || process.env.ADMIN_GMAIL || process.env.SMTP_USER)
    && (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS)
  );
}

/**
 * Generate a styled HTML work order email for the assigned worker.
 */
function buildAssignmentEmailHtml({
  workerName,
  workerCode,
  reportCode,
  title,
  description,
  priority,
  citizenName,
  citizenPhone,
  citizenAddress,
  wasteAddress,
  locality,
  latitude,
  longitude,
  adminName = 'Municipal Waste Administrator',
  adminEmail = 'admin@smartwms.gov',
  adminNote,
  actionToken,
  baseUrl = 'http://localhost:3000',
}) {
  const mapDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  const liveTrackingUrl = `${baseUrl}/#/reports/${reportCode}`;
  const yesActionUrl = `${baseUrl}/#/worker/action?code=${reportCode}&token=${actionToken}&action=completed`;
  const noActionUrl = `${baseUrl}/#/worker/action?code=${reportCode}&token=${actionToken}&action=in_progress`;
  const viewTaskUrl = `${baseUrl}/#/worker/tasks`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SmartWMS Work Order #${reportCode} - Municipal Dispatch</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 22px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); color: #ffffff; padding: 28px 32px; text-align: left; }
    .header-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #ccfbf1; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0; font-size: 13.5px; color: #e6fffa; }
    .from-pill { display: inline-block; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; padding: 3px 8px; font-size: 11.5px; margin-top: 8px; color: #ffffff; }
    .badge { display: inline-block; padding: 4px 11px; border-radius: 9999px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; background: #fef3c7; color: #92400e; margin-top: 10px; }
    .badge.high { background: #fee2e2; color: #b91c1c; }
    .badge.urgent { background: #fecdd3; color: #9f1239; }
    .content { padding: 26px 32px; }
    .greeting { font-size: 14.5px; margin-bottom: 18px; color: #334155; line-height: 1.5; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.06em; margin: 22px 0 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
    .kv-row { display: flex; margin-bottom: 8px; font-size: 13.5px; }
    .kv-row:last-child { margin-bottom: 0; }
    .kv-label { width: 140px; color: #64748b; font-weight: 600; flex-shrink: 0; }
    .kv-val { color: #0f172a; font-weight: 500; }
    .kv-val a { color: #0f766e; text-decoration: none; font-weight: 600; }
    .btn { display: inline-block; padding: 11px 20px; border-radius: 8px; font-weight: 700; font-size: 13.5px; text-decoration: none; text-align: center; margin-right: 8px; margin-bottom: 8px; }
    .btn-yes { background-color: #059669; color: #ffffff !important; }
    .btn-no { background-color: #e2e8f0; color: #334155 !important; }
    .btn-map { background-color: #0284c7; color: #ffffff !important; }
    .btn-track { background-color: #7c3aed; color: #ffffff !important; }
    .action-box { background: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .action-box h3 { margin: 0 0 6px; font-size: 15.5px; color: #065f46; font-weight: 700; }
    .action-box p { margin: 0 0 16px; font-size: 13px; color: #047857; }
    .footer { background: #f8fafc; padding: 18px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-top">
        <span>♻️ Municipal Corporation · Field Dispatch</span>
        <span class="from-pill">From Admin Gmail: ${adminEmail}</span>
      </div>
      <h1>Work Order #${reportCode}</h1>
      <p>Assigned to Field Worker: <strong>${workerName} (${workerCode})</strong></p>
      <span class="badge ${priority}">${priority.toUpperCase()} PRIORITY</span>
    </div>

    <div class="content">
      <div class="greeting">
        Hello <strong>${workerName}</strong>,<br />
        Municipal Administrator <strong>${adminName}</strong> has assigned you a waste collection work order from the Admin Portal.
        Please review the complaint details, citizen contact info, and exact GPS coordinates below.
      </div>

      <div class="section-title">🗑️ Waste Complaint Details</div>
      <div class="info-card">
        <div class="kv-row"><div class="kv-label">Complaint Code:</div><div class="kv-val"><strong>#${reportCode}</strong></div></div>
        <div class="kv-row"><div class="kv-label">Title:</div><div class="kv-val"><strong>${title}</strong></div></div>
        <div class="kv-row"><div class="kv-label">Description:</div><div class="kv-val">${description}</div></div>
        ${adminNote ? `<div class="kv-row"><div class="kv-label">Admin Instructions:</div><div class="kv-val" style="color:#0f766e"><em>"${adminNote}"</em></div></div>` : ''}
      </div>

      <div class="section-title">👤 Citizen / Complainant Details</div>
      <div class="info-card">
        <div class="kv-row"><div class="kv-label">Citizen Name:</div><div class="kv-val"><strong>${citizenName}</strong></div></div>
        <div class="kv-row"><div class="kv-label">Contact Phone:</div><div class="kv-val"><a href="tel:${citizenPhone}">📞 ${citizenPhone || 'Not provided'}</a></div></div>
        <div class="kv-row"><div class="kv-label">Citizen Address:</div><div class="kv-val">${citizenAddress || 'Same as site address'}</div></div>
      </div>

      <div class="section-title">📍 Waste Site Location &amp; Automatic GPS Navigation</div>
      <div class="info-card">
        <div class="kv-row"><div class="kv-label">Street Address:</div><div class="kv-val"><strong>${wasteAddress}</strong></div></div>
        <div class="kv-row"><div class="kv-label">Locality / Zone:</div><div class="kv-val">${locality || 'Indiranagar / Metro'}</div></div>
        <div class="kv-row"><div class="kv-label">GPS Coordinates:</div><div class="kv-val"><code>${latitude}, ${longitude}</code></div></div>
      </div>

      <div style="text-align:center;margin:18px 0;display:flex;justify-content:center;gap:10px;flex-wrap:wrap">
        <a class="btn btn-map" href="${mapDirectionsUrl}" target="_blank">
          📍 Open Live Google Maps
        </a>
        <a class="btn btn-track" href="${liveTrackingUrl}" target="_blank">
          🚚 Live Vehicle GPS Tracking
        </a>
      </div>

      <div class="action-box">
        <h3>⚡ Did you complete this collection work?</h3>
        <p>After clearing the waste from the location, click Yes below to mark the work completed and notify the citizen &amp; administrator.</p>
        <div>
          <a class="btn btn-yes" href="${yesActionUrl}" target="_blank">
            ✅ YES &mdash; I Completed the Work
          </a>
          <a class="btn btn-no" href="${noActionUrl}" target="_blank">
            ⏳ NO &mdash; Still in Progress
          </a>
        </div>
      </div>

      <div style="font-size:12px;color:#64748b;text-align:center">
        You can also manage this task in the <a href="${viewTaskUrl}" style="color:#0f766e;font-weight:600">SmartWMS Worker Dashboard</a>.
      </div>
    </div>

    <div class="footer">
      Smart Waste Management System &middot; Municipal Sanitation Department<br />
      This automated dispatch was sent from Admin Gmail: <strong>${adminEmail}</strong> to Worker: <strong>${workerCode}</strong>.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Dispatches an email notification to the worker and saves a record in the database.
 * Dispatches immediately to the worker's inbox.
 */
async function sendWorkerAssignmentEmail(db, {
  workerEmail,
  workerName,
  workerCode,
  report,
  citizen,
  adminUser = null,
  adminNote = '',
  baseUrl = 'http://localhost:3000',
}) {
  const actionToken = crypto.randomBytes(24).toString('hex');
  const reportCode = report.report_code || report.code;
  const subject = `📋 [SmartWMS Work Order] New Task Assigned: #${reportCode} - ${report.title}`;

  const adminName = (adminUser && adminUser.name) || process.env.ADMIN_NAME || 'Municipal Chief Administrator';
  const adminEmail = (adminUser && adminUser.email) || process.env.GMAIL_USER || process.env.ADMIN_GMAIL || 'admin@smartwms.gov';

  const bodyHtml = buildAssignmentEmailHtml({
    workerName,
    workerCode,
    reportCode,
    title: report.title,
    description: report.description,
    priority: report.priority || 'medium',
    citizenName: citizen ? citizen.name : 'Citizen',
    citizenPhone: citizen ? citizen.phone : 'N/A',
    citizenAddress: citizen ? (citizen.address || citizen.reporter_address || report.address) : report.address,
    wasteAddress: report.address,
    locality: report.locality,
    latitude: report.latitude,
    longitude: report.longitude,
    adminName,
    adminEmail,
    adminNote,
    actionToken,
    baseUrl,
  });

  const bodyText = `
[SmartWMS Municipal Work Order #${reportCode}]
From Admin: ${adminName} <${adminEmail}>
Assigned Worker: ${workerName} (${workerCode}) <${workerEmail}>
Priority: ${(report.priority || 'medium').toUpperCase()}

--- TASK DETAILS ---
Title: ${report.title}
Description: ${report.description}
Admin Note: ${adminNote || 'None'}

--- CITIZEN (COMPLAINANT) DETAILS ---
Name: ${citizen ? citizen.name : 'Citizen'}
Phone: ${citizen ? (citizen.phone || 'N/A') : 'N/A'}
Address: ${citizen ? (citizen.address || report.address) : report.address}

--- LOCATION & GPS NAVIGATION ---
Address: ${report.address} (${report.locality || ''})
Coordinates: ${report.latitude}, ${report.longitude}
Google Maps: https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}
Live Vehicle Tracking: ${baseUrl}/#/reports/${reportCode}

--- WORK COMPLETION ACTION ---
Did you complete this collection work?
[YES - I Completed the Work]: ${baseUrl}/#/worker/action?code=${reportCode}&token=${actionToken}&action=completed
[NO - Still In Progress]: ${baseUrl}/#/worker/action?code=${reportCode}&token=${actionToken}&action=in_progress
  `.trim();

  const smtpConfigured = isSmtpConfigured();
  const nowIso = db.now ? db.now() : new Date().toISOString();

  // Save dispatch record to database
  db.run(
    `INSERT INTO emails (recipient, recipient_name, subject, body_text, body_html, template, report_code, action_token, status, sent_at)
     VALUES (?, ?, ?, ?, ?, 'assignment', ?, ?, ?, ?)`,
    [
      workerEmail,
      workerName,
      subject,
      bodyText,
      bodyHtml,
      reportCode,
      actionToken,
      smtpConfigured ? 'pending' : 'in_app_only',
      nowIso,
    ]
  );
  const emailId = db.lastId ? db.lastId() : null;

  console.log('\n================================================================');
  console.log(`[WORKER DISPATCH INITIATED] Admin (${adminEmail}) assigned #${reportCode} to worker ${workerName} <${workerEmail}>`);
  console.log(`📌  Subject: ${subject}`);
  console.log(`📍  Location: ${report.address} (${report.latitude}, ${report.longitude})`);
  console.log(`👤  Complainant: ${citizen ? citizen.name : 'Citizen'} (${citizen?.phone || 'No phone'})`);
  console.log(`📧  SMTP Configured: ${smtpConfigured ? 'YES (Sending real email via Gmail/SMTP now)' : 'NO (Available in-app mailbox)'}`);
  console.log('================================================================\n');

  let deliveryResult = {
    ok: !smtpConfigured,
    deliveryStatus: smtpConfigured ? 'pending' : 'in_app_only',
    message: smtpConfigured ? 'Dispatch initiated' : 'Saved to worker in-app mailbox (configure GMAIL_USER & GMAIL_APP_PASSWORD in .env for real email)',
  };

  if (smtpConfigured) {
    try {
      deliveryResult = await deliverEmail(db, emailId, {
        from: `"${adminName}" <${adminEmail}>`,
        to: `"${workerName}" <${workerEmail}>`,
        subject,
        text: bodyText,
        html: bodyHtml,
        reportCode,
        workerName,
        workerEmail,
        adminEmail,
        citizen,
        report,
        actionToken,
        baseUrl,
      });
    } catch (err) {
      console.error('[mailer] Error delivering assignment email:', err.message);
      deliveryResult = { ok: false, deliveryStatus: 'failed', message: err.message };
    }
  }

  return {
    emailId,
    actionToken,
    subject,
    sender: adminEmail,
    recipient: workerEmail,
    sentAt: nowIso,
    smtpConfigured,
    deliveryStatus: deliveryResult.deliveryStatus,
    deliveryMessage: deliveryResult.message,
    ok: deliveryResult.ok,
  };
}

/**
 * Execute delivery of the email record via Nodemailer Gmail transport.
 */
async function deliverEmail(db, emailId, meta) {
  const nowIso = db.now ? db.now() : new Date().toISOString();

  const transporter = createTransporter();
  let deliveryStatus = 'in_app_only';
  let errorMessage = null;

  if (!transporter) {
    console.warn('[mailer] SMTP is not configured. Configure GMAIL_USER and GMAIL_APP_PASSWORD in .env to send real emails.');
  } else if (meta && meta.to) {
    try {
      const fromAddress = meta.from || `"Municipal Waste Administrator" <${process.env.GMAIL_USER || 'admin@smartwms.gov'}>`;
      const info = await transporter.sendMail({
        from: fromAddress,
        to: meta.to,
        subject: meta.subject,
        text: meta.text,
        html: meta.html,
      });
      console.log(`📬 [REAL GMAIL DELIVERED via SMTP] To: ${meta.to} | MessageId: ${info.messageId}`);
      deliveryStatus = 'sent';
    } catch (smtpErr) {
      deliveryStatus = 'failed';
      errorMessage = smtpErr.message;
      console.error(`❌ [mailer] SMTP delivery failed for ${meta.workerEmail || meta.to}:`, smtpErr.message);
    }
  }

  if (emailId) {
    db.run('UPDATE emails SET status = ?, sent_at = ? WHERE id = ?', [deliveryStatus, nowIso, emailId]);
  }

  return {
    ok: deliveryStatus === 'sent' || deliveryStatus === 'in_app_only',
    deliveredAt: nowIso,
    deliveryStatus,
    error: errorMessage,
    message: deliveryStatus === 'sent'
      ? 'Email successfully delivered to worker inbox via Gmail SMTP.'
      : deliveryStatus === 'in_app_only'
        ? 'SMTP is not configured in .env. The work order is available in the worker portal mailbox.'
        : `Email delivery failed: ${errorMessage}. Check your Gmail App Password in .env.`,
  };
}

/**
 * Force deliver an email immediately by ID or Action Token
 */
async function forceDeliverEmail(db, emailIdOrToken) {
  const email = db.get(
    'SELECT * FROM emails WHERE id = ? OR action_token = ?',
    [emailIdOrToken, emailIdOrToken]
  );
  if (!email) return { ok: false, message: 'Email record not found.' };

  const report = db.get('SELECT * FROM reports WHERE report_code = ?', [email.report_code]) || {};
  const citizen = report.user_id ? db.get('SELECT * FROM users WHERE id = ?', [report.user_id]) : { name: 'Citizen' };

  return deliverEmail(db, email.id, {
    from: `"Municipal Waste Administrator" <${process.env.GMAIL_USER || process.env.ADMIN_GMAIL || 'admin@smartwms.gov'}>`,
    to: `"${email.recipient_name || 'Worker'}" <${email.recipient}>`,
    subject: email.subject,
    text: email.body_text,
    html: email.body_html,
    reportCode: email.report_code,
    workerName: email.recipient_name,
    workerEmail: email.recipient,
    adminEmail: process.env.GMAIL_USER || 'admin@smartwms.gov',
    citizen,
    report,
    actionToken: email.action_token,
    baseUrl: 'http://localhost:3000',
  });
}

/**
 * Test SMTP connection and optionally send a test email.
 */
async function testSmtpConnection(testRecipient = null) {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      ok: false,
      configured: false,
      message: 'SMTP credentials missing. Please set GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.',
    };
  }

  try {
    await transporter.verify();
    
    let emailSent = false;
    if (testRecipient) {
      const fromUser = process.env.GMAIL_USER || 'admin@smartwms.gov';
      await transporter.sendMail({
        from: `"SmartWMS Admin" <${fromUser}>`,
        to: testRecipient,
        subject: '🧪 [SmartWMS] Test Email & SMTP Verification',
        text: 'Hello! This is a test email from the Smart Waste Management System. Your Gmail SMTP configuration is working perfectly!',
        html: `
          <div style="font-family:sans-serif;padding:20px;border:1px solid #10b981;border-radius:8px;background:#f0fdf4">
            <h2 style="color:#047857;margin-top:0">♻️ SmartWMS Mailer Test Successful</h2>
            <p>Your Gmail SMTP connection is properly configured and actively sending emails.</p>
            <p><strong>Admin Sender:</strong> ${fromUser}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
        `,
      });
      emailSent = true;
    }

    return {
      ok: true,
      configured: true,
      user: process.env.GMAIL_USER,
      emailSent,
      message: emailSent
        ? `SMTP verified and test email sent to ${testRecipient}.`
        : 'SMTP credentials verified successfully with Google mail server.',
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      user: process.env.GMAIL_USER,
      error: err.message,
      message: `SMTP verification failed: ${err.message}. Make sure you generated a 16-character Google App Password with 2-Step Verification enabled.`,
    };
  }
}

/**
 * Flush or deliver any uncompleted email rows on startup
 */
function resumeScheduledEmails(db) {
  const pending = db.all("SELECT id FROM emails WHERE status = 'scheduled' OR status = 'pending'");
  if (!pending || !pending.length) return { resumed: 0 };

  pending.forEach((row) => {
    forceDeliverEmail(db, row.id).catch((err) => {
      console.error(`[mailer] Failed to deliver pending email #${row.id}:`, err.message);
    });
  });

  return { resumed: pending.length };
}

module.exports = {
  buildAssignmentEmailHtml,
  sendWorkerAssignmentEmail,
  deliverEmail,
  forceDeliverEmail,
  testSmtpConnection,
  createTransporter,
  isSmtpConfigured,
  resumeScheduledEmails,
};
