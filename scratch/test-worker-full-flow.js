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
  console.log('--- STARTING WORKER FLOW INTEGRATION TESTS ---\n');
  const uid = Date.now().toString().slice(-4);
  const workerEmail = `worker.test${uid}@smartwms.gov`;
  const workerCode = `WRK-${uid}`;

  // Step 1: Admin logs in
  console.log('1. Admin login...');
  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@smartwms.gov',
    password: 'Admin@123',
  });
  assert(adminLogin.status === 200, 'Admin login succeeds');
  assert(adminLogin.data.user.role === 'admin', 'Admin role verified');
  const adminCookie = adminLogin.cookies;

  // Step 2: Admin adds a new worker
  console.log(`\n2. Admin adds a new field worker (${workerCode} / ${workerEmail})...`);
  const newWorker = await request(
    'POST',
    '/api/admin/workers',
    {
      name: 'Deepak Rao',
      email: workerEmail,
      phone: '+91 98333 44556',
      password: 'Worker@123',
      employeeCode: workerCode,
      zone: 'North Zone - Malleshwaram',
      vehicle: 'Mini Compactor #KA-04-WM-501',
      specialization: 'Organic & Solid Waste',
      status: 'active',
    },
    adminCookie
  );
  assert(newWorker.status === 201, 'Worker created by Admin successfully');
  assert(newWorker.data.worker.code === workerCode, 'Worker employee code verified');
  const workerId = newWorker.data.worker.id;

  // Step 3: Check worker list from admin
  console.log('\n3. Admin lists workers...');
  const workersList = await request('GET', '/api/admin/workers', null, adminCookie);
  assert(workersList.status === 200, 'Worker list retrieved');
  const foundWorker = workersList.data.workers.find((w) => w.code === workerCode);
  assert(!!foundWorker, 'Newly created worker is in the admin worker list');

  // Step 4: Citizen logs in and reports waste
  console.log('\n4. Citizen logs in and reports waste with photo & GPS...');
  const citizenLogin = await request('POST', '/api/auth/login', {
    email: 'priya@example.com',
    password: 'Citizen@123',
  });
  assert(citizenLogin.status === 200, 'Citizen login succeeds');
  const citizenCookie = citizenLogin.cookies;

  const boundary = '----WebKitFormBoundaryWorkerTest7MA4YW';
  const dummyJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
  
  const textParts = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="title"',
    '',
    'Illegal plastic dumping near bus stand',
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    '',
    'Multiple sacks of plastic waste dumped overnight on pedestrian footpath.',
    `--${boundary}`,
    'Content-Disposition: form-data; name="address"',
    '',
    'Near Malleshwaram 8th Cross Bus Stand',
    `--${boundary}`,
    'Content-Disposition: form-data; name="locality"',
    '',
    'Malleshwaram',
    `--${boundary}`,
    'Content-Disposition: form-data; name="latitude"',
    '',
    '13.0031',
    `--${boundary}`,
    'Content-Disposition: form-data; name="longitude"',
    '',
    '77.5684',
    `--${boundary}`,
    'Content-Disposition: form-data; name="reportedAt"',
    '',
    new Date().toISOString().slice(0, 16),
    `--${boundary}`,
    'Content-Disposition: form-data; name="priority"',
    '',
    'high',
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="waste-photo.jpg"',
    'Content-Type: image/jpeg',
    '',
    '',
  ].join('\r\n');

  const textBuf = Buffer.from(textParts, 'utf8');
  const endBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const multipartBody = Buffer.concat([textBuf, dummyJpg, endBuf]);

  const newReport = await new Promise((resolve, reject) => {
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

  assert(newReport.status === 201, 'Waste report created with photo and GPS');
  const reportCode = newReport.data.report.code;
  console.log(`   Complaint code generated: ${reportCode}`);

  // Step 5: Admin assigns complaint to Worker Deepak
  console.log('\n5. Admin assigns complaint to worker...');
  const assignRes = await request(
    'POST',
    `/api/admin/reports/${reportCode}/assign`,
    {
      workerId: workerId,
      note: 'Priority Malleshwaram morning route dispatch.',
    },
    adminCookie
  );
  assert(assignRes.status === 200, 'Complaint assigned to worker');
  assert(assignRes.data.report.status === 'assigned', 'Report status changed to assigned');
  assert(assignRes.data.report.worker.code === workerCode, 'Assigned worker matches');

  // Step 6: Worker logs in with credentials
  console.log('\n6. Field worker logs in...');
  const workerLogin = await request('POST', '/api/auth/login', {
    email: workerEmail,
    password: 'Worker@123',
  });
  assert(workerLogin.status === 200, 'Worker login succeeds');
  assert(workerLogin.data.user.role === 'worker', 'Worker role verified');
  const workerCookie = workerLogin.cookies;

  // Step 7: Worker checks notifications for new assignment
  console.log('\n7. Worker checks notifications for assigned task...');
  const workerNotifs = await request('GET', '/api/notifications', null, workerCookie);
  assert(workerNotifs.status === 200, 'Worker notifications retrieved');
  const taskNotif = workerNotifs.data.notifications.find((n) => n.reportCode === reportCode);
  assert(!!taskNotif, 'Worker received notification for assigned task');
  console.log(`   Worker notification: "${taskNotif.title}" - ${taskNotif.message}`);

  // Step 8: Worker views tasks and complaint address/map tracking info
  console.log('\n8. Worker views assigned task details with complainant address & GPS navigation...');
  const workerTasks = await request('GET', '/api/worker/tasks', null, workerCookie);
  assert(workerTasks.status === 200, 'Worker tasks list retrieved');
  const workerTask = workerTasks.data.tasks.find((t) => t.code === reportCode);
  assert(!!workerTask, 'Report found in worker assigned tasks');
  assert(workerTask.reporter.name === 'Priya Sharma', 'Complainant citizen name available to worker');
  assert(workerTask.reporter.phone === '+91 98765 43210', 'Complainant contact phone available to worker');
  assert(workerTask.address === 'Near Malleshwaram 8th Cross Bus Stand', 'Complainant address available');
  assert(workerTask.latitude === 13.0031 && workerTask.longitude === 77.5684, 'GPS coordinates available for map tracking');

  // Step 9: Worker starts collection (status -> in_progress)
  console.log('\n9. Worker starts collection (in_progress)...');
  const progressRes = await request(
    'POST',
    `/api/worker/tasks/${reportCode}/status`,
    {
      status: 'in_progress',
      note: 'Compactor vehicle arrived on site at 8th cross.',
    },
    workerCookie
  );
  assert(progressRes.status === 200, 'Worker updated status to in_progress');
  assert(progressRes.data.report.status === 'in_progress', 'Report status is in_progress');

  // Step 10: Worker clicks "I completed the work" (status -> resolved)
  console.log('\n10. Worker clicks "I completed the work" (resolved)...');
  const completeRes = await request(
    'POST',
    `/api/worker/tasks/${reportCode}/status`,
    {
      status: 'resolved',
      note: 'Site fully cleared, sanitized, and waste transferred to disposal unit.',
    },
    workerCookie
  );
  assert(completeRes.status === 200, 'Worker marked "I completed the work"');
  assert(completeRes.data.report.status === 'resolved', 'Report status is resolved');

  // Step 11: Verify Citizen and Admin received completion notifications
  console.log('\n11. Verify Citizen and Admin notifications...');
  const citizenNotifs = await request('GET', '/api/notifications', null, citizenCookie);
  const citizenResolvedNotif = citizenNotifs.data.notifications.find(
    (n) => n.reportCode === reportCode && n.title.includes('Resolved')
  );
  assert(!!citizenResolvedNotif, 'Citizen received notification that worker completed the task');
  console.log(`   Citizen notification: "${citizenResolvedNotif.title}" - ${citizenResolvedNotif.message}`);

  const adminNotifs = await request('GET', '/api/notifications', null, adminCookie);
  const adminResolvedNotif = adminNotifs.data.notifications.find(
    (n) => n.reportCode === reportCode && (n.title.includes('Completed') || n.title.includes('Resolved'))
  );
  assert(!!adminResolvedNotif, 'Admin received notification of task resolution by worker');
  console.log(`   Admin notification: "${adminResolvedNotif.title}" - ${adminResolvedNotif.message}`);

  // Step 12: Worker summary check
  console.log('\n12. Worker checks dashboard summary stats...');
  const workerSummary = await request('GET', '/api/worker/summary', null, workerCookie);
  assert(workerSummary.status === 200, 'Worker summary retrieved');
  assert(workerSummary.data.stats.resolved >= 1, 'Worker completed tasks stat count updated');
  console.log(`   Worker stats: Active: ${workerSummary.data.stats.active}, Resolved: ${workerSummary.data.stats.resolved}`);

  console.log('\n🎉 ALL WORKER FLOW INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
