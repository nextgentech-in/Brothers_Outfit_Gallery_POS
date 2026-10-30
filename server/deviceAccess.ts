import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { firebase } from './firebase.js';

export type DeviceGrant = { id: string; label: string; createdAt: number; expiresAt: number; lastUsedAt: number | null };
export interface DeviceAccess {
  createInvite(): Promise<{ url: string; expiresAt: number }>;
  enroll(token: string, label: string): Promise<string>;
  verify(token: string, touch?: boolean): Promise<string | null>;
  isGrantActive(id: string): Promise<boolean>;
  list(): Promise<DeviceGrant[]>;
  revoke(id: string): Promise<void>;
}

const collection = () => firebase().db.collection('erp_authState');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenPattern = /^[a-f0-9]{64}$/;
const grantPattern = /^device_grant_[a-f0-9]{64}$/;
const inviteMinutes = 10;
const deviceDays = 90;

export const deviceAccess: DeviceAccess = {
  async createInvite() {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + inviteMinutes * 60_000;
    await collection().doc(`device_invite_${sha(token)}`).create({
      kind: 'device_invite', createdAt: now, expiresAt, consumedAt: null, createdBy: 'pin-owner'
    });
    const url = new URL('/enroll', config.pairingOrigin);
    url.hash = `token=${token}`;
    return { url: url.toString(), expiresAt };
  },
  async enroll(token, label) {
    if (!tokenPattern.test(token)) throw new Error('Invalid device invitation.');
    const name = label.trim().slice(0, 60) || 'My device';
    const inviteRef = collection().doc(`device_invite_${sha(token)}`);
    const deviceToken = randomBytes(32).toString('hex');
    const grantRef = collection().doc(`device_grant_${sha(deviceToken)}`);
    const now = Date.now();
    await firebase().db.runTransaction(async tx => {
      const invite = await tx.get(inviteRef);
      const data = invite.data();
      if (!invite.exists || data?.kind !== 'device_invite' || data.consumedAt != null ||
          Number(data.expiresAt || 0) <= now) throw new Error('This device invitation has expired or was already used.');
      tx.update(inviteRef, { consumedAt: now });
      tx.create(grantRef, { kind: 'device_grant', label: name, createdAt: now,
        expiresAt: now + deviceDays * 86_400_000, lastUsedAt: now, revokedAt: null });
    });
    return deviceToken;
  },
  async verify(token, touch = false) {
    if (!tokenPattern.test(token)) return null;
    const id = `device_grant_${sha(token)}`;
    const ref = collection().doc(id);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.kind !== 'device_grant' || data.revokedAt != null ||
        Number(data.expiresAt || 0) <= Date.now()) return null;
    if (touch && Date.now() - Number(data.lastUsedAt || 0) > 60 * 60_000)
      await ref.update({ lastUsedAt: Date.now() });
    return id;
  },
  async isGrantActive(id) {
    if (!grantPattern.test(id)) return false;
    const snapshot = await collection().doc(id).get();
    const data = snapshot.data();
    return Boolean(snapshot.exists && data?.kind === 'device_grant' && data.revokedAt == null &&
      Number(data.expiresAt || 0) > Date.now());
  },
  async list() {
    const snapshot = await collection().orderBy('__name__').startAt('device_grant_').endAt('device_grant_\uf8ff').limit(100).get();
    return snapshot.docs.filter(doc => doc.data().kind === 'device_grant' && doc.data().revokedAt == null &&
      Number(doc.data().expiresAt || 0) > Date.now()).map(doc => ({ id: doc.id,
      label: String(doc.data().label || 'My device'), createdAt: Number(doc.data().createdAt || 0),
      expiresAt: Number(doc.data().expiresAt || 0), lastUsedAt: Number(doc.data().lastUsedAt || 0) || null }));
  },
  async revoke(id) {
    if (!grantPattern.test(id)) throw new Error('Invalid device grant.');
    const ref = collection().doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.kind !== 'device_grant') throw new Error('Device grant not found.');
    await ref.update({ revokedAt: Date.now() });
  }
};
