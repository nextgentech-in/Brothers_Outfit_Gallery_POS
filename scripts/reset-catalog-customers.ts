import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Timestamp, type CollectionReference } from 'firebase-admin/firestore';
import { firebase } from '../server/firebase.js';
import { encodeBackup } from '../server/backup.js';
import { root } from '../server/config.js';

// Linked sales records also contain customer details and stock references.
// Preserve staff/admin access, shop settings, suppliers, purchases and expenses.
const collections = [
  'products', 'productSkuMappings', 'productSlugMappings', 'stockMovements', 'users',
  'orders', 'reviews', 'exchangeRequests', 'customerNotifications',
  'erp_posPricing', 'erp_productCosts', 'erp_productCostPrices', 'erp_customerProfiles', 'erp_customerLedger',
  'erp_customerMessages', 'erp_creditAccounts', 'erp_loyaltyAccounts',
  'erp_invoices', 'erp_invoiceSequences', 'erp_orderMeta', 'erp_returns',
  'erp_creditNotes', 'erp_creditNoteSequences', 'erp_refunds',
  'erp_commands', 'erp_auditLog', 'erp_syncLog',
  'posProductMappings', 'posStockEvents', 'posReconciliationDiscrepancies'
] as const;
type Row = { path: string; data: unknown; seconds: number; nanoseconds: number };
type Snapshot = { format: string; projectId: string; createdAt: string; collections: readonly string[]; documents: Row[] };
const args = process.argv.slice(2);
const selectedProject = args.find(arg => arg.startsWith('--project='))?.slice(10);
const fileArg = args.find(arg => arg.startsWith('--backup='))?.slice(9);
const shaArg = args.find(arg => arg.startsWith('--sha='))?.slice(6);
const apply = args.includes('--apply');
if (!selectedProject || args.some(arg => !/^--(project|backup|sha)=/.test(arg) && arg !== '--apply'))
  throw new Error('Use --project=<exact project ID> to back up; --backup=<file> --sha=<hash> --apply to reset.');
const { db, projectId } = firebase();
if (projectId !== selectedProject) throw new Error('Firebase project mismatch.');
const directory = path.resolve(root, 'artifacts', 'private-backups');
async function collect(collection: CollectionReference): Promise<Row[]> {
  // listDocuments includes missing parents that have populated subcollections.
  const rows: Row[] = [];
  const refs = await collection.listDocuments();
  for (let index = 0; index < refs.length; index += 4) {
    const groups = await Promise.all(refs.slice(index, index + 4).map(async ref => {
      const doc = await ref.get();
      const nested: Row[] = doc.exists ? [{ path: ref.path, data: encodeBackup(doc.data()),
        seconds: doc.updateTime!.seconds, nanoseconds: doc.updateTime!.nanoseconds }] : [];
      for (const child of await ref.listCollections()) nested.push(...await collect(child));
      return nested;
    }));
    rows.push(...groups.flat());
  }
  return rows;
}
async function collectAll() {
  return (await Promise.all(collections.map(name => collect(db.collection(name))))).flat().sort((a, b) => a.path.localeCompare(b.path));
}
let file: string, content: string;
if (fileArg) {
  file = path.resolve(fileArg);
  if (!file.startsWith(directory + path.sep)) throw new Error('Use a snapshot inside artifacts/private-backups.');
  content = await readFile(file, 'utf8');
} else {
  if (apply) throw new Error('Apply requires an existing snapshot.');
  const snapshot: Snapshot = { format: 'brothers-catalog-customer-reset-v1', projectId: projectId!,
    createdAt: new Date().toISOString(), collections, documents: await collectAll() };
  content = JSON.stringify(snapshot);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  file = path.join(directory, `catalog-customers-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await writeFile(file, content, { mode: 0o600, flag: 'wx' });
}
const snapshot = JSON.parse(content) as Snapshot;
const sha256 = createHash('sha256').update(content).digest('hex');
if (snapshot.format !== 'brothers-catalog-customer-reset-v1' || snapshot.projectId !== projectId ||
    JSON.stringify(snapshot.collections) !== JSON.stringify(collections) || snapshot.documents.some(row => !collections.includes(row.path.split('/')[0] as typeof collections[number])))
  throw new Error('Invalid reset snapshot.');
const counts = Object.fromEntries(collections.map(name => [name, snapshot.documents.filter(row => row.path.split('/')[0] === name).length]));
console.log(JSON.stringify({ projectId, backup: file, sha256, deleteCounts: counts,
  retained: ['admin and staff access', 'Firebase sign-in accounts', 'settings', 'suppliers', 'purchases', 'expenses', 'product number counter'] }, null, 2));
if (!apply) process.exit(0);
if (shaArg !== sha256) throw new Error('Snapshot SHA-256 mismatch.');
const live = await collectAll();
if (live.length !== snapshot.documents.length || live.some((row, index) => {
  const saved = snapshot.documents[index];
  return row.path !== saved.path || row.seconds !== saved.seconds || row.nanoseconds !== saved.nanoseconds;
})) throw new Error('Data changed since backup. Create a fresh snapshot before resetting.');
for (let index = 0; index < live.length; index += 400) {
  const batch = db.batch();
  for (const row of live.slice(index, index + 400)) batch.delete(db.doc(row.path), { lastUpdateTime: new Timestamp(row.seconds, row.nanoseconds) });
  await batch.commit();
}
const remaining = await collectAll();
if (remaining.length) throw new Error('Records appeared during reset; review before continuing.');
console.log(JSON.stringify({ projectId, deletedDocuments: live.length, remainingDocuments: remaining.length, backup: file }));
