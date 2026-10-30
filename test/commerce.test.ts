import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeStock, fiscalYear } from '../server/commerce.js';

test('the last variant unit cannot be sold twice or go below zero', () => {
  const product = { name: 'Oxford Shirt', active: false, variants: [{ sku: 'OX-M', size: 'M', stock: 1, quantity: 1 }, { sku: 'OX-L', size: 'L', stock: 2, quantity: 2 }], stock: 3 };
  const sold = changeStock(product, 'OX-M', -1);
  assert.equal(sold.after, 0);
  assert.equal(sold.product.stock, 2);
  assert.equal(sold.product.active, false);
  assert.throws(() => changeStock(sold.product, 'OX-M', -1), /Insufficient available stock/);
  assert.equal(product.variants[0].stock, 1);
});

test('POS sale cannot consume a website reservation', () => {
  const product = { sku: 'OX-M', stock: 1, quantity: 1, reserved: 1 };
  assert.throws(() => changeStock(product, 'OX-M', -1), /Insufficient available stock/);
  const returned = changeStock(product, 'OX-M', 1);
  assert.equal(returned.product.stock, 2);
  assert.equal(returned.product.reserved, 1);
});

test('financial year follows India time at midnight', () => {
  assert.equal(fiscalYear(new Date('2027-03-31T18:29:59Z')), '2026-27');
  assert.equal(fiscalYear(new Date('2027-03-31T18:30:00Z')), '2027-28');
});
