import { createHash } from 'node:crypto';

export function customerKey(phone: unknown, email: unknown) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.length >= 10 ? digits.slice(-10) : '';
  if (/^[6-9]\d{9}$/.test(local)) return `phone_${createHash('sha256').update(local).digest('hex')}`;
  const canonicalEmail = String(email || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonicalEmail))
    return `email_${createHash('sha256').update(canonicalEmail).digest('hex')}`;
  return '';
}
