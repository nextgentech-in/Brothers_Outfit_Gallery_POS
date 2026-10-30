import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../server/config.js';
import { firebase } from '../server/firebase.js';

const args = process.argv.slice(2);
const selectedProject = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
const direction = args.includes('--enable') ? 'enable' : args.includes('--disable') ? 'disable' : null;
if (args.some(arg => !['--apply', '--enable', '--disable'].includes(arg) && !arg.startsWith('--project=')) ||
    (args.includes('--enable') && args.includes('--disable'))) throw new Error('Invalid rollout arguments.');

if (!args.includes('--apply')) {
  console.log(JSON.stringify({ dryRun: true, direction: direction || 'none',
    target: 'erp_settings/commerce', existingWebsiteCollectionsChanged: [],
    enable: 'Creates or updates only the commerce rollout flag. The server also requires ADMIN_BUSINESS_WRITES=enabled.',
    disable: 'Sets enabled=false. Orders, invoices, movements and other financial history are retained.',
    usage: 'npm run commerce:rollout -- --enable|--disable --apply --project=<exact Firebase project ID>' }, null, 2));
} else {
  if (!direction || !selectedProject || selectedProject !== config.projectId) {
    throw new Error('Select --enable or --disable and an exact --project matching FIREBASE_ADMIN_PROJECT_ID.');
  }
  const { db, projectId } = firebase();
  if (projectId !== selectedProject) throw new Error('Effective Firebase project mismatch.');
  const ref = db.collection('erp_settings').doc('commerce');
  const result = await db.runTransaction(async tx => {
    const prior = await tx.get(ref);
    if (prior.exists && prior.data()?.schemaVersion !== 1) throw new Error('Unknown commerce settings; manual review required.');
    if (direction === 'enable' && !prior.exists) {
      tx.create(ref, { schemaVersion: 1, enabled: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    } else if (prior.exists) {
      tx.update(ref, { enabled: direction === 'enable', updatedAt: FieldValue.serverTimestamp() });
    }
    return prior.exists ? (direction === 'enable' ? 'enabled' : 'disabled_without_deleting_history')
      : direction === 'enable' ? 'created_and_enabled' : 'already_disabled';
  });
  console.log(JSON.stringify({ projectId, result }));
}
