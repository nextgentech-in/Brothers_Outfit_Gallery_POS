import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capitalColorPatch, colorName } from '../shared/colors.js';

test('colour migration changes only colour text, never stock, names, SKUs or image URLs', () => {
  const product = {
    name: 'Premium Cotton Shirt', sku: 'SHT-1', stock: 7, primaryColor: 'Navy Blue',
    colors: [{ name: 'Navy Blue', hex: '#1F2A44' }, 'black'],
    variants: [
      { sku: 'SHT-1-NAVY-BLUE-M', size: 'M', color: 'Navy Blue', stock: 4, quantity: 4, price: 999 },
      { sku: 'SHT-1-BLACK-L', size: 'L', color: ' black ', stock: 3, quantity: 3, price: 999 },
      { sku: 'SHT-1-STANDARD-XL', size: 'XL', color: 'Standard', stock: 0, quantity: 0, price: 999 }
    ],
    images: ['https://img/x.jpg', { url: 'https://img/navy.jpg', color: 'Navy Blue', isColorPrimary: true }, { url: 'https://img/all.jpg', color: '' }]
  };
  const patch = capitalColorPatch(product)!;
  assert.deepEqual(Object.keys(patch).sort(), ['colors', 'images', 'primaryColor', 'variants']);
  assert.equal(patch.primaryColor, 'NAVY BLUE');
  assert.deepEqual(patch.colors, [{ name: 'NAVY BLUE', hex: '#1F2A44' }, 'BLACK']);
  assert.deepEqual(patch.variants, [
    { ...product.variants[0], color: 'NAVY BLUE' }, { ...product.variants[1], color: 'BLACK' }, product.variants[2]]);
  assert.deepEqual(patch.images, [product.images[0], { ...(product.images[1] as object), color: 'NAVY BLUE' }, product.images[2]]);
  assert.ok(!('name' in patch) && !('stock' in patch) && !('sku' in patch));
  // Already in CAPITALS: nothing to write, so running twice is safe.
  assert.equal(capitalColorPatch({ ...product, ...patch }), null);
});

test('stored colour names are CAPITALS with Standard kept as the no-colour marker', () => {
  assert.equal(colorName('  navy   blue '), 'NAVY BLUE');
  assert.equal(colorName('default'), 'Standard');
  assert.equal(colorName('STANDARD'), 'Standard');
});
