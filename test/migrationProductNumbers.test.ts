import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planOrApplyMigration } from '../scripts/migrate-product-numbers.js';
import { memoryFirestore } from './memoryFirestore.js';

test('migration plans numbers in deterministic order and preserves existing numbers', async () => {
  const fakeDb: any = {
    collection: () => {},
    runTransaction: () => {},
    batch: () => {
      const ops: any[] = [];
      return {
        update: (ref: any, data: any) => ops.push({ ref, data }),
        commit: async () => {}
      };
    }
  };
  const { records } = memoryFirestore(fakeDb);

  // Setup products in fakeDb
  records.set('products/prod-c', {
    name: 'Cotton Shirt C',
    createdAt: new Date('2026-02-01T10:00:00Z'),
    variants: [{ sku: 'SHIRT-C-M', size: 'M', color: 'Blue' }]
  });
  records.set('products/prod-a', {
    name: 'Linen Kurta A',
    productNumber: 5,
    barcode: 'BOG-000005-001',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    variants: [{ sku: 'KURTA-A-L', size: 'L', color: 'White', variantSequence: 1, barcode: 'BOG-000005-001' }]
  });
  records.set('products/prod-b', {
    name: 'Denim Jeans B',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    variants: [
      { sku: 'JEANS-B-32', size: '32', color: 'Navy' },
      { sku: 'JEANS-B-34', size: '34', color: 'Navy' }
    ]
  });

  // Run dry run
  const dryReport = await planOrApplyMigration(fakeDb, false);
  assert.equal(dryReport.mode, 'DRY_RUN');
  assert.equal(dryReport.totalProducts, 3);
  assert.equal(dryReport.alreadyNumbered, 1);
  assert.equal(dryReport.newlyAssignedCount, 2);
  // Highest existing is 5, so newly assigned are 6 and 7
  assert.equal(dryReport.newlyAssignedRange, '6 to 7');
  assert.equal(dryReport.counterUpdatedTo, 7);

  // prod-b (created Jan 15) comes before prod-c (created Feb 01)
  const sampleB = dryReport.samples.find(s => s.id === 'prod-b');
  assert.ok(sampleB);
  assert.equal(sampleB?.productNumber, 6);
  assert.equal(sampleB?.barcode, 'BOG-000006-001');
  assert.equal(sampleB?.variants[0].barcode, 'BOG-000006-001');
  assert.equal(sampleB?.variants[1].barcode, 'BOG-000006-002');

  const sampleC = dryReport.samples.find(s => s.id === 'prod-c');
  assert.ok(sampleC);
  assert.equal(sampleC?.productNumber, 7);
  assert.equal(sampleC?.barcode, 'BOG-000007-001');
});
