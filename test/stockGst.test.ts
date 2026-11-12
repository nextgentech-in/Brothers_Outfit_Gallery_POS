import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockValueRows } from '../shared/stockGst.js';

test('GST stock valuation uses available units and selling price only', () => {
  const rows = stockValueRows([
    { id: 'shirt', name: 'Shirt', sku: 'SHIRT', gstEnabled: true, gstPercent: 5, salePrice: 200, variants: [
      { sku: 'SHIRT-M', stock: 3, reserved: 1, price: 250, size: 'M' },
      { sku: 'SHIRT-L', stock: 1, price: 200, size: 'L' }
    ] },
    { id: 'belt', name: 'Belt', stock: 2, salePrice: 100, gstEnabled: false, gstPercent: 18 },
    { id: 'sample', name: 'Sample', stock: 10, salePrice: 1000, gstEnabled: true, gstPercent: 18 }
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => [row.sku, row.quantity, row.baseValue, row.gstValue, row.totalValue]), [
    ['SHIRT-M', 2, 500, 25, 525],
    ['SHIRT-L', 1, 200, 10, 210],
    ['belt', 2, 200, 0, 200]
  ]);
});
