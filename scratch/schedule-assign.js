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

function createReport(cookies) {
  return new Promise((resolve, reject) => {
    const boundary = '----WMSTestBoundaryRestart';
    const dummyJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
    const fields = {
      title: 'Construction debris on footpath',
      description: 'Mixed construction waste dumped on the walking path blocking pedestrians.',
      address: '8, Church Street, Bengaluru',
      locality: 'Central Zone',
      latitude: '12.9755',
      longitude: '77.6067',
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
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': payload.length, Cookie: cookies },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data); } catch (e) { json = { raw: data }; }
        resolve(json);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  const admin = await request('POST', '/api/auth/login', { email: 'admin@smartwms.gov', password: 'Admin@123' });
  if (admin.status !== 200) throw new Error('Admin login failed');
  const citizen = await request('POST', '/api/auth/login', { email: 'priya@example.com', password: 'Citizen@123' });
  if (citizen.status !== 200) throw new Error('Citizen login failed');

  const created = await createReport(citizen.cookies);
  if (!created.report) throw new Error('Report creation failed: ' + JSON.stringify(created));
  const code = created.report.code;

  const workers = await request('GET', '/api/admin/workers', null, admin.cookies);
  const worker = (workers.data.workers || []).find((w) => w.email === 'worker.ravi@smartwms.gov');
  if (!worker) throw new Error('worker.ravi not found');

  const t0 = Date.now();
  const assign = await request('POST', `/api/admin/reports/${code}/assign`, { workerId: worker.id, note: 'Restart-resume test' }, admin.cookies);
  if (assign.status !== 200 || !assign.data.ok) throw new Error('Assign failed: ' + JSON.stringify(assign.data));

  console.log(`T0=${t0}`);
  console.log(`CODE=${code}`);
  console.log(`ASSIGNED at ${new Date(t0).toISOString()} — server may now be restarted`);
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
