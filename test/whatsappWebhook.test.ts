import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { config } from '../server/config.js';
import { whatsappWebhook } from '../server/whatsappWebhook.js';

test('WhatsApp webhook validates the challenge and raw request signature', async () => {
  const previous = { ...config.whatsapp };
  Object.assign(config.whatsapp, {
    appSecret: 'fixture-app-secret', verifyToken: 'fixture-verify-token',
    graphVersion: 'v25.0', phoneNumberId: '123', accessToken: 'fixture-access-token'
  });
  const server = express().use(whatsappWebhook).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/webhooks/whatsapp`;
    const challenge = await fetch(url + '?hub.mode=subscribe&hub.challenge=712&hub.verify_token=fixture-verify-token');
    assert.equal(await challenge.text(), '712');
    assert.equal((await fetch(url + '?hub.mode=subscribe&hub.challenge=712&hub.verify_token=wrong')).status, 403);
    const body = '{"entry":[]}';
    const signature = 'sha256=' + createHmac('sha256', config.whatsapp.appSecret).update(body).digest('hex');
    const send = (value: string) => fetch(url, { method: 'POST', body: value,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature } });
    assert.equal((await send(body)).status, 200);
    assert.equal((await send(body + ' ')).status, 401);
  } finally {
    Object.assign(config.whatsapp, previous);
    server.close();
  }
});
