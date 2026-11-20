import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { operationsRouter } from '../server/operations.js';
import { commerceRouter } from '../server/commerce.js';
import { reportsRouter } from '../server/reports.js';
import { isCancelledOrder, isHiddenWebsiteOrder } from '../shared/orderVisibility.js';
import { shopDate } from '../shared/customers.js';

const db = getFirestore(initializeApp({ projectId: 'demo-order-visibility' }, 'brothers-admin'));
const { records, timestamp } = memoryFirestore(db);
const app = express();
app.use((_req, res, next) => { res.locals.owner = { uid: 'test-owner', role: 'owner' }; next(); }, operationsRouter, commerceRouter, reportsRouter);
const server = app.listen(0, '127.0.0.1');
let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => { mock.restoreAll(); error ? reject(error) : resolve(); })));

test('cancellation recognises website status, courier status and cancellation timestamps', () => {
  for (const order of [{ status: ' Cancelled ' }, { status: 'canceled' }, { shipmentStatus: 'CANCELLED' }, { cancelledAt: 1 }, { canceledAt: 1 }]) {
    assert.equal(isCancelledOrder(order), true);
    assert.equal(isHiddenWebsiteOrder(order), true);
    assert.equal(isHiddenWebsiteOrder({ ...order, createdBy: 'admin-pos' }), false);
  }
  assert.equal(isHiddenWebsiteOrder({ status: 'Processing' }), false);
});

test('website cancellations disappear on the next POS read and remain available in explicit history', async () => {
  const createdAt = timestamp(new Date());
  records.set('orders/WEB-test', { status: 'Processing', createdAt, totalAmount: 100 });
  records.set('orders/POS-test', { status: 'Cancelled', createdAt, totalAmount: 50 });
  let result = await (await fetch(`${base}/orders/search`)).json();
  assert.deepEqual(result.items.map((order: any) => order.id).sort(), ['POS-test', 'WEB-test']);
  records.set('orders/WEB-test', { status: 'Processing', shipmentStatus: 'CANCELLED', createdAt, totalAmount: 100 });
  result = await (await fetch(`${base}/orders/search`)).json();
  assert.deepEqual(result.items.map((order: any) => order.id), ['POS-test']);
  assert.equal(result.total, 1);
  const latest = await (await fetch(`${base}/orders`)).json();
  assert.deepEqual(latest.items.map((order: any) => order.id), ['POS-test']);
  const history = await (await fetch(`${base}/orders/search?includeCancelled=1`)).json();
  assert.equal(history.total, 2);
  assert.equal(history.items.find((order: any) => order.id === 'WEB-test').status, 'Cancelled');
});

test('cancelled orders contribute no sales or pending tasks to the dashboard', async () => {
  const day = shopDate();
  const response = await fetch(`${base}/reports/dashboard-summary?from=${day}&to=${day}`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.summary.netSales, 0);
  assert.equal(result.channelBreakdown.website.count, 0);
  assert.equal(result.channelBreakdown.pos.count, 0);
  assert.deepEqual(result.tasks.pendingOrders, []);
});
