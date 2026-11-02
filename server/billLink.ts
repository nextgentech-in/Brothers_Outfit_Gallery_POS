import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
const signature = (invoiceId: string, expires: string) => createHmac('sha256', config.sessionSecret)
  .update('customer-bill-pdf-v1:' + invoiceId + ':' + expires).digest('hex').slice(0, 32);

export function customerBillUrl(invoiceId: string, now = Date.now()) {
  if (!config.sessionSecret) throw new Error('Bill links are not configured.');
  const expires = String(Math.floor((now + lifetimeMs) / 1000));
  const base = config.production ? config.pairingOrigin : config.origin;
  return base + '/api/public/bills/' + encodeURIComponent(invoiceId) + '/pdf?expires=' + expires + '&sig=' + signature(invoiceId, expires);
}

export function validBillLink(invoiceId: string, expires: unknown, supplied: unknown, now = Date.now()) {
  if (!config.sessionSecret || !/^BOG-[\w.-]{1,80}$/.test(invoiceId) || typeof expires !== 'string' ||
      !/^\d{10}$/.test(expires) || Number(expires) * 1000 < now ||
      Number(expires) * 1000 > now + lifetimeMs + 60_000 ||
      typeof supplied !== 'string' || !/^[a-f0-9]{32}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(signature(invoiceId, expires), 'hex'), Buffer.from(supplied, 'hex'));
}
