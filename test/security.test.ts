import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

let server: Server;
let origin: string;
let revoked = false;
let fixtureRole:'owner'|'manager'|'cashier'='owner';
const fixturePin = '2468';
beforeEach(async () => {
  revoked = false; fixtureRole='owner';
  const app = createApp({
    devices: {
      async createInvite() { return { url: 'https://brothers-outfit-gallery-pos.vercel.app/enroll#token=sample', expiresAt: 1000 }; },
      async enroll() { throw new Error('Production only'); },
      async verify() { return null; },
      async isGrantActive() { return false; },
      async list() { return []; },
      async revoke() {}
    },
    auth: {
      async login(pin) { if (pin !== fixturePin) throw new Error('Secret upstream error'); revoked = false; return 'test-session'; },
      async verify(cookie) { if (cookie !== 'test-session' || revoked) throw new Error('Invalid'); return { uid: 'pin-owner', email: null, role: fixtureRole }; },
      async logout() { revoked = true; }
    },
    overview: async () => ({ products: 3, orders: 2, customers: 1, movements: 4, checkedAt: new Date().toISOString(), businessWritesEnabled: false })
  });
  app.use((_req, res) => res.type('html').send('Application shell'));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
async function csrf() {
  const res = await fetch(`${origin}/api/auth/csrf`);
  const data = await res.json() as { token: string };
  return { token: data.token, cookie: res.headers.getSetCookie()[0].split(';')[0] };
}
test('unauthenticated pages redirect and APIs return JSON 401', async () => {
  for (const page of ['/', '/mapping', '/delivery', '/security']) {
    const res = await fetch(origin + page, { redirect: 'manual' });
    assert.equal(res.status, 303); assert.equal(res.headers.get('location'), '/login');
  }
  for (const endpoint of ['/api/auth/me', '/api/overview', '/api/dashboard', '/api/foundation', '/api/credit/customers', '/api/whatsapp/status', '/api/anything']) {
    const res = await fetch(origin + endpoint); assert.equal(res.status, 401); assert.match(res.headers.get('content-type') || '', /json/);
  }
  assert.equal((await fetch(origin + '/login')).status, 200);
  for (const asset of ['/favicon.svg', '/manifest.webmanifest']) {
    assert.equal((await fetch(origin + asset)).status, 200);
  }
});
test('CSRF checks reject cross-origin, missing token and mismatched token', async () => {
  const { cookie, token } = await csrf();
  for (const headers of [
    { origin: 'https://untrusted.example', cookie, 'x-csrf-token': token },
    { origin: config.origin, cookie, 'x-csrf-token': '0'.repeat(64) },
    { origin: config.origin, cookie, 'x-csrf-token': '' }
  ]) {
    const res = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ pin: fixturePin }) });
    assert.equal(res.status, 403);
  }
});
test('PIN input is validated and upstream sign-in errors stay private', async () => {
  const { cookie, token } = await csrf();
  const headers = { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' };
  const invalid = await fetch(origin + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ pin: fixturePin, role: 'owner' }) });
  assert.equal(invalid.status, 400);
  const denied = await fetch(origin + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ pin: '1234' }) });
  assert.equal(denied.status, 401); assert.doesNotMatch(await denied.text(), /Secret upstream/);
});
test('sessions gate read-only data and logout invalidates the session', async () => {
  const { cookie, token } = await csrf();
  const headers = { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' };
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ pin: fixturePin }) });
  assert.equal(login.status, 200);
  const session = login.headers.getSetCookie()[0];
  assert.match(session, /HttpOnly/i); assert.match(session, /SameSite=Strict/i); assert.match(session, /Max-Age=/);
  const authenticated = { ...headers, cookie: `${cookie}; ${session.split(';')[0]}` };
  const overview = await fetch(origin + '/api/overview', { headers: authenticated });
  assert.equal(overview.status, 200); assert.equal((await overview.json() as { businessWritesEnabled: boolean }).businessWritesEnabled, false);
  const write = await fetch(origin + '/api/products', { method: 'POST', headers: authenticated, body: '{}' });
  assert.equal(write.status, 404);
  const logout = await fetch(origin + '/api/auth/logout', { method: 'POST', headers: authenticated, body: '{}' });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(origin + '/api/auth/me', { headers: authenticated })).status, 401);
});
test('local owner can create a single-use device invitation only with a session and CSRF token', async () => {
  const { cookie, token } = await csrf();
  const headers = { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' };
  const anonymous = await fetch(origin + '/api/auth/device/invite', { method: 'POST', headers, body: '{}' });
  assert.equal(anonymous.status, 401);
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ pin: fixturePin }) });
  const session = login.headers.getSetCookie()[0].split(';')[0];
  const authenticated = { ...headers, cookie: `${cookie}; ${session}` };
  const noCsrf = await fetch(origin + '/api/auth/device/invite', { method: 'POST', headers: { ...authenticated, 'x-csrf-token': '' }, body: '{}' });
  assert.equal(noCsrf.status, 403);
  const invite = await fetch(origin + '/api/auth/device/invite', { method: 'POST', headers: authenticated, body: '{}' });
  assert.equal(invite.status, 200);
  assert.match((await invite.json() as { url: string }).url, /\/enroll#token=/);
});
test('business routes require CSRF and otherwise reach normal validation', async () => {
  const { cookie, token } = await csrf();
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: {
    origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json'
  }, body: JSON.stringify({ pin: fixturePin }) });
  assert.equal(login.status, 200);
  const session = login.headers.getSetCookie()[0].split(';')[0];
  const headers = { origin: config.origin, cookie: `${cookie}; ${session}`, 'Content-Type': 'application/json' };
  const deniedCsrf = await fetch(origin + '/api/pos/sale', { method: 'POST', headers, body: '{}' });
  assert.equal(deniedCsrf.status, 403);
  const sale = await fetch(origin + '/api/pos/sale', { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
  assert.equal(sale.status, 422);
  const product = await fetch(origin + '/api/products/create', { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
  assert.equal(product.status, 422);
  const batchAdjustment = await fetch(origin + '/api/inventory/adjust-batch', { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
  assert.equal(batchAdjustment.status, 422);
  for (const endpoint of ['/api/credit/customers', '/api/credit/entries', '/api/credit/preferences', '/api/whatsapp/process', '/api/whatsapp/retry']) {
    const response = await fetch(origin + endpoint, { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
    assert.notEqual(response.status, 423, endpoint);
  }
});
test('forged sessions never reach protected data', async () => {
  const res = await fetch(origin + '/api/overview', { headers: { cookie: 'bo_session=forged-token' } });
  assert.equal(res.status, 401);
});
test('login rate limiting rejects repeated attempts', async () => {
  const { cookie, token } = await csrf();
  let response: Response | undefined;
  for (let n = 0; n < 6; n++) {
    const success = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: fixturePin }) });
    assert.equal(success.status, 200, 'successful sign-ins must not trigger the limiter');
  }
  for (let n = 0; n < 6; n++) response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response?.status, 429); assert.ok(response?.headers.get('retry-after'));
});

test('cashier and manager permissions are enforced by the server',async()=>{
 const {cookie,token}=await csrf();const headers={origin:config.origin,cookie:cookie+'; bo_session=test-session','x-csrf-token':token,'Content-Type':'application/json'};
 fixtureRole='cashier';
 for(const path of ['/api/reports/summary','/api/dashboard','/api/suppliers','/api/backup/export','/api/staff'])assert.equal((await fetch(origin+path,{headers})).status,403,path);
 for(const path of ['/api/orders/return','/api/inventory/count','/api/expenses/create','/api/products/create'])assert.equal((await fetch(origin+path,{method:'POST',headers,body:'{}'})).status,403,path);
 assert.equal((await fetch(origin+'/api/pos/sale',{method:'POST',headers,body:JSON.stringify({discount:10})})).status,403);
 assert.equal((await fetch(origin+'/api/pos/sale',{method:'POST',headers,body:JSON.stringify({discount:10,lines:[{discount:10}]})})).status,422);
 fixtureRole='manager';assert.equal((await fetch(origin+'/api/staff',{headers})).status,403);
});
