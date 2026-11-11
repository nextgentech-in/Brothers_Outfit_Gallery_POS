import assert from 'node:assert/strict';
import { test, before, after, mock } from 'node:test';
import express from 'express';
import { commerceRouter } from '../server/commerce.js';
import { memoryFirestore } from './memoryFirestore.js';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from '../server/config.js';

const appName = 'brothers-admin';
const fbApp = getApps().find(a => a.name === appName) || initializeApp({ projectId: 'demo-global-search' }, appName);
const db = getFirestore(fbApp);
const { records } = memoryFirestore(db);

const app = express();
app.use(express.json(), commerceRouter);
const server = app.listen(0, '127.0.0.1');
let base = '';

before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  base = `http://127.0.0.1:${address.port}`;

  // Seed sample products
  records.set('products/prod-1', {
    name: 'Royal Blue Suit',
    productNumber: 12,
    barcode: 'BOG-000012-001',
    sku: 'ROYAL-SUIT-M',
    price: 3999,
    mrp: 5999,
    stock: 5,
    variants: [
      { sku: 'ROYAL-SUIT-M', barcode: 'BOG-000012-001', size: 'M', color: 'Blue', price: 3999, stock: 5 }
    ]
  });

  records.set('products/prod-2', {
    name: 'Casual Denim Jacket',
    productNumber: 15,
    barcode: 'BOG-000015-001',
    sku: 'DENIM-JACKET-L',
    price: 1999,
    mrp: 2999,
    stock: 8,
    variants: [
      { sku: 'DENIM-JACKET-L', barcode: 'BOG-000015-001', size: 'L', color: 'Blue', price: 1999, stock: 8 }
    ]
  });

  // Seed sample supplier
  records.set('erp_suppliers/sup-1', {
    name: 'Surat Textiles Wholesaler',
    phone: '9876543210',
    gstin: '24AAAAA0000A1Z5',
    active: true
  });
});

after(() => new Promise<void>((resolve, reject) => server.close(error => {
  mock.restoreAll();
  error ? reject(error) : resolve();
})));

test('GET /search with productNumber (#12 or 12) matches product 12 with highest priority', async () => {
  const res1 = await fetch(`${base}/search?q=%2312`);
  assert.equal(res1.status, 200);
  const data1 = await res1.json() as any;
  assert.ok(data1.products.length >= 1);
  assert.equal(data1.products[0].productNumber, 12);
  assert.equal(data1.products[0].name, 'Royal Blue Suit');

  const res2 = await fetch(`${base}/search?q=12`);
  assert.equal(res2.status, 200);
  const data2 = await res2.json() as any;
  assert.ok(data2.products.length >= 1);
  assert.equal(data2.products[0].productNumber, 12);
});

test('GET /search matches exact barcode string BOG-000015-001', async () => {
  const res = await fetch(`${base}/search?q=BOG-000015-001`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.ok(data.products.length >= 1);
  assert.equal(data.products[0].productNumber, 15);
  assert.equal(data.products[0].name, 'Casual Denim Jacket');
});

test('GET /search matches supplier by name or phone', async () => {
  const res = await fetch(`${base}/search?q=Surat`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.ok(data.suppliers.length >= 1);
  assert.equal(data.suppliers[0].name, 'Surat Textiles Wholesaler');
});

test('GET /search returns empty results on empty query', async () => {
  const res = await fetch(`${base}/search?q=`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.deepEqual(data.products, []);
  assert.deepEqual(data.customers, []);
  assert.deepEqual(data.suppliers, []);
  assert.deepEqual(data.orders, []);
});
