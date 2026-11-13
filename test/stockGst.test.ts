import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockValueRows } from '../shared/stockGst.js';

test('GST stock valuation uses available units and cost price', () => {
  const rows = stockValueRows([
    { id: 'shirt', name: 'Shirt', sku: 'SHIRT', gstEnabled: true, gstPercent: 5, salePrice: 200, costPrice: 100, variants: [
      { sku: 'SHIRT-M', stock: 3, reserved: 1, price: 250, costPrice: 120, size: 'M' },
      { sku: 'SHIRT-L', stock: 1, price: 200, size: 'L' }
    ] },
    { id: 'belt', name: 'Belt', stock: 2, salePrice: 100, costPrice: 60, gstEnabled: false, gstPercent: 18 },
    { id: 'sample', name: 'Sample', stock: 10, salePrice: 1000, gstEnabled: true, gstPercent: 18 }
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => [row.sku, row.quantity, row.baseValue, row.gstValue, row.totalValue]), [
    ['SHIRT-M', 2, 240, 12, 252],
    ['SHIRT-L', 1, 100, 5, 105],
    ['belt', 2, 120, 0, 120]
  ]);
});
