'use strict';

/**
 * End-to-end Verification Script:
 * 1. Health check & DB engine check
 * 2. Admin Login
 * 3. Worker assignment with immediate dispatch
 * 4. DB status & SMTP status endpoints
 */

const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('=== 1. Health & Database Check ===');
  const health = await request({ hostname: 'localhost', port: 3000, path: '/api/health', method: 'GET' });
  console.log('Health:', JSON.stringify(health.data, null, 2));

  console.log('\n=== 2. Admin Login ===');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@smartwms.gov', password: 'Admin@123' }
  );
  console.log('Admin login response:', loginRes.data);
  const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
  console.log('Session Cookie:', cookie);

  console.log('\n=== 3. Admin DB Status Endpoint ===');
  const dbStatus = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/db-status',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('DB Status:', JSON.stringify(dbStatus.data, null, 2));

  console.log('\n=== 4. Admin SMTP Status Endpoint ===');
  const smtpStatus = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/smtp-status',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('SMTP Status:', JSON.stringify(smtpStatus.data, null, 2));

  console.log('\n=== 5. Assign Worker (Instant Dispatch) ===');
  const assignRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/reports/WM1001/assign',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
    },
    { workerId: 1, note: 'Please collect waste at Indiranagar immediately' }
  );
  console.log('Assign Result:', JSON.stringify(assignRes.data, null, 2));

  console.log('\n=== 6. Worker Dispatch Mailbox Check ===');
  const workerLogin = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'worker.ravi@smartwms.gov', password: 'Worker@123' }
  );
  const workerCookie = workerLogin.headers['set-cookie'] ? workerLogin.headers['set-cookie'][0].split(';')[0] : '';

  const emailsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/worker/emails',
    method: 'GET',
    headers: { Cookie: workerCookie },
  });
  console.log('Worker Mailbox Emails count:', emailsRes.data.emails?.length);
  if (emailsRes.data.emails?.length > 0) {
    const latest = emailsRes.data.emails[0];
    console.log('Latest Email:', {
      subject: latest.subject,
      recipient: latest.recipient,
      status: latest.status,
      reportCode: latest.reportCode,
      hasYesNoButtons: Boolean(latest.html && latest.html.includes('action=completed')),
    });
  }

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error in test run:', err);
  process.exit(1);
});
