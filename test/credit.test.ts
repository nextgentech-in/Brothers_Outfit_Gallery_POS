import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creditRouter } from '../server/credit.js';
import { returnsRouter } from '../server/returns.js';
import { commerceRouter } from '../server/commerce.js';
import { creditSummary, dueDateAfter, type CreditEntry } from '../shared/credit.js';
import { shopDate } from '../shared/customers.js';
import { memoryFirestore } from './memoryFirestore.js';
import { config } from '../server/config.js';
import { deliverCustomerMessage, whatsappConnectionStatus } from '../server/customerMessages.js';
import { invoicePdf } from '../server/invoicePdf.js';

test('partial payments settle oldest credit in paise and preserve later due dates', () => {
  const rows: CreditEntry[] = [
    { id: 'first', customerKey: 'customer', creditDelta: 100.15, dueDate: '2026-11-01', sequence: 1, createdAt: null },
    { id: 'second', customerKey: 'customer', creditDelta: 200, dueDate: '2026-11-20', sequence: 2, createdAt: null },
    { id: 'payment', customerKey: 'customer', creditDelta: -120.10, kind: 'payment', sequence: 3, createdAt: null }
  ];
  const summary = creditSummary(rows, '2026-11-05');
  assert.equal(summary.balance, 180.05); assert.equal(summary.received, 120.1);
  assert.equal(summary.overdue, 0); assert.equal(summary.nextDueDate, '2026-11-20');
  assert.equal(summary.debts[0].remaining, 0);
  assert.equal(dueDateAfter(7, '2026-12-28'), '2027-01-04');
  assert.throws(() => creditSummary([...rows, { id: 'excess', customerKey: 'customer', creditDelta: -1000, sequence: 4, createdAt: null }]), /review/);
});
test('credit receipt says payment due and prints the repayment date', () => {
  const pdf = invoicePdf({ id: 'test', total: 200, paymentMethod: 'credit', creditDueDate: '2026-12-01' }).toString();
  assert.match(pdf, /PAYMENT DUE/); assert.match(pdf, /2026-12-01/); assert.doesNotMatch(pdf, /PAYMENT RECEIVED/);
});

const db = getFirestore(initializeApp({ projectId: 'demo-credit-ledger' }, 'brothers-admin'));
const { records, timestamp } = memoryFirestore(db);
const app = express(); app.use(express.json(), creditRouter, commerceRouter, returnsRouter);
const server = app.listen(0, '127.0.0.1'); let base = '';
const originalWhatsApp = { ...config.whatsapp };
config.whatsapp.accessToken = '';
before(async () => {
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address'); base = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => { Object.assign(config.whatsapp, originalWhatsApp); mock.restoreAll(); error ? reject(error) : resolve(); })));
const post = async (path: string, data: unknown) => { const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { status: response.status, body: await response.json() }; };
const create = { requestId: 'create-credit-customer-01', name: 'Credit Customer', phone: '9876543210', dateOfBirth: '1998-02-28',
  openingAmount: 500, dueDate: dueDateAfter(7), creditWhatsAppOptIn: true };
let key: string;

test('customer creation records opening credit and exactly one automatic message', async () => {
  const invalid = await post('/credit/customers', { ...create, dueDate: undefined }); assert.equal(invalid.status, 422);
  const result = await post('/credit/customers', create); assert.equal(result.status, 201); key = result.body.customerKey;
  assert.equal(result.body.balance, 500); assert.equal(result.body.message.status, 'pending');
  const repeat = await post('/credit/customers', create); assert.equal(repeat.status, 201);
  assert.equal([...records.keys()].filter(path => path.startsWith('erp_customerMessages/')).length, 1);
  assert.equal([...records.keys()].filter(path => path.startsWith('erp_customerLedger/')).length, 1);
  const duplicate = await post('/credit/customers', { ...create, requestId: 'another-customer-create' }); assert.equal(duplicate.status, 409);
});
test('partial repayment is idempotent and overpayment is rejected without changing balance', async () => {
  const payload = { requestId: 'partial-payment-0001', customerKey: key, kind: 'payment', amount: 125.25, paymentMethod: 'upi' };
  const first = await post('/credit/entries', payload); assert.equal(first.status, 201); assert.equal(first.body.balance, 374.75);
  const repeated = await post('/credit/entries', payload); assert.equal(repeated.status, 201); assert.equal(repeated.body.balance, 374.75);
  const changed = await post('/credit/entries', { ...payload, amount: 100 }); assert.equal(changed.status, 409);
  const excess = await post('/credit/entries', { ...payload, requestId: 'excess-payment-0001', amount: 400 }); assert.equal(excess.status, 422);
  const detail = await (await fetch(`${base}/credit/customers/${key}`)).json(); assert.equal(detail.customer.summary.balance, 374.75);
  assert.equal(detail.entries.length, 2); assert.equal(detail.customer.summary.nextDueDate, create.dueDate);
});
test('simultaneous repayments cannot overdraw the customer ledger', async () => {
  const payments = await Promise.all(['a', 'b'].map(suffix => post('/credit/entries', {
    requestId: `concurrent-payment-${suffix}`, customerKey: key, kind: 'payment', amount: 300, paymentMethod: 'cash'
  })));
  assert.deepEqual(payments.map(p => p.status).sort(), [201, 422]);
  const detail = await (await fetch(`${base}/credit/customers/${key}`)).json(); assert.equal(detail.customer.summary.balance, 74.75);
});
test('credit sale requires a named customer and due date, and returns cancel only unpaid credit', async () => {
  records.set('products/credit-shirt', { name: 'Shirt', sku: 'C-M', stock: 3, price: 200 });
  const sale = { requestId: 'credit-sale-0001', lines: [{ productId: 'credit-shirt', sku: 'C-M', quantity: 1 }], paymentMethod: 'credit',
    customerName: create.name, customerPhone: create.phone, customerDateOfBirth: create.dateOfBirth, creditDueDate: dueDateAfter(15), creditWhatsAppOptIn: true };
  assert.equal((await post('/pos/sale', { ...sale, creditDueDate: undefined })).status, 422);
  assert.equal((await post('/pos/sale', { ...sale, customerName: '' })).status, 422);
  const result = await post('/pos/sale', sale); assert.equal(result.status, 201);
  assert.equal(records.get(`erp_creditAccounts/${key}`)?.balance, 274.75);
  assert.equal(records.get(`erp_invoices/${result.body.invoiceId}`)?.creditDueDate, sale.creditDueDate);
  assert.equal((await post('/credit/entries', { requestId: 'sale-part-payment-01', customerKey: key, kind: 'payment', amount: 174.75, paymentMethod: 'cash' })).body.balance, 100);
  const returned = await post('/orders/return', { requestId: 'credit-return-0001', orderId: result.body.orderId, reason: 'Customer return' });
  assert.equal(returned.status, 201); assert.equal(records.get(`erp_creditAccounts/${key}`)?.balance, 0);
  assert.equal(records.get(`erp_returns/${result.body.orderId}`)?.creditCancelled, 100);
  assert.equal(records.get(`erp_returns/${result.body.orderId}`)?.refundAmountToReview, 100);
  assert.equal(records.get('products/credit-shirt')?.stock, 3);
  const repeat = await post('/orders/return', { requestId: 'credit-return-0001', orderId: result.body.orderId, reason: 'Customer return' });
  assert.equal(repeat.status, 201); assert.equal(records.get('products/credit-shirt')?.stock, 3);
});
test('credit list includes legacy balances and distinguishes undated debt', async () => {
  const legacy = `phone_${'a'.repeat(64)}`;
  records.set(`erp_customerProfiles/${legacy}`, { name: 'Legacy', phone: '9123456780' });
  records.set('erp_customerLedger/old-sale', { customerKey: legacy, creditDelta: 250, createdAt: timestamp(new Date('2025-01-01')) });
  const list = await (await fetch(base + '/credit/customers')).json();
  const row = list.items.find((item: { customerKey: string }) => item.customerKey === legacy);
  assert.equal(row.summary.balance, 250); assert.equal(row.summary.undated, 250); assert.equal(row.summary.nextDueDate, null);
  records.delete(`erp_customerProfiles/${legacy}`);
  const orphanList = await (await fetch(base + '/credit/customers')).json();
  const orphan = orphanList.items.find((item: { customerKey: string }) => item.customerKey === legacy);
  assert.equal(orphan.summary.balance, 250); assert.equal(orphan.profileAvailable, false);
  const orphanDetail = await (await fetch(`${base}/credit/customers/${legacy}`)).json();
  assert.equal(orphanDetail.customer.summary.balance, 250); assert.equal(orphanDetail.customer.profileAvailable, false);
});

function configured() { Object.assign(config.whatsapp, { paidTemplatesEnabled: true, graphVersion: 'v25.0', phoneNumberId: '12345', accessToken: 'test-provider-token', creditTemplateName: 'credit_update', templateLanguage: 'en_US', businessAccountId: '67890' }); }
function pendingMessage(id: string, optIn = true) {
  records.set(`erp_customerProfiles/${key}`, { ...records.get(`erp_customerProfiles/${key}`), creditWhatsAppOptIn: optIn });
  records.set(`erp_customerMessages/${id}`, { customerKey: key, name: 'Credit Customer', phone: '919876543210', action: 'Payment received', amount: 100,
    balance: 0, dueDate: '', consent: true, status: 'pending', attempts: 0, createdAt: timestamp(new Date()) });
}
test('WhatsApp status distinguishes missing setup from a verified connection and hides tokens', async () => {
  const missing = await whatsappConnectionStatus(); assert.equal(missing.connection, 'not_configured');
  configured();
  const provider = mock.method(globalThis, 'fetch', async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes('message_templates')
    ? { data: [{ name: 'credit_update', status: 'APPROVED', language: 'en_US' }] }
    : { display_phone_number: '+91 9876543210', verified_name: 'Test shop', quality_rating: 'GREEN' }), { status: 200 }));
  try {
    const status = await whatsappConnectionStatus(); assert.equal(status.connection, 'connected'); assert.equal(status.templateStatus, 'APPROVED');
    assert.doesNotMatch(JSON.stringify(status), /test-provider-token/);
  } finally { provider.mock.restore(); }
  const denied = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  try { assert.equal((await whatsappConnectionStatus()).connection, 'error'); } finally { denied.mock.restore(); }
});
test('automatic credit messages are claimed once and use the approved-template fields', async () => {
  configured(); pendingMessage('send-once'); let calls = 0;
  const provider = mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    calls++; const body = JSON.parse(String(init?.body)); assert.equal(body.to, '919876543210');
    assert.equal(body.template.name, 'credit_update'); assert.equal(body.template.components[0].parameters.length, 5);
    return new Response(JSON.stringify({ messages: [{ id: 'provider-message-01' }] }), { status: 200 });
  });
  try {
    await Promise.all([deliverCustomerMessage(db, 'send-once'), deliverCustomerMessage(db, 'send-once')]);
    assert.equal(calls, 1); assert.equal(records.get('erp_customerMessages/send-once')?.status, 'accepted');
    await deliverCustomerMessage(db, 'send-once'); assert.equal(calls, 1);
  } finally { provider.mock.restore(); }
});
test('revoked consent suppresses queued messages and timeout outcomes never resend automatically', async () => {
  pendingMessage('revoked', false); let calls = 0;
  const provider = mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('timeout'); });
  try {
    await deliverCustomerMessage(db, 'revoked'); assert.equal(calls, 0); assert.equal(records.get('erp_customerMessages/revoked')?.status, 'consent_missing');
    pendingMessage('timeout'); await deliverCustomerMessage(db, 'timeout'); assert.equal(calls, 1);
    assert.equal(records.get('erp_customerMessages/timeout')?.status, 'unknown');
    await deliverCustomerMessage(db, 'timeout'); assert.equal(calls, 1);
  } finally { provider.mock.restore(); }
});
test('interrupted message claims require review and known provider rejections can be identified', async () => {
  pendingMessage('interrupted'); records.set('erp_customerMessages/interrupted', { ...records.get('erp_customerMessages/interrupted'), status: 'processing', leaseUntil: timestamp(new Date(0)) });
  await deliverCustomerMessage(db, 'interrupted'); assert.equal(records.get('erp_customerMessages/interrupted')?.status, 'unknown');
  pendingMessage('rejected'); const provider = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 400 }));
  try { await deliverCustomerMessage(db, 'rejected'); assert.equal(records.get('erp_customerMessages/rejected')?.status, 'failed'); }
  finally { provider.mock.restore(); }
});
