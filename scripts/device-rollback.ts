import { config } from '../server/config.js';
import { firebase } from '../server/firebase.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const project = args.find(value => value.startsWith('--project='))?.slice('--project='.length);
if (args.some(value => value !== '--apply' && !value.startsWith('--project='))) throw new Error('Unknown rollback argument.');
if (!project) {
  if (apply) throw new Error('Pass --project=<exact-project-id> before applying.');
  console.log(JSON.stringify({ dryRun: true, collections: ['erp_authState'],
    deletePrefixes: ['device_invite_', 'device_grant_'], deleteSessionsWithDeviceGrantId: true,
    untouched: ['products', 'orders', 'users', 'stockMovements', 'erp_invoices', 'erp_syncLog'],
    usage: 'npm run device:rollback -- --project=<exact-project-id> [--apply]' }, null, 2));
  process.exit(0);
}
if (project !== config.projectId) throw new Error('Exact configured Firebase project ID is required.');
const { db, projectId } = firebase();
if (projectId !== project) throw new Error('Effective Firebase credentials point to another project.');
const collection = db.collection('erp_authState');
const selectors = [
  { name: 'invitations', field: '__name__', prefix: 'device_invite_' },
  { name: 'grants', field: '__name__', prefix: 'device_grant_' },
  { name: 'pairedSessions', field: 'deviceGrantId', prefix: 'device_grant_' }
] as const;
const counts: Record<string, number> = {};
for (const selector of selectors) {
  let count = 0;
  while (true) {
    const docs = await collection.orderBy(selector.field).startAt(selector.prefix)
      .endAt(`${selector.prefix}\uf8ff`).limit(300).get();
    if (docs.empty) break;
    count += docs.size;
    if (!apply) break;
    const batch = db.batch();
    docs.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  counts[selector.name] = count;
}
console.log(JSON.stringify({ dryRun: !apply, projectId, counts,
  note: apply ? 'Paired-device auth records revoked. Remove the device cookie from clients on their next response.'
    : 'Counts show at most 300 records per category; rerun with --apply only after disabling hosted sign-in.' }, null, 2));
