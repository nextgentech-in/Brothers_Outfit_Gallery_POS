import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';

let server: Server;
let origin: string;
let revoked = false;
const fixturePin = '2468';
beforeEach(async () => {
  revoked = false;
  const app = createApp({
    auth: {
      async login(pin) { if (pin !== fixturePin) throw new Error('Secret upstream error'); revoked = false; return 'test-session'; },
      async verify(cookie) { if (cookie !== 'test-session' || revoked) throw new Error('Invalid'); return { uid: 'pin-owner', email: null, role: 'owner' }; },
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
  for (const endpoint of ['/api/auth/me', '/api/overview', '/api/foundation', '/api/anything']) {
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
test('business routes require CSRF and stay locked before schema review', async () => {
  const { cookie, token } = await csrf();
  const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: {
    origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json'
  }, body: JSON.stringify({ pin: fixturePin }) });
  assert.equal(login.status, 200);
  const session = login.headers.getSetCookie()[0].split(';')[0];
  const headers = { origin: config.origin, cookie: `${cookie}; ${session}`, 'Content-Type': 'application/json' };
  const deniedCsrf = await fetch(origin + '/api/pos/sale', { method: 'POST', headers, body: '{}' });
  assert.equal(deniedCsrf.status, 403);
  const locked = await fetch(origin + '/api/pos/sale', { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
  assert.equal(locked.status, 423);
  const lockedProduct = await fetch(origin + '/api/products/create', { method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{}' });
  assert.equal(lockedProduct.status, 423);
});
test('forged sessions never reach protected data', async () => {
  const res = await fetch(origin + '/api/overview', { headers: { cookie: 'bo_session=forged-token' } });
  assert.equal(res.status, 401);
});
test('login rate limiting rejects repeated attempts', async () => {
  const { cookie, token } = await csrf();
  let response: Response | undefined;
  for (let n = 0; n < 6; n++) response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { origin: config.origin, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response?.status, 429); assert.ok(response?.headers.get('retry-after'));
});
