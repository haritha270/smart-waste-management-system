'use strict';

const http = require('http');

function req(options, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqOpts = {
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };
    if (postData) {
      reqOpts.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const r = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    r.on('error', reject);
    if (postData) r.write(postData);
    r.end();
  });
}

function getCookie(headers) {
  const sc = headers['set-cookie'];
  if (!sc) return '';
  if (Array.isArray(sc)) return sc.map((c) => c.split(';')[0]).join('; ');
  return sc.split(';')[0];
}

async function testFlow() {
  console.log('🧪 STARTING COMPREHENSIVE TESTS: 1-Minute Email Delay & Admin Worker/Complaint Removal\n');

  // 1. Login as Admin
  console.log('1️⃣ Logging in as Administrator (admin@smartwms.gov)...');
  const adminLogin = await req({ path: '/api/auth/login', method: 'POST' }, { email: 'admin@smartwms.gov', password: 'Admin@123' });
  if (adminLogin.status !== 200 || !adminLogin.body.ok) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.body));
  const adminCookie = getCookie(adminLogin.headers);
  console.log('   ✅ Admin logged in successfully.\n');

  // 2. Admin adds a test worker
  console.log('2️⃣ Admin adding a new collection worker (worker.test@smartwms.gov)...');
  const uniqueMail = `worker.test${Math.floor(Math.random()*10000)}@smartwms.gov`;
  const addWorkerRes = await req({ path: '/api/admin/workers', method: 'POST', headers: { Cookie: adminCookie } }, {
    name: 'Test Sanitation Worker',
    email: uniqueMail,
    phone: '98765 11223',
    password: 'Worker@123',
    zone: 'East Zone',
    vehicle: 'Compactor Truck',
  });
  if (addWorkerRes.status !== 201 || !addWorkerRes.body.ok) throw new Error('Add worker failed: ' + JSON.stringify(addWorkerRes.body));
  const newWorker = addWorkerRes.body.worker;
  console.log(`   ✅ Worker added with ID: ${newWorker.id}, Code: ${newWorker.code}, Email: ${uniqueMail}\n`);

  // 3. Citizen logs in and files a complaint
  console.log('3️⃣ Citizen logging in (priya@example.com) to report waste...');
  const citLogin = await req({ path: '/api/auth/login', method: 'POST' }, { email: 'priya@example.com', password: 'Citizen@123' });
  const citCookie = getCookie(citLogin.headers);

  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const multipartBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="title"',
    '',
    'Marketplace plastic & garbage pile to clear',
    `--${boundary}`,
    'Content-Disposition: form-data; name="description"',
    '',
    'Heavy waste overflow blocking the pedestrian pathway near market entrance.',
    `--${boundary}`,
    'Content-Disposition: form-data; name="address"',
    '',
    '10, 80 Feet Road, 4th Block, Koramangala',
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
    new Date().toISOString(),
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="waste.jpg"',
    'Content-Type: image/jpeg',
    '',
    'FakeJPEGImageDataForTestingOnly1234567890',
    `--${boundary}--`,
  ].join('\r\n');

  const reportRes = await req({
    path: '/api/reports',
    method: 'POST',
    headers: {
      Cookie: citCookie,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
  }, multipartBody);

  if (reportRes.status !== 201 || !reportRes.body.ok) throw new Error('Create report failed: ' + JSON.stringify(reportRes.body));
  const reportCode = reportRes.body.report.code;
  console.log(`   ✅ Complaint filed successfully with code: #${reportCode}\n`);

  // 4. Admin assigns the complaint to the newly added worker
  console.log(`4️⃣ Admin assigning complaint #${reportCode} to Worker ${newWorker.name} (ID: ${newWorker.id})...`);
  const assignRes = await req({ path: `/api/admin/reports/${reportCode}/assign`, method: 'POST', headers: { Cookie: adminCookie } }, {
    workerId: newWorker.id,
    note: 'Urgent clear before peak hours.',
  });
  if (assignRes.status !== 200 || !assignRes.body.ok) throw new Error('Assign failed: ' + JSON.stringify(assignRes.body));
  console.log('   ✅ Assign API Response:', assignRes.body.message);
  console.log('   ⏱️  Scheduled At:', assignRes.body.scheduledAt, '| Delay:', assignRes.body.delaySeconds, 'seconds');
  const actionToken = assignRes.body.actionToken;
  console.log(`   🔑 Action Token generated: ${actionToken}\n`);

  // 5. Worker completes work using the token link from email
  console.log('5️⃣ Worker clicking YES in email to mark complaint completed...');
  const emailActionRes = await req({
    path: `/api/worker/email-action?code=${reportCode}&token=${actionToken}&action=completed`,
    method: 'POST',
  });
  if (emailActionRes.status !== 200 || !emailActionRes.body.ok) throw new Error('Email action failed: ' + JSON.stringify(emailActionRes.body));
  console.log('   ✅ Worker email action response:', emailActionRes.body.message);
  console.log('   🎯 Report status now:', emailActionRes.body.task.status, '\n');

  // 6. Test Non-Admin cannot delete complaints
  console.log('6️⃣ Testing security: Citizen attempts to delete complaint (should be rejected with 403)...');
  const citDel = await req({ path: `/api/admin/reports/${reportCode}`, method: 'DELETE', headers: { Cookie: citCookie } });
  if (citDel.status === 403) {
    console.log('   ✅ Citizen deletion blocked properly with 403 Forbidden.\n');
  } else {
    throw new Error('Security check failed: citizen could access admin delete endpoint! Status: ' + citDel.status);
  }

  // 7. Test Admin single complaint deletion
  console.log(`7️⃣ Admin clearing and deleting single complaint #${reportCode}...`);
  const adminDel = await req({ path: `/api/admin/reports/${reportCode}`, method: 'DELETE', headers: { Cookie: adminCookie } });
  if (adminDel.status !== 200 || !adminDel.body.ok) throw new Error('Admin delete complaint failed: ' + JSON.stringify(adminDel.body));
  console.log('   ✅ Admin delete complaint response:', adminDel.body.message, '\n');

  // 8. Test Admin worker removal
  console.log(`8️⃣ Admin removing worker ${newWorker.name} (ID: ${newWorker.id})...`);
  const delWorkerRes = await req({ path: `/api/admin/workers/${newWorker.id}`, method: 'DELETE', headers: { Cookie: adminCookie } });
  if (delWorkerRes.status !== 200 || !delWorkerRes.body.ok) throw new Error('Admin delete worker failed: ' + JSON.stringify(delWorkerRes.body));
  console.log('   ✅ Admin remove worker response:', delWorkerRes.body.message, '\n');

  // 9. Test Admin bulk clear resolved complaints
  console.log('9️⃣ Admin clearing all completed/resolved complaints in bulk...');
  const clearRes = await req({ path: '/api/admin/reports/clear-resolved', method: 'POST', headers: { Cookie: adminCookie } });
  if (clearRes.status !== 200 || !clearRes.body.ok) throw new Error('Clear resolved failed: ' + JSON.stringify(clearRes.body));
  console.log('   ✅ Admin bulk clear resolved response:', clearRes.body.message, '\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY 100%!');
}

testFlow().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
