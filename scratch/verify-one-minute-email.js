'use strict';

const http = require('http');
const PORT = 3000;

function request(method, path, body = null, cookies = '') {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) };
    if (cookies) headers.Cookie = cookies;
    const req = http.request({ hostname: 'localhost', port: PORT, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
        const setCookie = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, data: json, cookies: setCookie.map((c) => c.split(';')[0]).join('; ') });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createReport(cookies) {
  return new Promise((resolve, reject) => {
    const boundary = '----WMSTestBoundary1Minute';
    const dummyJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
    const fields = {
      title: 'Overflowing dumpster near bus stand',
      description: 'Garbage overflowing from the dumpster causing bad smell and blocking the footpath.',
      address: '12, MG Road, Central Bengaluru',
      locality: 'Central Zone',
      latitude: '12.9716',
      longitude: '77.5946',
      reportedAt: new Date(Date.now() - 3600000).toISOString(),
    };
    const parts = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="waste.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`));
    parts.push(dummyJpg);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const payload = Buffer.concat(parts);
    const req = http.request({
      hostname: 'localhost', port: PORT, path: '/api/reports', method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        Cookie: cookies,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
        resolve(json.report ? { ok: true, report: json.report } : json);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  // 1. Logins
  const admin = await request('POST', '/api/auth/login', { email: 'admin@smartwms.gov', password: 'Admin@123' });
  if (admin.status !== 200) throw new Error('Admin login failed: ' + JSON.stringify(admin.data));
  const workerLogin = await request('POST', '/api/auth/login', { email: 'worker.ravi@smartwms.gov', password: 'Worker@123' });
  if (workerLogin.status !== 200) throw new Error('Worker login failed: ' + JSON.stringify(workerLogin.data));

  // 2. Find a pending (unassigned) report, or file a fresh one as a citizen
  let reports = await request('GET', '/api/admin/reports?status=pending', null, admin.cookies);
  let pending = (reports.data.reports || [])[0];
  if (!pending) {
    const citizen = await request('POST', '/api/auth/login', { email: 'priya@example.com', password: 'Citizen@123' });
    if (citizen.status !== 200) throw new Error('Citizen login failed: ' + JSON.stringify(citizen.data));
    const created = await createReport(citizen.cookies);
    if (!created.ok) throw new Error('Report creation failed: ' + JSON.stringify(created));
    pending = created.report;
    console.log(`Filed new complaint ${pending.code} as citizen.`);
  }
  console.log(`Complaint: ${pending.code || pending.reportCode} — ${pending.title}`);

  // 3. Find a worker
  const workers = await request('GET', '/api/admin/workers', null, admin.cookies);
  const worker = (workers.data.workers || []).find((w) => w.email === 'worker.ravi@smartwms.gov') || (workers.data.workers || [])[0];
  if (!worker) throw new Error('No worker found.');

  // Snapshot worker mailbox before assign
  const before = await request('GET', '/api/worker/emails', null, workerLogin.cookies);
  const beforeIds = new Set((before.data.emails || []).map((e) => e.id));

  // 4. ASSIGN — start the clock
  const t0 = Date.now();
  const assign = await request('POST', `/api/admin/reports/${pending.code || pending.reportCode}/assign`,
    { workerId: worker.id, note: 'One-minute delivery verification' }, admin.cookies);
  if (assign.status !== 200 || !assign.data.ok) throw new Error('Assign failed: ' + JSON.stringify(assign.data));
  console.log(`Assigned. API message: "${assign.data.message}"`);
  console.log(`API says delaySeconds=${assign.data.delaySeconds}, scheduledAt=${assign.data.scheduledAt}`);

  // 5. Poll worker mailbox until the new email flips to 'sent'
  let delivered = null;
  let lastStatus = null;
  while (Date.now() - t0 < 150000) {
    const box = await request('GET', '/api/worker/emails', null, workerLogin.cookies);
    const email = (box.data.emails || []).find((e) => !beforeIds.has(e.id));
    if (email) {
      if (email.status !== lastStatus) {
        lastStatus = email.status;
        console.log(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s → email status: ${email.status}`);
      }
      if (email.status === 'sent') { delivered = Date.now(); break; }
    } else {
      console.log(`  t+${((Date.now() - t0) / 1000).toFixed(1)}s → new email not visible yet`);
    }
    await sleep(3000);
  }

  if (!delivered) {
    console.error(`❌ FAIL: email still "${lastStatus}" after 150s — worker did NOT get it within 1 minute.`);
    process.exit(1);
  }
  const secs = (delivered - t0) / 1000;
  console.log(`\n✅ Email delivered (status=sent) at t+${secs.toFixed(1)}s after assignment.`);
  if (secs > 65) {
    console.error(`❌ FAIL: delivery took ${secs}s — exceeds the 1-minute window.`);
    process.exit(1);
  }
  console.log('✅ Within the 1-minute window.');
  process.exit(0);
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
