import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invoicePdf } from '../server/invoicePdf.js';

test('receipt PDF has a valid envelope and no injected PDF syntax from item text', () => {
  const pdf = invoicePdf({ id: 'BOG-2026-27-00001', orderId: 'POS-1', total: 100,
    lines: [{ name: 'Shirt (Blue) \\ sample', quantity: 1, price: 100 }] });
  assert.ok(pdf.toString('ascii').startsWith('%PDF-1.4'));
  assert.ok(pdf.toString('ascii').includes('%%EOF'));
  assert.ok(pdf.toString('ascii').includes('Shirt \\(Blue\\) \\\\ sample'));
  assert.ok(pdf.length > 500);
});
