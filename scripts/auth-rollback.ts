import { config } from '../server/config.js';
import { firebase } from '../server/firebase.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const project = args.find(value => value.startsWith('--project='))?.slice('--project='.length);
if (!apply) {
  console.log('Auth rollback preview: first remove ADMIN_PROTECTED_DEPLOYMENT from the host, then run with --apply --project=<exact-project-id> to revoke all POS sessions and clear its login counters. No product, order or stock data is touched.');
  process.exit(0);
}
if (!project || project !== config.projectId) throw new Error('Exact configured Firebase project ID is required.');
const { db, projectId } = firebase();
if (projectId !== project) throw new Error('Effective Firebase credentials point to another project.');
let removed = 0;
while (true) {
  const docs = await db.collection('erp_authState').limit(300).get();
  if (docs.empty) break;
  const batch = db.batch();
  docs.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  removed += docs.size;
}
console.log(`Revoked ${removed} POS auth documents in ${project}.`);
