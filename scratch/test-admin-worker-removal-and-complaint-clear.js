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
  console.log('--- STARTING ADMIN WORKER REMOVAL & COMPLAINT CLEARING TEST ---\n');

  const uid = Date.now().toString().slice(-4);
  const workerEmail = `worker.remove${uid}@smartwms.gov`;
  const workerCode = `WRK-${uid}`;

  // 1. Admin login
  console.log('1. Admin logs in...');
  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@smartwms.gov',
    password: 'Admin@123',
  });
  assert(adminLogin.status === 200, 'Admin logged in');
  const adminCookie = adminLogin.cookies;

  // 2. Admin adds a worker
  console.log(`2. Admin adds worker ${workerCode}...`);
  const workerCreate = await request(
    'POST',
    '/api/admin/workers',
    {
      name: 'Mohan Lal',
      email: workerEmail,
      phone: '+91 98777 88990',
      password: 'Worker@123',
      employeeCode: workerCode,
      zone: 'West Zone - Rajajinagar',
      vehicle: 'Compactor #KA-02-WM-111',
    },
    adminCookie
  );
  assert(workerCreate.status === 201, 'Worker created by Admin');
  const workerId = workerCreate.data.worker.id;

  // 3. Citizen reports a complaint with photo and location
  console.log('3. Citizen reports waste complaint...');
  const citizenLogin = await request('POST', '/api/auth/login', {
    email: 'priya@example.com',
    password: 'Citizen@123',
  });
  assert(citizenLogin.status === 200, 'Citizen logged in');
  const citizenCookie = citizenLogin.cookies;

  const boundary = '----WebKitFormBoundaryClearTest7MA4YW';
  const dummyJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
  
  const textParts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="title"',
    '',
    'Cleared Roadside Overflow Rubbish',
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    '',
    'Mixed waste dumped along roadside curb.',
    `--${boundary}`,
    'Content-Disposition: form-data; name="address"',
    '',
    '15, 1st Cross, Rajajinagar',
    `--${boundary}`,
    'Content-Disposition: form-data; name="locality"',
    '',
    'Rajajinagar',
    `--${boundary}`,
    'Content-Disposition: form-data; name="latitude"',
    '',
    '12.9904',
    `--${boundary}`,
    'Content-Disposition: form-data; name="longitude"',
    '',
    '77.5529',
    `--${boundary}`,
    'Content-Disposition: form-data; name="reportedAt"',
    '',
    new Date().toISOString().slice(0, 16),
    `--${boundary}`,
    'Content-Disposition: form-data; name="priority"',
    '',
    'medium',
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="road-waste.jpg"',
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

  // 4. Admin assigns the complaint to Mohan
  console.log(`4. Admin assigns ${reportCode} to worker ${workerCode}...`);
  const assignRes = await request(
    'POST',
    `/api/admin/reports/${reportCode}/assign`,
    { workerId: workerId, note: 'Rajajinagar morning route' },
    adminCookie
  );
  assert(assignRes.status === 200, 'Complaint assigned');
  const actionToken = assignRes.data.actionToken;

  // 5. Worker completes the work via email action
  console.log('5. Worker completes work order via email action...');
  const completeRes = await request(
    'POST',
    '/api/worker/email-action',
    { code: reportCode, token: actionToken, action: 'completed' }
  );
  assert(completeRes.status === 200, 'Work order completed via email');

  // 6. Test Non-Admin (Citizen) cannot delete complaint
  console.log('6. Verify Citizen cannot delete complaints...');
  const citizenDeleteAttempt = await request('DELETE', `/api/admin/reports/${reportCode}`, null, citizenCookie);
  assert(citizenDeleteAttempt.status === 403, 'Citizen blocked from deleting complaint (403 Forbidden)');

  // 7. Admin deletes individual complaint
  console.log(`7. Admin deletes complaint #${reportCode}...`);
  const adminDelete = await request('DELETE', `/api/admin/reports/${reportCode}`, null, adminCookie);
  assert(adminDelete.status === 200, 'Admin cleared and deleted complaint successfully');

  // 8. Admin bulk clears all resolved complaints
  console.log('8. Admin clears all resolved complaints...');
  const clearResolvedRes = await request('POST', '/api/admin/reports/clear-resolved', {}, adminCookie);
  assert(clearResolvedRes.status === 200, 'Admin cleared all resolved complaints');
  console.log(`   Result: ${clearResolvedRes.data.message}`);

  // 9. Admin removes the worker
  console.log(`9. Admin removes worker ${workerCode} (ID: ${workerId})...`);
  const workerDeleteRes = await request('DELETE', `/api/admin/workers/${workerId}`, null, adminCookie);
  assert(workerDeleteRes.status === 200, 'Worker removed by Admin successfully');

  // Verify worker no longer exists
  const workersList = await request('GET', '/api/admin/workers', null, adminCookie);
  const stillExists = workersList.data.workers.find((w) => w.id === workerId);
  assert(!stillExists, 'Worker confirmed deleted from database');

  console.log('\n🎉 ALL ADMIN WORKER REMOVAL & COMPLAINT CLEARING TESTS PASSED! 🎉\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
