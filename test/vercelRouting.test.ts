import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import handler from '../api/index.js';

test('Vercel rewrite forwards API routes to Express without losing their paths', async () => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const base = `http://127.0.0.1:${address.port}/api/index?route=`;
    const health = await fetch(base + 'health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const csrf = await fetch(base + 'auth%2Fcsrf');
    assert.equal(csrf.status, 200);
    assert.match(csrf.headers.get('content-type') || '', /json/);
    const denied = await fetch(base + 'dashboard');
    assert.equal(denied.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
