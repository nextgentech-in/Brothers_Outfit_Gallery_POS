import { createHash } from 'node:crypto';
import { mobileNumber } from '../shared/customers.js';

export function customerKey(phone: unknown, email: unknown) {
  const digits = mobileNumber(String(phone || ''));
  // Preserve the existing Indian profile keys and keep other country codes distinct.
  const canonicalPhone = /^91[6-9]\d{9}$/.test(digits) ? digits.slice(2) : digits ? `+${digits}` : '';
  if (canonicalPhone) return `phone_${createHash('sha256').update(canonicalPhone).digest('hex')}`;
  const canonicalEmail = String(email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonicalEmail))
    return `email_${createHash('sha256').update(canonicalEmail).digest('hex')}`;
  return '';
}
