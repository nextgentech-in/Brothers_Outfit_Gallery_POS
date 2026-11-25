import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { purchasesRouter } from '../server/purchases.js';
import { commerceRouter } from '../server/commerce.js';
import { adminEditsRouter, coinsToReverse, reweightCost } from '../server/adminEdits.js';
import { dueDateAfter } from '../shared/credit.js';

const db = getFirestore(initializeApp({ projectId: 'demo-admin-edits' }, 'brothers-admin'));
const { records } = memoryFirestore(db);
const app = express();
app.use(express.json(), (req, res, next) => { res.locals.owner = { uid: 'test', role: req.get('x-role') || 'owner' }; next(); },
  purchasesRouter, commerceRouter, adminEditsRouter);
const server = app.listen(0, '127.0.0.1'); let base = '';
before(async () => {
  if (!server.listening) await new Promise<void>(r => server.once('listening', r));
  const a = server.address(); assert.ok(a && typeof a !== 'string'); base = `http://127.0.0.1:${a.port}`;
  records.set('erp_suppliers/sup-1', { name: 'Supplier', active: true });
  records.set('erp_loyaltySettings/defaults', { rule: { rate: 1, minimum: 0 } });
  records.set('products/shirt', { name: 'Shirt', sku: 'SH', price: 250, salePrice: 250, mrp: 300, costPrice: 100, stock: 10, quantity: 10, reserved: 0,
    variants: [{ sku: 'SH-M', size: 'M', color: 'Blue', stock: 10, quantity: 10, reserved: 0, price: 250, mrp: 300, costPrice: 100 },
      { sku: 'SH-L', size: 'L', color: 'Blue', stock: 0, quantity: 0, reserved: 0, price: 250, mrp: 300, costPrice: 100 }] });
});
after(() => new Promise<void>((resolve, reject) => server.close(e => { mock.restoreAll(); e ? reject(e) : resolve(); })));
const post = async (path: string, payload: unknown, role = 'owner') => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-role': role }, body: JSON.stringify(payload) });
  return { status: r.status, body: await r.json() };
};
const variant = (sku: string) => records.get('products/shirt')!.variants.find((v: any) => v.sku === sku);
const cost = (sku: string) => records.get('erp_productCostPrices/shirt')?.variants.find((v: any) => v.sku === sku)?.costPrice;
const coins = (key: string) => Number(records.get(`erp_loyaltyAccounts/${key}`)?.balance || 0);
const ledger = (key: string) => [...records].filter(([k, v]) => k.startsWith('erp_customerLedger/') && v.customerKey === key).map(([, v]) => v);
const sale = (requestId: string, extra: Record<string, unknown> = {}) => post('/pos/sale', { requestId, lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 2 }],
  paymentMethod: 'cash', customerName: 'Asha', customerPhone: '9876543210', customerDateOfBirth: '1990-01-01', ...extra });

test('weighted cost and coin helpers', () => {
  assert.equal(reweightCost(110, 15, 5, 130, 3, 130), 106.92);
  assert.equal(reweightCost(110, 15, 5, 130, 0, 130), 100);
  assert.equal(reweightCost(130, 5, 5, 130, 4, 120), 120);
  assert.equal(coinsToReverse(10, 5, 0), -5);
  assert.equal(coinsToReverse(2, 5, 0), -2);
  assert.equal(coinsToReverse(0, 5, 0), 0);
  assert.equal(coinsToReverse(0, 0, 3), 3);
});

test('editing a stock receipt adjusts stock by the difference and re-weights cost', async () => {
  const r = await post('/purchases/receive', { requestId: 'receipt-edit-0001', supplierId: 'sup-1', supplierInvoice: 'INV-1', amountPaid: 100,
    lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 5, unitCost: 130 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(variant('SH-M').stock, 15); assert.equal(cost('SH-M'), 110);
  const edit = { requestId: 'receipt-edit-0002', purchaseId: r.body.purchaseId, lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 3, unitCost: 130 }] };
  assert.equal((await post('/purchases/update', edit, 'cashier')).status, 403);
  const e = await post('/purchases/update', edit); assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(variant('SH-M').stock, 13); assert.equal(cost('SH-M'), 106.92);
  assert.equal((await post('/purchases/update', edit)).status, 200); assert.equal(variant('SH-M').stock, 13);
  const p = records.get(`erp_purchases/${r.body.purchaseId}`)!; assert.equal(p.total, 390); assert.equal(p.payable, 290);
  const e2 = await post('/purchases/update', { requestId: 'receipt-edit-0003', purchaseId: r.body.purchaseId,
    lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 3, unitCost: 130 }, { productId: 'shirt', sku: 'SH-L', quantity: 2, unitCost: 90 }] });
  assert.equal(e2.status, 200, JSON.stringify(e2.body));
  assert.equal(variant('SH-L').stock, 2); assert.equal(cost('SH-L'), 90); assert.equal(records.get('products/shirt')!.stock, 15);
  assert.equal((await post('/purchases/update', { requestId: 'receipt-edit-0004', purchaseId: r.body.purchaseId,
    lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 1, unitCost: 10 }] })).status, 422, 'total cannot fall below amount paid');
  assert.equal(variant('SH-L').stock, 2);
  assert.equal(records.get('products/shirt')!.variants.some((v: any) => 'costPrice' in v), false, 'costs stay out of the public product');
});

test('editing a purchase order adjusts its receipt and keeps the PO record in step', async () => {
  const r = await post('/purchases/receive', { requestId: 'order-edit-00001', supplierId: 'sup-1', supplierInvoice: 'PO-9', mode: 'order',
    lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 5, unitCost: 100 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const before = variant('SH-M').stock;
  const e = await post('/purchases/update', { requestId: 'order-edit-00002', purchaseId: r.body.purchaseId, lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 8, unitCost: 95 }] });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(variant('SH-M').stock, before + 3);
  const po = records.get(`erp_purchaseOrders/${r.body.orderId}`)!;
  assert.equal(po.total, 760); assert.equal(po.lines[0].quantity, 8);
});

test('legacy purchase orders still awaiting stock can be edited without changing stock', async () => {
  records.set('erp_purchaseOrders/PO-aaaaaaaaaaaaaaaaaaaaaaaa', { status: 'ordered', supplierId: 'sup-1', supplierName: 'Supplier', supplierInvoice: 'OLD-1', total: 100,
    lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 1, unitCost: 100 }] });
  const before = variant('SH-M').stock;
  const e = await post('/purchase-orders/update', { requestId: 'order-edit-00003', orderId: 'PO-aaaaaaaaaaaaaaaaaaaaaaaa', lines: [{ productId: 'shirt', sku: 'SH-M', quantity: 4, unitCost: 90 }] });
  assert.equal(e.status, 200, JSON.stringify(e.body)); assert.equal(records.get('erp_purchaseOrders/PO-aaaaaaaaaaaaaaaaaaaaaaaa')!.total, 360);
  assert.equal(variant('SH-M').stock, before);
});

test('deleting a bill with restock returns stock and takes coins back', async () => {
  const before = variant('SH-M').stock;
  const s = await sale('bill-delete-sale-01'); assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(variant('SH-M').stock, before - 2);
  const key = records.get(`erp_invoices/${s.body.invoiceId}`)!.customerKey;
  assert.equal(coins(key), 5);
  const del = { requestId: 'bill-delete-req-01', invoiceId: s.body.invoiceId, restock: true };
  assert.equal((await post('/invoices/delete', del, 'cashier')).status, 403);
  const d = await post('/invoices/delete', del); assert.equal(d.status, 200, JSON.stringify(d.body));
  assert.equal(d.body.coinDelta, -5); assert.equal(variant('SH-M').stock, before);
  assert.equal(records.has(`erp_invoices/${s.body.invoiceId}`), false); assert.equal(records.has(`orders/${s.body.orderId}`), false);
  assert.equal(coins(key), 0);
  assert.equal((await post('/invoices/delete', del)).status, 200); assert.equal(variant('SH-M').stock, before);
});

test('deleting permanently keeps stock deducted; coins never go below zero', async () => {
  const before = variant('SH-M').stock;
  const s = await sale('bill-delete-sale-02'); assert.equal(s.status, 201);
  const key = records.get(`erp_invoices/${s.body.invoiceId}`)!.customerKey;
  records.set(`erp_loyaltyAccounts/${key}`, { balance: coins(key) - 3 });
  const d = await post('/invoices/delete', { requestId: 'bill-delete-req-02', invoiceId: s.body.invoiceId, restock: false });
  assert.equal(d.status, 200, JSON.stringify(d.body)); assert.equal(d.body.coinDelta, -2);
  assert.equal(variant('SH-M').stock, before - 2);
  assert.equal(coins(key), 0);
});

test('deleting a credit bill clears its udhar so the customer can then be deleted', async () => {
  const s = await sale('bill-delete-sale-03', { paymentMethod: 'credit', creditDueDate: dueDateAfter(7) });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const key = records.get(`erp_invoices/${s.body.invoiceId}`)!.customerKey;
  assert.equal((await post('/customers/delete', { requestId: 'customer-delete-01', customerKey: key })).status, 409);
  const d = await post('/invoices/delete', { requestId: 'bill-delete-req-03', invoiceId: s.body.invoiceId, restock: true });
  assert.equal(d.status, 200, JSON.stringify(d.body)); assert.equal(d.body.creditReversed, 500);
  assert.equal(records.get(`erp_creditAccounts/${key}`)!.balance, 0);
  assert.equal((await post('/customers/delete', { requestId: 'customer-delete-02', customerKey: key }, 'cashier')).status, 403);
  const c = await post('/customers/delete', { requestId: 'customer-delete-02', customerKey: key });
  assert.equal(c.status, 200, JSON.stringify(c.body)); assert.equal(records.has(`erp_customerProfiles/${key}`), false);
  assert.equal((await post('/customers/delete', { requestId: 'customer-delete-03', customerKey: key })).status, 404);
});
