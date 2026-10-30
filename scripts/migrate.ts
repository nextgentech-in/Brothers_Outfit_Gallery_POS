import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../server/config.js';
import { firebase } from '../server/firebase.js';
import { fingerprint, initialSettings, isUntouchedFoundation, migrationId } from './migration-definition.js';

const args = process.argv.slice(2);
const allowed = new Set(['--apply', '--rollback']);
if (args.some(arg => !allowed.has(arg) && !arg.startsWith('--project='))) throw new Error('Unknown migration argument.');
const apply = args.includes('--apply');
const rollback = args.includes('--rollback');
const selectedProject = args.find(arg => arg.startsWith('--project='))?.slice('--project='.length);
if (!apply) {
  console.log(JSON.stringify({ dryRun: true, direction: rollback ? 'rollback' : 'up', migrationId,
    changes: rollback ? ['Mark only erp_migrations/0001_foundation rolled_back; retain disabled foundation settings. Refuse if settings changed.'] : [
      { createOnly: 'erp_settings/system', fields: initialSettings },
      { createOnly: `erp_migrations/${migrationId}`, fields: ['status', 'fingerprint', 'appliedAt', 'rolledBackAt'] }
    ], existingWebsiteCollectionsChanged: [], note: 'No database access. Apply requires --apply and --project=<exact Firebase project ID>.' }, null, 2));
} else {
  if (!selectedProject || selectedProject !== config.projectId) throw new Error('An exact --project matching FIREBASE_ADMIN_PROJECT_ID is required.');
  const timeout = setTimeout(() => { console.error('Migration timed out. Check the migration record before retrying.'); process.exit(1); }, 30_000);
  try {
    const { db, projectId } = firebase();
    // Check the effective service account project too; JSON credentials can differ from env.
    if (projectId !== selectedProject) throw new Error('Project mismatch');
    const result = await db.runTransaction(async tx => {
      const markerRef = db.collection('erp_migrations').doc(migrationId);
      const settingsRef = db.collection('erp_settings').doc('system');
      const [marker, settings] = await tx.getAll(markerRef, settingsRef);
      if (marker.exists && marker.data()?.fingerprint !== fingerprint) throw new Error('Migration fingerprint mismatch');
      if (settings.exists && !isUntouchedFoundation(settings.data())) throw new Error('Settings changed; manual review required');
      if (rollback) {
        if (!marker.exists) return 'not_applied';
        if (!settings.exists) throw new Error('Settings missing; manual review required');
        if (marker.data()?.status === 'rolled_back') return 'already_rolled_back';
        tx.update(markerRef, { status: 'rolled_back', rolledBackAt: FieldValue.serverTimestamp() });
        return 'rolled_back_without_deleting_data';
      }
      if (marker.exists && marker.data()?.status === 'applied') {
        if (!settings.exists) throw new Error('Settings missing; manual review required');
        return 'already_applied';
      }
      if (!marker.exists && settings.exists) throw new Error('Pre-existing settings are not owned by this migration');
      if (!settings.exists) tx.create(settingsRef, initialSettings);
      const data = { status: 'applied', fingerprint, appliedAt: FieldValue.serverTimestamp(), rolledBackAt: null };
      if (marker.exists) tx.update(markerRef, data); else tx.create(markerRef, data);
      return 'applied';
    });
    console.log(JSON.stringify({ migrationId, result }));
  } catch { console.error('Migration refused or unavailable. Inspect project, migration marker, and unchanged foundation settings before retrying. No destructive rollback is attempted.'); process.exitCode = 1; }
  finally { clearTimeout(timeout); }
}
