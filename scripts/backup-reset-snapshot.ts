import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { firebase } from '../server/firebase.js';
import { encodeBackup } from '../server/backup.js';
import { root } from '../server/config.js';

const { db, projectId } = firebase();
const collections = await db.listCollections();
const data: Record<string, { id: string; data: unknown }[]> = Object.fromEntries(await Promise.all(collections.map(async collection => {
  const docs = await collection.get();
  return [collection.id, docs.docs.map(doc => ({ id: doc.id, data: encodeBackup(doc.data()) }))];
})));
const snapshot = { format: 'brothers-reset-snapshot-v1', projectId, createdAt: new Date().toISOString(), collections: data };
const content = JSON.stringify(snapshot);
const directory = path.join(root, 'artifacts', 'private-backups');
await mkdir(directory, { recursive: true, mode: 0o700 });
const file = path.join(directory, `business-before-reset-${new Date().toISOString().replaceAll(':', '-')}.json`);
await writeFile(file, content, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ file, projectId, sha256: createHash('sha256').update(content).digest('hex'),
  counts: Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length])) }, null, 2));
