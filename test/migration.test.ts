import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSettings, isUntouchedFoundation } from '../scripts/migration-definition.js';

test('rollback refuses settings that have advanced to live business use', () => {
  assert.equal(isUntouchedFoundation(initialSettings), true);
  assert.equal(isUntouchedFoundation({ ...initialSettings, businessWritesEnabled: true }), false);
  assert.equal(isUntouchedFoundation({ ...initialSettings, websiteSyncEnabled: true }), false);
  assert.equal(isUntouchedFoundation({ ...initialSettings, schemaVersion: 2 }), false);
  assert.equal(isUntouchedFoundation({ ...initialSettings, invoiceSequence: 42 }), false);
  assert.equal(isUntouchedFoundation(null), false);
});
