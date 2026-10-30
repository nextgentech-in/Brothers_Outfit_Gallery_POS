import { createHash } from 'node:crypto';

export const migrationId = '0001_foundation';
export const initialSettings = {
  schemaVersion: 1,
  phase: 'foundation',
  businessWritesEnabled: false,
  websiteSyncEnabled: false,
  migrationId
} as const;
export const fingerprint = createHash('sha256').update(JSON.stringify(initialSettings)).digest('hex');
export function isUntouchedFoundation(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(initialSettings).length &&
    Object.entries(initialSettings).every(([key, item]) => record[key] === item);
}
