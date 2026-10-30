import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Owner } from '../shared/contracts.js';
import { config } from './config.js';
import { firebase } from './firebase.js';

export interface AuthService {
  login(pin: string, identity?: string): Promise<string>;
  verify(cookie: string): Promise<Owner>;
  logout(cookie: string): Promise<void>;
}

// Local preview sessions live in memory; hosted sessions use Firestore below.
const sessions = new Map<string, number>();
const owner: Owner = { uid: 'pin-owner', email: null, role: 'owner' };
const digest = (value: string) => createHmac('sha256', config.sessionSecret).update(value).digest('hex');
const authCollection = () => {
  if (config.sessionSecret.length < 32) throw new Error('Session secret is missing.');
  return firebase().db.collection('erp_authState');
};

export const authService: AuthService = {
  async login(pin, identity = 'local') {
    const expected = config.adminPin;
    if (!expected || !/^\d{4}$/.test(expected)) throw new Error('PIN is not configured.');
    const valid = /^\d{4}$/.test(pin) && timingSafeEqual(Buffer.from(pin), Buffer.from(expected));
    const session = randomBytes(32).toString('hex');
    if (config.production) {
      const collection = authCollection();
      const limitRef = collection.doc(`limit_${digest(identity)}`);
      const sessionRef = collection.doc(`session_${digest(session)}`);
      const now = Date.now();
      const result = await firebase().db.runTransaction(async tx => {
        const previous = await tx.get(limitRef);
        const startedAt = Number(previous.data()?.startedAt || 0);
        const withinWindow = now - startedAt < 15 * 60_000;
        const attempts = withinWindow ? Number(previous.data()?.attempts || 0) : 0;
        if (attempts >= 5) return 'limited';
        tx.set(limitRef, { startedAt: withinWindow ? startedAt : now, attempts: valid ? 0 : attempts + 1,
          expiresAt: now + 15 * 60_000 });
        if (valid) tx.create(sessionRef, { expiresAt: now + config.sessionMs, createdAt: now });
        return valid ? 'ok' : 'invalid';
      });
      if (result !== 'ok') throw new Error(result === 'limited' ? 'Too many sign-in attempts.' : 'Invalid PIN');
      return session;
    }
    if (!valid) throw new Error('Invalid PIN');
    sessions.set(session, Date.now() + config.sessionMs);
    return session;
  },
  async verify(cookie) {
    if (config.production) {
      if (!/^[a-f0-9]{64}$/.test(cookie)) throw new Error('Invalid session');
      const snapshot = await authCollection().doc(`session_${digest(cookie)}`).get();
      if (Number(snapshot.data()?.expiresAt || 0) <= Date.now()) throw new Error('Invalid or expired session');
      return owner;
    }
    const expiresAt = /^[a-f0-9]{64}$/.test(cookie) ? sessions.get(cookie) : undefined;
    if (!expiresAt || expiresAt <= Date.now()) {
      sessions.delete(cookie);
      throw new Error('Invalid or expired session');
    }
    return owner;
  },
  async logout(cookie) {
    if (config.production) {
      if (/^[a-f0-9]{64}$/.test(cookie)) await authCollection().doc(`session_${digest(cookie)}`).delete();
      return;
    }
    sessions.delete(cookie);
  }
};
