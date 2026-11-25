import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocumentData } from 'firebase-admin/firestore';
import { combineCosts, extractCosts, mergeCosts, stripCosts } from '../server/productCosts.js';

const legacy: DocumentData = { name: 'Shirt', costPrice: 100, cost_price: 100, purchasePrice: 100, purchase_price: 100,
  variants: [{ sku: 'S-M', price: 300, cost_price: 120 }, { sku: 'S-L', price: 300 }] };

test('stripCosts removes every cost field without mutating the input', () => {
  const stripped = stripCosts(legacy);
  assert.deepEqual(Object.keys(stripped), ['name', 'variants']);
  assert.deepEqual(stripped.variants, [{ sku: 'S-M', price: 300 }, { sku: 'S-L', price: 300 }]);
  assert.equal(legacy.costPrice, 100); assert.equal(legacy.variants[0].cost_price, 120);
});
test('extractCosts reads any legacy field name and skips unknown costs', () => {
  assert.deepEqual(extractCosts(legacy), { costPrice: 100, variants: [{ sku: 'S-M', costPrice: 120 }] });
  assert.deepEqual(extractCosts({ name: 'No cost', variants: [{ sku: 'X' }] }), { costPrice: null, variants: [] });
});
test('mergeCosts prefers private values and falls back to legacy ones', () => {
  const merged = mergeCosts(stripCosts(legacy), { costPrice: 90, variants: [{ sku: 's-l', costPrice: 95 }] });
  assert.equal(merged.costPrice, 90);
  assert.equal(merged.variants[0].costPrice, undefined); // stripped and not in the private record
  assert.equal(merged.variants[1].costPrice, 95);         // SKU match ignores case
  const fallback = mergeCosts(legacy, undefined);
  assert.equal(fallback.costPrice, 100); assert.equal(fallback.variants[0].costPrice, 120);
});
test('combineCosts updates by SKU and keeps earlier values', () => {
  const combined = combineCosts({ costPrice: 100, variants: [{ sku: 'A', costPrice: 1 }, { sku: 'B', costPrice: 2 }] },
    { costPrice: null, variants: [{ sku: 'b', costPrice: 5 }] });
  assert.equal(combined.costPrice, 100);
  assert.deepEqual(combined.variants, [{ sku: 'A', costPrice: 1 }, { sku: 'b', costPrice: 5 }]);
});
