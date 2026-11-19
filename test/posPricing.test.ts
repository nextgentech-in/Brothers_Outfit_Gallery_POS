import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { commerceRouter } from '../server/commerce.js';
import { priceBillLine } from '../shared/billPricing.js';

const db = getFirestore(initializeApp({ projectId: 'demo-pos-pricing' }, 'brothers-admin'));
const { records } = memoryFirestore(db);
let role = 'owner';
const app = express();
app.use(express.json(), (_req, res, next) => { res.locals.owner = { uid: 'test-owner', role }; next(); }, commerceRouter);
const server = app.listen(0, '127.0.0.1');
let base = '', productId = '';
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => { mock.restoreAll(); error ? reject(error) : resolve(); })));
async function post(path: string, body: unknown) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
const input = { requestId: 'pos-price-create-01', name: 'Custom price shirt', sku: 'CUSTOM-SHIRT', category: 'Shirts',
  mrp: 1000, salePrice: 800, costPrice: 400, customPrice: 650,
  variants: [{ size: 'M', color: 'Black', stock: 10, price: 800, costPrice: 400 }] };

test('create keeps custom price private and returns it to POS', async () => {
  const result = await post('/products/create', input);
  assert.equal(result.status, 201, JSON.stringify(result.body)); productId = result.body.productId;
  const product = records.get(`products/${productId}`)!;
  assert.equal(product.salePrice, 800); assert.equal(product.customPrice, undefined);
  assert.equal(product.variants[0].price, 800); assert.equal(product.variants[0].customPrice, undefined);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 650);
  const catalog = await (await fetch(base + '/products')).json();
  assert.equal(catalog.items[0].customPrice, 650);
  assert.equal((await post('/products/create', { ...input, requestId: 'invalid-pos-price-01', customPrice: 1001 })).status, 422);
  assert.equal((await post('/products/create', { ...input, requestId: 'invalid-pos-price-02', customPrice: -1 })).status, 422);
});

test('POS custom price posts correct totals and owner can override it for one bill', async () => {
  const sku = records.get(`products/${productId}`)!.variants[0].sku;
  const sale = { customerName: 'Test Buyer', customerPhone: '8765432109', paymentMethod: 'cash',
    lines: [{ productId, sku, quantity: 2 }] };
  role = 'cashier';
  const standard = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-01', expectedTotal: 1300 });
  assert.equal(standard.status, 201, JSON.stringify(standard.body)); assert.equal(standard.body.total, 1300);
  const pricing = priceBillLine(2, 1000, 650, 'price');
  const cashier = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-02', lines: [{ productId, sku, quantity: 2, price: 1000, discount: pricing.discount }], expectedTotal: 1300 });
  assert.equal(cashier.status, 201, JSON.stringify(cashier.body));
  role = 'owner';
  const edited = await post('/pos/sale', { ...sale, requestId: 'custom-price-sale-03', lines: [{ productId, sku, quantity: 2, price: 1000, discount: 800 }], expectedTotal: 1200 });
  assert.equal(edited.status, 201, JSON.stringify(edited.body)); assert.equal(edited.body.total, 1200);
  assert.equal(records.get(`products/${productId}`)?.salePrice, 800);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 650);
});

test('patch validates, updates and clears the private price without changing website pricing', async () => {
  const patch = (requestId: string, changes: object) => post('/products/patch', { requestId, productId, patch: changes });
  assert.equal((await patch('custom-price-patch-01', { customPrice: 700 })).status, 200);
  assert.equal(records.get(`erp_posPricing/${productId}`)?.customPrice, 700);
  assert.equal((await patch('custom-price-patch-02', { customPrice: 1001 })).status, 422);
  assert.equal((await patch('custom-price-patch-03', { mrp: 600, salePrice: 500 })).status, 422);
  assert.equal((await patch('custom-price-patch-04', { customPrice: null })).status, 200);
  const catalog = await (await fetch(base + '/products')).json();
  assert.equal(catalog.items[0].customPrice, null); assert.equal(catalog.items[0].price, 800);
});
