'use strict';

const http = require('http');
const PORT = 3000;
const T0 = Number(process.argv[2]);
if (!T0) { console.error('usage: node poll-delivery.js <t0EpochMs>'); process.exit(2); }

function request(method, path, cookies = '') {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Length': 0 };
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
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  // Wait for the restarted server to accept logins
  let login = null;
  for (let i = 0; i < 20; i++) {
    login = await new Promise((resolve) => {
      const postData = JSON.stringify({ email: 'worker.ravi@smartwms.gov', password: 'Worker@123' });
      const req = http.request({ hostname: 'localhost', port: PORT, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(data); } catch (e) { json = {}; }
          const setCookie = res.headers['set-cookie'] || [];
          resolve({ status: res.statusCode, data: json, cookies: setCookie.map((c) => c.split(';')[0]).join('; ') });
        });
      });
      req.on('error', () => resolve(null));
      req.write(postData);
      req.end();
    });
    if (login && login.status === 200) break;
    await sleep(1500);
  }
  if (!login || login.status !== 200) throw new Error('Worker login never succeeded after restart');

  let last = null;
  while (Date.now() - T0 < 150000) {
    const box = await request('GET', '/api/worker/emails', login.cookies);
    const email = (box.data.emails || [])[0]; // newest first, created at assign time
    const age = ((Date.now() - T0) / 1000).toFixed(1);
    if (email && email.status !== last) {
      last = email.status;
      console.log(`  t+${age}s → newest email status: ${email.status}`);
    }
    if (email && email.status === 'sent') {
      console.log(`\n✅ Delivered at t+${age}s after assignment (survived server restart).`);
      process.exit(Number(age) <= 65 ? 0 : 1);
    }
    await sleep(2000);
  }
  console.error(`\n❌ FAIL: newest email still "${last}" after 150s.`);
  process.exit(1);
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
