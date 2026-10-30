import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authService } from '../server/auth.js';
import { config } from '../server/config.js';

test('configured PIN creates an opaque session that logout revokes', async () => {
  const configured = config.adminPin;
  assert.match(configured || '', /^\d{4}$/);
  await assert.rejects(authService.login(configured === '9999' ? '8888' : '9999'));
  const session = await authService.login(configured!);
  assert.match(session, /^[a-f0-9]{64}$/);
  assert.notEqual(session, configured);
  assert.deepEqual(await authService.verify(session), { uid: 'pin-owner', email: null, role: 'owner' });
  await authService.logout(session);
  await assert.rejects(authService.verify(session));
});
