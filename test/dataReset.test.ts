import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { memoryFirestore } from './memoryFirestore.js';
import { config } from '../server/config.js';
import { ownerPinMatches, previewReset, runReset } from '../server/reset.js';

const db = getFirestore(initializeApp({ projectId: 'reset-test' }, 'reset-test'));
const { records } = memoryFirestore(db);
function seed() {
  records.clear();
  const put = (path: string, data: Record<string, unknown>) => records.set(path, data);
  put('products/p1', { name: 'Shirt' }); put('stockMovements/m1', { delta: 1 });
  put('erp_customerProfiles/c1', { name: 'Asha' }); put('erp_creditAccounts/c1', { balance: 100 });
  put('orders/pos1', { createdBy: 'admin-pos' }); put('orders/web1', { totalAmount: 900 });
  put('erp_orderMeta/pos1', { channel: 'POS' }); put('erp_orderMeta/web1', { channel: 'Website' });
  put('erp_invoices/BOG-1', { orderId: 'pos1' }); put('erp_suppliers/s1', { name: 'Supplier' });
  put('users/u1', { email: 'website@example.com' }); put('erp_staff/st1', { name: 'Cashier' });
}

test('partial reset deletes only the chosen area and keeps website orders and accounts', async () => {
  seed();
  assert.equal((await previewReset(db, ['sales'])).total, 3);
  const result = await runReset(db, ['sales']);
  assert.equal(result.total, 3);
  assert.ok(!records.has('orders/pos1') && !records.has('erp_orderMeta/pos1') && !records.has('erp_invoices/BOG-1'));
  assert.ok(records.has('orders/web1') && records.has('erp_orderMeta/web1'));
  assert.ok(records.has('products/p1') && records.has('erp_customerProfiles/c1') && records.has('erp_suppliers/s1'));
  assert.ok([...records.keys()].some(key => key.startsWith('erp_auditLog/reset_')));

  await runReset(db, ['customers']);
  assert.ok(!records.has('erp_customerProfiles/c1') && !records.has('erp_creditAccounts/c1') && records.has('products/p1'));
});

test('full reset clears all shop areas but never website accounts, online orders or staff', async () => {
  seed();
  await runReset(db, ['all']);
  for (const gone of ['products/p1', 'stockMovements/m1', 'erp_customerProfiles/c1', 'orders/pos1', 'erp_invoices/BOG-1', 'erp_suppliers/s1'])
    assert.ok(!records.has(gone), gone);
  for (const kept of ['users/u1', 'erp_staff/st1', 'orders/web1']) assert.ok(records.has(kept), kept);
});

test('reset requires the exact owner PIN', () => {
  const previous = config.adminPin;
  (config as { adminPin?: string }).adminPin = '4821';
  try {
    assert.equal(ownerPinMatches('4821'), true);
    for (const wrong of ['1234', '482', '48210', '', undefined, 4821]) assert.equal(ownerPinMatches(wrong), false);
  } finally { (config as { adminPin?: string }).adminPin = previous; }
});
