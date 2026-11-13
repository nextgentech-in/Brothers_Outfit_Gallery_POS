import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { CollectionReference, DocumentReference, getFirestore } from 'firebase-admin/firestore';
import { commerceRouter } from '../server/commerce.js';
import { customerKey } from '../server/customerIdentity.js';
import { customerDirectory } from '../server/customers.js';
import { customerDetailsError, mobileNumber, shopDate, validBirthDate, type Customer } from '../shared/customers.js';

test('birth dates reject missing, impossible and future dates while walk-ins remain valid', () => {
  assert.equal(customerDetailsError('', ''), '');
  assert.match(customerDetailsError('9876543210', ''), /date of birth/);
  assert.equal(customerDetailsError('9876543210', '2000-02-29'), '');
  for (const value of ['2001-02-29', '2000-02-30', '2000-13-01', '01/02/2000', '2000-1-2', '9999-12-31'])
    assert.equal(validBirthDate(value, '2026-11-03'), false, value);
  assert.equal(validBirthDate('2026-11-03', '2026-11-03'), true);
  assert.equal(validBirthDate('2026-11-04', '2026-11-03'), false);
  assert.equal(shopDate(new Date('2026-11-02T18:30:00Z')), '2026-11-03');
});

test('formatted mobile numbers retain Indian customer identity without merging other countries', () => {
  assert.equal(mobileNumber('98765 43210'), '919876543210');
  assert.equal(customerKey('9876543210', ''), customerKey('+91 (98765) 43210', ''));
  assert.notEqual(customerKey('+44 9876543210', ''), customerKey('9876543210', ''));
  for (const value of ['123', 'call 9876543210', '++++++++++', '00000000000']) assert.equal(mobileNumber(value), '');
});

test('directory joins website and POS contact details and includes POS-only birthdays', () => {
  const customers = customerDirectory([
    { id: 'web-user', data: { fullName: 'Website Customer', phone: '+91 9876543210', email: 'customer@example.com', privateField: 'private' } }
  ], [
    { id: 'pos-user', data: { name: '', phone: '9876543210', dateOfBirth: '2000-02-29', birthdayOffersOptIn: true } },
    { id: 'pos-only', data: { name: 'Shop Customer', phone: '9123456789', dateOfBirth: '1998-11-03' } }
  ]);
  assert.equal(customers.length, 2);
  const merged = customers.find(customer => customer.fullName === 'Website Customer')!;
  assert.equal(merged.email, 'customer@example.com');
  assert.equal(merged.dateOfBirth, '2000-02-29');
  assert.equal(merged.birthdayOffersOptIn, true);
  assert.equal('privateField' in merged, false);
  assert.equal(customers.find(customer => customer.fullName === 'Shop Customer')?.birthdayOffersOptIn, false);
});

// Exercise the real HTTP handlers and transaction callback against an isolated in-memory store.
// No service account, emulator, production database, or messaging provider is used.
const db = getFirestore(initializeApp({ projectId: 'demo-customer-birthdays' }, 'brothers-admin'));
const records = new Map<string, Record<string, unknown>>();
const snapshot = (ref: { id: string; path: string }) => ({ id: ref.id, exists: records.has(ref.path), data: () => records.get(ref.path) });
mock.method(DocumentReference.prototype, 'get', async function (this: DocumentReference) { return snapshot(this); });
mock.method(CollectionReference.prototype, 'get', async function (this: CollectionReference) {
  return { docs: [...records].filter(([path]) => path.startsWith(`${this.path}/`)).map(([path]) => snapshot({ path, id: path.split('/').at(-1)! })) };
});
let transactions = 0;
mock.method(db, 'runTransaction', async (operation: (tx: unknown) => Promise<unknown>) => {
  transactions++;
  const writes: (() => void)[] = [];
  const stage = (ref: { path: string }, data: Record<string, unknown>, merge = false) => writes.push(() => {
    records.set(ref.path, { ...(merge ? records.get(ref.path) : {}), ...data });
  });
  const result = await operation({
    get: async (ref: DocumentReference) => snapshot(ref),
    getAll: async (...refs: DocumentReference[]) => refs.map(snapshot),
    create: (ref: DocumentReference, data: Record<string, unknown>) => { assert.equal(records.has(ref.path), false); stage(ref, data); },
    update: (ref: DocumentReference, data: Record<string, unknown>) => stage(ref, data, true),
    set: (ref: DocumentReference, data: Record<string, unknown>, options?: { merge: boolean }) => stage(ref, data, options?.merge)
  });
  writes.forEach(write => write());
  return result;
});
const app = express();
app.use(express.json(), commerceRouter);
const server = app.listen(0, '127.0.0.1');
let base: string;
before(async () => {
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server');
  base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => { mock.restoreAll(); error ? reject(error) : resolve(); })));
const postSale = (body: unknown) => fetch(`${base}/pos/sale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const sale = { requestId: 'birthday-sale-0001', lines: [{ productId: 'shirt', sku: 'SHIRT-M', quantity: 1 }],
  paymentMethod: 'cash', customerPhone: '9876543210', customerName: 'Shop Customer', customerDateOfBirth: '2000-02-29', birthdayOffersOptIn: true };

test('sale API rejects a phone without a valid birthday before starting a transaction', async () => {
  const before = transactions;
  for (const customerDateOfBirth of [undefined, '', '2001-02-29', '9999-12-31']) {
    const response = await postSale({ ...sale, customerDateOfBirth });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /date of birth/);
  }
  assert.equal(transactions, before);
});

test('sale persists birthday once, exposes it in Customers and lookup, and preserves unrelated profile fields', async () => {
  records.set('products/shirt', { name: 'Shirt', sku: 'SHIRT-M', stock: 5, price: 400 });
  const profilePath = `erp_customerProfiles/${customerKey(sale.customerPhone, '')}`;
  records.set(profilePath, { email: 'existing@example.com', loyaltyTier: 'gold' });
  records.set('users/existing-user', { fullName: 'Website Customer', phone: '+91 9876543210' });
  const first = await postSale(sale);
  assert.equal(first.status, 201);
  const receipt = await first.json();
  assert.equal(records.get(profilePath)?.dateOfBirth, '2000-02-29');
  assert.equal(records.get(profilePath)?.phone, '919876543210');
  assert.equal(records.get(profilePath)?.birthdayOffersOptIn, true);
  assert.equal(records.get(profilePath)?.email, 'existing@example.com');
  assert.equal(records.get(profilePath)?.loyaltyTier, 'gold');
  assert.equal(records.get('products/shirt')?.stock, 4);
  assert.equal(records.get(`erp_invoices/${receipt.invoiceId}`)?.dateOfBirth, undefined);
  const repeated = await postSale(sale);
  assert.equal(repeated.status, 201);
  assert.deepEqual(await repeated.json(), receipt);
  assert.equal(records.get('products/shirt')?.stock, 4);
  const list = await (await fetch(`${base}/customers`)).json() as { items: Customer[] };
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].dateOfBirth, '2000-02-29');
  const lookup = await (await fetch(`${base}/customers/by-phone?phone=9876543210`)).json();
  assert.equal(lookup.customer.dateOfBirth, '2000-02-29');
  assert.equal(lookup.customer.birthdayOffersOptIn, true);
  assert.equal((await (await fetch(`${base}/customers/by-phone?phone=9123456789`)).json()).customer, null);
  assert.equal((await fetch(`${base}/customers/by-phone?phone=bad`)).status, 422);
  const changed = await postSale({ ...sale, customerDateOfBirth: '1999-01-01' });
  assert.equal(changed.status, 409);
  assert.equal(records.get(profilePath)?.dateOfBirth, '2000-02-29');
  const revokeOffers = await postSale({ ...sale, requestId: 'birthday-sale-0002', birthdayOffersOptIn: false });
  assert.equal(revokeOffers.status, 201);
  assert.equal(records.get(profilePath)?.birthdayOffersOptIn, false);
  assert.equal(records.get(profilePath)?.dateOfBirth, '2000-02-29');
});

test('walk-in sale still succeeds without creating a customer birthday profile', async () => {
  records.set('products/walk-in-shirt', { name: 'Shirt', sku: 'WALK-M', stock: 1, price: 200 });
  const profilesBefore = [...records.keys()].filter(path => path.startsWith('erp_customerProfiles/')).length;
  const response = await postSale({ requestId: 'walk-in-sale-0001', lines: [{ productId: 'walk-in-shirt', sku: 'WALK-M', quantity: 1 }], paymentMethod: 'cash' });
  assert.equal(response.status, 201);
  assert.equal([...records.keys()].filter(path => path.startsWith('erp_customerProfiles/')).length, profilesBefore);
});

test('bill number and India bill time are saved once, and duplicate numbers do not change stock', async () => {
  records.set('products/manual-bill-shirt', { name: 'Shirt', sku: 'MANUAL-M', stock: 3, price: 200 });
  const saleInput = { requestId: 'manual-bill-sale-0001', lines: [{ productId: 'manual-bill-shirt', sku: 'MANUAL-M', quantity: 1 }],
    paymentMethod: 'cash', invoiceNumber: 42, invoiceDate: '2025-02-01', invoiceTime: '13:15' };
  const first = await postSale(saleInput);
  assert.equal(first.status, 201);
  const receipt = await first.json();
  assert.equal(receipt.invoiceId, 'BOG-2024-25-00042');
  const issuedAt = records.get(`erp_invoices/${receipt.invoiceId}`)?.issuedAt as { toDate(): Date };
  assert.equal(issuedAt.toDate().toISOString(), '2025-02-01T07:45:00.000Z');
  const duplicate = await postSale({ ...saleInput, requestId: 'manual-bill-sale-0002' });
  assert.equal(duplicate.status, 409);
  assert.equal(records.get('products/manual-bill-shirt')?.stock, 2);
  const next = await postSale({ ...saleInput, requestId: 'manual-bill-sale-0003', invoiceNumber: undefined });
  assert.equal(next.status, 201);
  assert.equal((await next.json()).invoiceId, 'BOG-2024-25-00043');
});
