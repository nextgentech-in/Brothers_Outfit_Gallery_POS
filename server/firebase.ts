import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from './config.js';

export function firebase() {
  let app = getApps().find(app => app.name === 'brothers-admin');
  if (!app) {
    const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
    if (emulator && (config.production || !config.projectId?.startsWith('demo-'))) throw new Error('Emulators require a demo- project in development.');
    if (emulator) app = initializeApp({ projectId: config.projectId }, 'brothers-admin');
    else {
      let serviceAccount;
      try {
        serviceAccount = config.serviceAccountJson ? JSON.parse(config.serviceAccountJson) : {
          projectId: config.projectId, clientEmail: config.clientEmail, privateKey: config.privateKey
        };
      } catch { throw new Error('Invalid service account configuration'); }
      const projectId = serviceAccount.projectId || serviceAccount.project_id;
      if (config.projectId && projectId !== config.projectId) throw new Error('Firebase project configuration mismatch');
      app = initializeApp({ projectId, credential: cert(serviceAccount) }, 'brothers-admin');
    }
  }
  return { auth: getAuth(app), db: getFirestore(app), projectId: app.options.projectId };
}
