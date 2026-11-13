import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { firebase } from '../server/firebase.js';
import { root } from '../server/config.js';

const businessCollections = [
  'orders', 'stockMovements', 'erp_auditLog', 'erp_commands', 'erp_creditAccounts',
  'erp_customerLedger', 'erp_customerMessages', 'erp_customerProfiles', 'erp_invoices',
  'erp_invoiceSequences', 'erp_orderMeta', 'erp_productCosts', 'erp_purchases',
  'erp_purchaseOrders', 'erp_purchaseOrderKeys', 'erp_supplierAccounts',
  'erp_supplierInvoiceKeys', 'erp_supplierPayments', 'erp_suppliers', 'erp_syncLog',
  'erp_returns', 'erp_creditNotes', 'erp_creditNoteSequences', 'erp_expenses',
  'erp_dayClosings', 'erp_refunds', 'erp_supplierReturns', 'erp_supplierRefunds',
  'erp_supplierCreditUsage', 'posProductMappings', 'posStockEvents',
  'posReconciliationDiscrepancies', 'posTaxonomy'
] as const;

type BackupRow = { id: string; data: Record<string, unknown> };
const args = process.argv.slice(2);
const backupArg = args.find(arg => arg.startsWith('--backup='))?.slice(9);
const selectedProject = args.find(arg => arg.startsWith('--project='))?.slice(10);
const expectedSha = args.find(arg => arg.startsWith('--sha='))?.slice(6);
const apply = args.includes('--apply');
if (!backupArg || !selectedProject || args.some(arg => !arg.startsWith('--backup=') && !arg.startsWith('--project=') && !arg.startsWith('--sha=') && arg !== '--apply'))
  throw new Error('Use --backup=<private snapshot> --project=<exact project ID> [--apply --sha=<snapshot SHA-256>].');
const file = path.resolve(backupArg);
const privateDir = path.resolve(root, 'artifacts', 'private-backups') + path.sep;
if (!file.startsWith(privateDir)) throw new Error('Backup must be inside artifacts/private-backups.');
const content = await readFile(file, 'utf8');
const sha = createHash('sha256').update(content).digest('hex');
const snapshot = JSON.parse(content) as { format: string; projectId: string; collections: Record<string, BackupRow[]> };
if (snapshot.format !== 'brothers-reset-snapshot-v1' || snapshot.projectId !== selectedProject)
  throw new Error('Snapshot format or project mismatch.');
const { db, projectId } = firebase();
if (projectId !== selectedProject) throw new Error('Effective Firebase project mismatch.');

const oldProducts = (snapshot.collections.products || []).filter(row =>
  (row.data.integrationOrigin === 'pos' || row.data.integrationOrigin === 'admin-pos') && row.data.isDeleted === true);
const otherProducts = (snapshot.collections.products || []).filter(row =>
  row.data.integrationOrigin !== 'website' && !oldProducts.some(old => old.id === row.id));
if (otherProducts.length) throw new Error('Unknown non-website products require review.');
const oldProductIds = new Set(oldProducts.map(row => row.id));
const mappings = ['productSkuMappings', 'productSlugMappings'].flatMap(name =>
  (snapshot.collections[name] || []).filter(row => oldProductIds.has(String(row.data.productId || row.data.webProductId || '')))
    .map(row => ({ collection: name, row })));
const targets = [
  ...businessCollections.flatMap(name => (snapshot.collections[name] || []).map(row => ({ collection: name, row }))),
  ...oldProducts.map(row => ({ collection: 'products', row })),
  ...mappings
];
const counts = Object.fromEntries([...new Set(targets.map(item => item.collection))].sort().map(name =>
  [name, targets.filter(item => item.collection === name).length]));
console.log(JSON.stringify({ projectId, snapshotSha256: sha, deleteCounts: counts,
  retain: ['website-origin products', 'website customer accounts', 'website settings and admins',
    'new POS staff and device access', 'product number counter', 'website coupons', 'offline Mr. Munim installation'] }, null, 2));
if (!apply) process.exit(0);
if (expectedSha !== sha) throw new Error('Apply requires the exact snapshot SHA-256 from the dry run.');
const legacyResponse = await fetch('https://www.brothersoutfitgallery.com/api/pos/products-sync', { signal: AbortSignal.timeout(15_000) });
if (legacyResponse.status !== 410) throw new Error('Legacy POS endpoint is not confirmed disconnected; reset aborted.');
for (let index = 0; index < targets.length; index += 25) {
  await Promise.all(targets.slice(index, index + 25).map(async item => {
    const ref = db.collection(item.collection).doc(item.row.id);
    const live = await ref.get();
    if (!live.exists) return;
    if (item.collection === 'products' && (live.data()?.integrationOrigin !== item.row.data.integrationOrigin || live.data()?.isDeleted !== true))
      throw new Error('A product changed since backup; reset aborted.');
    if (item.collection === 'products' && (await ref.listCollections()).length)
      throw new Error('A product has subcollections; reset aborted.');
  }));
}
for (let index = 0; index < targets.length; index += 400) {
  const batch = db.batch();
  for (const { collection, row } of targets.slice(index, index + 400)) batch.delete(db.collection(collection).doc(row.id));
  await batch.commit();
}
console.log(JSON.stringify({ projectId, deleted: targets.length, legacyEndpointStatus: legacyResponse.status }));
