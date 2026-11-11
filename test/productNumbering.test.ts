import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBarcode, parseBarcode, formatProductNumber, getNextProductNumber } from '../server/productNumbering.js';
import { memoryFirestore } from './memoryFirestore.js';

test('formatBarcode formats standard BOG-XXXXXX-YYY barcodes correctly', () => {
  assert.equal(formatBarcode(1, 1), 'BOG-000001-001');
  assert.equal(formatBarcode(12, 1), 'BOG-000012-001');
  assert.equal(formatBarcode(12, 3), 'BOG-000012-003');
  assert.equal(formatBarcode(99999, 45), 'BOG-099999-045');
});

test('parseBarcode extracts productNumber and variantSequence from standard barcode', () => {
  const parsed1 = parseBarcode('BOG-000001-001');
  assert.deepEqual(parsed1, { productNumber: 1, variantSequence: 1 });

  const parsed2 = parseBarcode('bog-000012-005');
  assert.deepEqual(parsed2, { productNumber: 12, variantSequence: 5 });

  assert.equal(parseBarcode('INVALID-123'), null);
  assert.equal(parseBarcode(''), null);
});

test('formatProductNumber formats display string', () => {
  assert.equal(formatProductNumber(1), '#1');
  assert.equal(formatProductNumber(142), '#142');
});

test('getNextProductNumber increments counter transactionally', async () => {
  const fakeDb: any = {
    collection: () => {},
    runTransaction: () => {}
  };
  memoryFirestore(fakeDb);

  await fakeDb.runTransaction(async (tx: any) => {
    const num1 = await getNextProductNumber(fakeDb, tx);
    assert.equal(num1, 1);
  });

  await fakeDb.runTransaction(async (tx: any) => {
    const num2 = await getNextProductNumber(fakeDb, tx);
    assert.equal(num2, 2);
  });

  await fakeDb.runTransaction(async (tx: any) => {
    const num3 = await getNextProductNumber(fakeDb, tx);
    assert.equal(num3, 3);
  });
});
