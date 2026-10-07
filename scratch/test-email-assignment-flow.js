'use strict';

const http = require('http');

const PORT = 3000;

function request(method, path, body = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };
    if (cookies) {
      headers['Cookie'] = cookies;
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path,
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
          const setCookie = res.headers['set-cookie'] || [];
          resolve({
            status: res.statusCode,
            data: json,
            cookies: setCookie.map((c) => c.split(';')[0]).join('; '),
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ Assertion failed:', message);
    process.exit(1);
  }
  console.log('✅ ' + message);
}

async function runTests() {
  console.log('--- STARTING WORKER EMAIL NOTIFICATION & YES/NO ACTION TEST ---\n');

  const uid = Date.now().toString().slice(-4);
  const workerEmail = `worker.mail${uid}@smartwms.gov`;
  const workerCode = `WRK-${uid}`;

  // 1. Admin login
  console.log('1. Admin logs in...');
  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@smartwms.gov',
    password: 'Admin@123',
  });
  assert(adminLogin.status === 200, 'Admin login succeeds');
  const adminCookie = adminLogin.cookies;

  // 2. Admin adds worker
  console.log(`2. Admin creates field worker: ${workerEmail} (${workerCode})...`);
  const workerCreate = await request(
    'POST',
    '/api/admin/workers',
    {
      name: 'Karan Malhotra',
      email: workerEmail,
      phone: '+91 98444 55667',
      password: 'Worker@123',
      employeeCode: workerCode,
      zone: 'South Zone - Koramangala',
      vehicle: 'Tipper Truck #KA-05-WM-305',
      specialization: 'Commercial Waste Collection',
    },
    adminCookie
  );
  assert(workerCreate.status === 201, 'Worker created by Admin');
  const workerId = workerCreate.data.worker.id;

  // 3. Citizen logs in and reports waste
  console.log('3. Citizen logs in and reports waste...');
  const citizenLogin = await request('POST', '/api/auth/login', {
    email: 'priya@example.com',
    password: 'Citizen@123',
  });
  assert(citizenLogin.status === 200, 'Citizen login succeeds');
  const citizenCookie = citizenLogin.cookies;

  const boundary = '----WebKitFormBoundaryEmailTest7MA4YW';
  const dummyJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
  
  const textParts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="title"',
    '',
    'Marketplace plastic garbage pile',
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    '',
    'Large collection of packaging crates and mixed organic refuse behind supermarket.',
    `--${boundary}`,
    'Content-Disposition: form-data; name="address"',
    '',
    '45, 80 Feet Road, 4th Block, Koramangala',
    `--${boundary}`,
    'Content-Disposition: form-data; name="locality"',
    '',
    'Koramangala',
    `--${boundary}`,
    'Content-Disposition: form-data; name="latitude"',
    '',
    '12.9348',
    `--${boundary}`,
    'Content-Disposition: form-data; name="longitude"',
    '',
    '77.6256',
    `--${boundary}`,
    'Content-Disposition: form-data; name="reportedAt"',
    '',
    new Date().toISOString().slice(0, 16),
    `--${boundary}`,
    'Content-Disposition: form-data; name="priority"',
    '',
    'high',
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="market-waste.jpg"',
    'Content-Type: image/jpeg',
    '',
    '',
  ].join('\r\n');

  const textBuf = Buffer.from(textParts, 'utf8');
  const endBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const multipartBody = Buffer.concat([textBuf, dummyJpg, endBuf]);

  const reportRes = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/reports',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length,
          'Cookie': citizenCookie,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, data: { raw: data } }); }
        });
      }
    );
    req.on('error', reject);
    req.write(multipartBody);
    req.end();
  });
  assert(reportRes.status === 201, 'Waste report created');
  const reportCode = reportRes.data.report.code;
  console.log(`   Complaint code generated: ${reportCode}`);

  // 4. Admin assigns the complaint to Worker Karan
  console.log(`\n4. Admin assigns complaint ${reportCode} to worker ${workerCode}...`);
  const assignRes = await request(
    'POST',
    `/api/admin/reports/${reportCode}/assign`,
    {
      workerId: workerId,
      note: 'Clear market alley and sanitize surrounding curb.',
    },
    adminCookie
  );
  assert(assignRes.status === 200, 'Complaint assigned');
  assert(assignRes.data.emailSentTo === workerEmail, 'Email dispatched to worker email');
  const actionToken = assignRes.data.actionToken;
  assert(!!actionToken, 'Email action token generated');

  // 5. Worker logs in
  console.log('\n5. Worker logs in...');
  const workerLogin = await request('POST', '/api/auth/login', {
    email: workerEmail,
    password: 'Worker@123',
  });
  assert(workerLogin.status === 200, 'Worker login succeeds');
  const workerCookie = workerLogin.cookies;

  // 6. Verify NO in-app task notification for worker (as requested: notification goes to MAIL, not from app)
  console.log('6. Verify worker received NO in-app notification (mail only)...');
  const workerNotifs = await request('GET', '/api/notifications', null, workerCookie);
  const inAppTaskNotif = (workerNotifs.data.notifications || []).find((n) => n.reportCode === reportCode);
  assert(!inAppTaskNotif, 'Worker has NO in-app assignment notification (delivered to mail only)');

  // 7. Verify Worker Mailbox has the dispatch email with all details
  console.log('\n7. Worker checks dispatch mailbox (/api/worker/emails)...');
  const workerEmails = await request('GET', '/api/worker/emails', null, workerCookie);
  assert(workerEmails.status === 200, 'Worker emails retrieved');
  const dispatchEmail = workerEmails.data.emails.find((e) => e.report_code === reportCode);
  assert(!!dispatchEmail, 'Dispatch email found in worker mailbox');
  assert(dispatchEmail.body_text.includes('Priya Sharma'), 'Email includes complainant citizen name');
  assert(dispatchEmail.body_text.includes('12.9348, 77.6256'), 'Email includes exact GPS coordinates');
  assert(dispatchEmail.body_text.includes('45, 80 Feet Road'), 'Email includes street address');
  assert(dispatchEmail.body_text.includes('action=completed'), 'Email includes YES completion action link');
  assert(dispatchEmail.body_text.includes('action=in_progress'), 'Email includes NO in-progress action link');
  console.log(`   Email Subject: "${dispatchEmail.subject}"`);

  // 8. Test Email Preview Endpoint
  console.log('\n8. Check email HTML preview endpoint...');
  const previewRes = await request('GET', `/api/worker/email-preview/${actionToken}`);
  assert(previewRes.status === 200, 'Email HTML preview rendered');

  // 9. Worker clicks "YES - I completed the work" from the email
  console.log('\n9. Worker triggers "YES - I completed the work" via email action link...');
  const actionRes = await request(
    'POST',
    '/api/worker/email-action',
    {
      code: reportCode,
      token: actionToken,
      action: 'completed',
      note: 'Site cleared and organic waste transferred to Koramangala processing center.',
    }
  );
  assert(actionRes.status === 200, 'Email action succeeded');
  assert(actionRes.data.action === 'resolved', 'Task status set to resolved via email');
  assert(actionRes.data.report.status === 'resolved', 'Report status confirmed resolved');

  // 10. Verify Citizen received resolution notification
  console.log('\n10. Checking Citizen in-app notification...');
  const citizenNotifs = await request('GET', '/api/notifications', null, citizenCookie);
  const citizenNotif = citizenNotifs.data.notifications.find(
    (n) => n.reportCode === reportCode && n.title.includes('Resolved')
  );
  assert(!!citizenNotif, 'Citizen received resolution notification');
  console.log(`   Citizen notification: "${citizenNotif.title}" - ${citizenNotif.message}`);

  // 11. Verify Admin received completion notification
  console.log('\n11. Checking Admin in-app notification...');
  const adminNotifs = await request('GET', '/api/notifications', null, adminCookie);
  const adminNotif = adminNotifs.data.notifications.find(
    (n) => n.reportCode === reportCode && (n.title.includes('Completed') || n.title.includes('Resolved'))
  );
  assert(!!adminNotif, 'Admin received completion notification from worker');
  console.log(`   Admin notification: "${adminNotif.title}" - ${adminNotif.message}`);

  console.log('\n🎉 ALL WORKER EMAIL NOTIFICATION & YES/NO ACTION TESTS PASSED! 🎉\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
