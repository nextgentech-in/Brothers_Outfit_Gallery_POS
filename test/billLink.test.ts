import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerBillUrl, validBillLink } from '../server/billLink.js';

test('customer bill links are signed, scoped to one invoice and expire', () => {
  const now = Date.now();
  const url = new URL(customerBillUrl('BOG-26-00001', now));
  const expiry = url.searchParams.get('expires');
  const signature = url.searchParams.get('sig');
  assert.equal(url.pathname, '/api/public/bills/BOG-26-00001/pdf');
  assert.equal(validBillLink('BOG-26-00001', expiry, signature, now), true);
  assert.equal(validBillLink('BOG-26-00002', expiry, signature, now), false);
  assert.equal(validBillLink('BOG-26-00001', expiry, signature, now + 31 * 24 * 60 * 60 * 1000), false);
  assert.equal(validBillLink('BOG-26-00001', expiry, '0'.repeat(32), now), false);
});
