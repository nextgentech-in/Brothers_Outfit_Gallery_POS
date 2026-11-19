import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from '../server/config.js';
import { delhiveryLabel, shippingRouter } from '../server/shipping.js';
import { memoryFirestore } from './memoryFirestore.js';

const db = getFirestore(initializeApp({ projectId: 'demo-shipping-labels' }, 'brothers-admin'));
const { records } = memoryFirestore(db);
const previous = { ...config.delhivery };
const nativeFetch = globalThis.fetch;
const pdf = '%PDF-1.4\nfixture courier label\n%%EOF';
let scenario = 'link';
const calls: { url: URL; options?: RequestInit }[] = [];
const server = express().use(shippingRouter).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); base = `http://127.0.0.1:${address.port}`;
  config.delhivery.apiKey = 'private-test-token'; config.delhivery.environment = 'production';
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin === base) return nativeFetch(input, options);
    calls.push({ url, options });
    if (url.hostname === 'track.delhivery.com' || url.hostname === 'staging-express.delhivery.com') {
      if (scenario === 'direct') return new Response(pdf, { headers: { 'content-type': 'application/pdf' } });
      if (scenario === 'auth') return new Response('private upstream error', { status: 401 });
      if (scenario === 'missing') return Response.json({ packages: [], packages_found: 0 });
      const link = scenario === 'unsafe' ? 'http://127.0.0.1/private' : 'https://labels.s3.amazonaws.com/label.pdf?signed=fixture';
      return Response.json({ packages_found: 1, packages: [{ wbn: scenario === 'mismatch' ? '000000000000' : '12345678901234', pdf_download_link: link }] });
    }
    assert.equal(url.hostname, 'labels.s3.amazonaws.com');
    assert.equal(new Headers(options?.headers).has('authorization'), false, 'Never forward API token to label CDN');
    return new Response(scenario === 'bad-pdf' ? '<html>Error</html>' : pdf, { headers: { 'content-type': 'application/pdf' } });
  });
  records.set('orders/WEB-001', { channel: 'Website', status: 'Packed', waybill: '12345678901234' });
});
after(() => new Promise<void>((resolve, reject) => server.close(error => {
  Object.assign(config.delhivery, previous); mock.restoreAll(); error ? reject(error) : resolve();
})));

test('shipping label fetches the original PDF using the saved AWB and keeps credentials private', async () => {
  scenario = 'link'; calls.length = 0;
  const response = await fetch(base + '/orders/WEB-001/shipping-label');
  assert.equal(response.status, 200); assert.equal(await response.text(), pdf);
  assert.match(response.headers.get('content-type')!, /application\/pdf/);
  assert.match(response.headers.get('content-disposition')!, /delhivery-WEB-001.pdf/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, '/api/p/packing_slip');
  assert.equal(calls[0].url.searchParams.get('wbns'), '12345678901234');
  assert.equal(calls[0].url.searchParams.get('pdf'), 'True');
  assert.equal(new Headers(calls[0].options?.headers).get('authorization'), 'Token private-test-token');
  assert.equal(records.size, 1, 'Retrieving a label does not write shipment or order data');
});

test('direct provider PDFs are preserved, and staging requires an explicit environment choice', async () => {
  scenario = 'direct'; config.delhivery.environment = 'staging'; calls.length = 0;
  assert.equal((await delhiveryLabel('12345678901234')).toString(), pdf);
  assert.equal(calls[0].url.hostname, 'staging-express.delhivery.com');
  config.delhivery.environment = 'production';
});

test('unavailable, cancelled and POS orders cannot request a courier label', async () => {
  calls.length = 0;
  for (const [id, data] of Object.entries({ 'WEB-NO-AWB': {}, 'WEB-CANCELLED': { status: 'Cancelled', waybill: '12345678901234' }, 'POS-001': { createdBy: 'admin-pos', waybill: '12345678901234' } })) {
    records.set(`orders/${id}`, data);
    assert.equal((await fetch(`${base}/orders/${id}/shipping-label`)).status, 409);
  }
  assert.equal((await fetch(base + '/orders/DOES-NOT-EXIST/shipping-label')).status, 404);
  assert.equal(calls.length, 0);
});

test('provider failures, wrong AWBs, unsafe links and invalid PDFs never produce a substitute label', async () => {
  for (const value of ['missing', 'auth', 'unsafe', 'bad-pdf', 'mismatch']) {
    scenario = value;
    const response = await fetch(base + '/orders/WEB-001/shipping-label');
    assert.equal(response.status, value === 'missing' ? 409 : 502, value);
    const body = await response.text(); assert.doesNotMatch(body, /private-test-token|private upstream error|<html>/);
  }
  config.delhivery.apiKey = ''; calls.length = 0;
  assert.equal((await fetch(base + '/orders/WEB-001/shipping-label')).status, 503);
  assert.equal(calls.length, 0); config.delhivery.apiKey = 'private-test-token';
});
