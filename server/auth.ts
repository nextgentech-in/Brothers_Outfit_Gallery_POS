import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Owner } from '../shared/contracts.js';
import { config } from './config.js';

export interface AuthService {
  login(pin: string): Promise<string>;
  verify(cookie: string): Promise<Owner>;
  logout(cookie: string): Promise<void>;
}

// Phase 1 has no business-write routes. Sessions are opaque and kept on this
// server only; a restart signs everyone out.
const sessions = new Map<string, number>();
const owner: Owner = { uid: 'pin-owner', email: null, role: 'owner' };

export const authService: AuthService = {
  async login(pin) {
    const expected = config.adminPin;
    if (!expected || !/^\d{4}$/.test(pin) || !/^\d{4}$/.test(expected) ||
        !timingSafeEqual(Buffer.from(pin), Buffer.from(expected))) throw new Error('Invalid PIN');
    const session = randomBytes(32).toString('hex');
    sessions.set(session, Date.now() + config.sessionMs);
    return session;
  },
  async verify(cookie) {
    const expiresAt = /^[a-f0-9]{64}$/.test(cookie) ? sessions.get(cookie) : undefined;
    if (!expiresAt || expiresAt <= Date.now()) {
      sessions.delete(cookie);
      throw new Error('Invalid or expired session');
    }
    return owner;
  },
  async logout(cookie) { sessions.delete(cookie); }
};
