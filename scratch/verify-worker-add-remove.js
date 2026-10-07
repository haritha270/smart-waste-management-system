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

function assert(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
  console.log('✅ ' + msg);
}

async function run() {
  const admin = await request('POST', '/api/auth/login', { email: 'admin@smartwms.gov', password: 'Admin@123' });
  assert(admin.status === 200, 'Admin login');

  // 1. Add worker with ONLY a Gmail address — no password field at all
  const uid = Date.now().toString().slice(-5);
  const gmail = `test.gone.${uid}@gmail.com`;
  const create = await request('POST', '/api/admin/workers', {
    name: 'Test Gone Worker',
    email: gmail,
    phone: '9000000000',
    zone: 'East Zone',
    vehicle: 'E-Cart Carrier',
  }, admin.cookies);
  assert(create.status === 201, `Worker created with Gmail only, no password (status ${create.status}: ${create.data.message})`);
  const id = create.data.worker && create.data.worker.id;
  assert(id, 'Worker returned with id');

  // 2. Confirm it appears in the workers list
  const list = await request('GET', '/api/admin/workers', null, admin.cookies);
  assert((list.data.workers || []).some((w) => w.id === id), 'Worker visible in admin list');

  // 3. Remove the worker (the exact endpoint the UI's Remove button calls)
  const del = await request('DELETE', `/api/admin/workers/${id}`, null, admin.cookies);
  assert(del.status === 200 && del.data.ok, `DELETE /api/admin/workers/${id} succeeded: ${del.data.message}`);

  // 4. Confirm it is gone
  const list2 = await request('GET', '/api/admin/workers', null, admin.cookies);
  assert(!(list2.data.workers || []).some((w) => w.id === id), 'Worker no longer in list after removal');

  console.log('\n🎉 WORKER ADD (Gmail-only) + REMOVE TESTS PASSED');
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
