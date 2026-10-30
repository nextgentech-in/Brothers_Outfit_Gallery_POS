import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Server } from 'node:http';
import type { DeviceAccess } from '../server/deviceAccess.js';

process.env.NODE_ENV = 'production';
process.env.ADMIN_ORIGIN = 'https://brothers-outfit-gallery-pos.vercel.app';
const { createApp } = await import('../server/app.js');
const grantId = `device_grant_${'a'.repeat(64)}`;
let enrolled = false;
let revoked = false;
let loginGrant: string | null | undefined;
const devices: DeviceAccess = {
  async createInvite() { throw new Error('Production must not create invitations.'); },
  async enroll(token) { assert.equal(token, 'b'.repeat(64)); enrolled = true; return 'c'.repeat(64); },
  async verify(token) { return token === 'c'.repeat(64) && !revoked ? grantId : null; },
  async isGrantActive(id) { return id === grantId && !revoked; },
  async list() { return [{ id: grantId, label: 'Shop phone', createdAt: 1, expiresAt: Date.now() + 1000, lastUsedAt: null }]; },
  async revoke(id) { assert.equal(id, grantId); revoked = true; }
};
const app = createApp({ devices, auth: {
  async login(_pin, _identity, deviceGrantId) { loginGrant = deviceGrantId; return 'session-token'; },
  async verify(cookie) { if (cookie !== 'session-token') throw new Error('Invalid'); return { uid: 'pin-owner', email: null, role: 'owner' }; },
  async logout() {}
} });
app.use((_req, res) => res.type('html').send('Application shell'));
const server: Server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No server address');
const base = `http://127.0.0.1:${address.port}`;
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
async function csrf() {
  const response = await fetch(`${base}/api/auth/csrf`);
  const body = await response.json() as { token: string };
  return { token: body.token, cookie: response.headers.getSetCookie()[0].split(';')[0] };
}
test('hosted login needs a paired device, and enrollment is one-time token gated', async () => {
  const { token, cookie } = await csrf();
  const headers = { origin: process.env.ADMIN_ORIGIN!, cookie, 'x-csrf-token': token, 'Content-Type': 'application/json' };
  const status = await fetch(`${base}/api/auth/device/status`);
  assert.deepEqual(await status.json(), { loginAvailable: false, trusted: false, pairingRequired: true });
  const denied = await fetch(`${base}/api/auth/login`, { method: 'POST', headers, body: '{"pin":"2468"}' });
  assert.equal(denied.status, 403);
  assert.equal(loginGrant, undefined);
  const badEnrollment = await fetch(`${base}/api/auth/device/enroll`, { method: 'POST', headers,
    body: JSON.stringify({ token: 'short', label: 'Shop phone' }) });
  assert.equal(badEnrollment.status, 400);
  const paired = await fetch(`${base}/api/auth/device/enroll`, { method: 'POST', headers,
    body: JSON.stringify({ token: 'b'.repeat(64), label: 'Shop phone' }) });
  assert.equal(paired.status, 200);
  assert.equal(enrolled, true);
  assert.match(paired.headers.getSetCookie().join(';'), /__Host-bo_device=/);
  assert.match(paired.headers.getSetCookie().join(';'), /HttpOnly.*Secure.*SameSite=Strict/);
  const trustedHeaders = { ...headers, cookie: `${cookie}; __Host-bo_device=${'c'.repeat(64)}` };
  const ready = await fetch(`${base}/api/auth/device/status`, { headers: trustedHeaders });
  assert.deepEqual(await ready.json(), { loginAvailable: true, trusted: true, pairingRequired: false });
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: trustedHeaders, body: '{"pin":"2468"}' });
  assert.equal(login.status, 200);
  assert.equal(loginGrant, grantId);
  const noInvite = await fetch(`${base}/api/auth/device/invite`, { method: 'POST',
    headers: { ...trustedHeaders, cookie: `${trustedHeaders.cookie}; __Host-bo_session=session-token` }, body: '{}' });
  assert.equal(noInvite.status, 403);
  const revoke = await fetch(`${base}/api/auth/device/revoke`, { method: 'POST',
    headers: { ...trustedHeaders, cookie: `${trustedHeaders.cookie}; __Host-bo_session=session-token` },
    body: JSON.stringify({ id: grantId }) });
  assert.equal(revoke.status, 200);
  const afterRevoke = await fetch(`${base}/api/auth/device/status`, { headers: trustedHeaders });
  assert.equal((await afterRevoke.json() as { loginAvailable: boolean }).loginAvailable, false);
});
