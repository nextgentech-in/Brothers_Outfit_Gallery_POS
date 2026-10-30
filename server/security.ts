import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Request } from 'express';
import { rateLimit } from 'express-rate-limit';

export const cookieValue = (req: Request, name: string) => {
  const entry = req.headers.cookie?.split(';').find(part => part.trim().startsWith(`${name}=`));
  return entry ? entry.trim().slice(name.length + 1) : '';
};
export const csrfToken = () => randomBytes(32).toString('hex');
export function csrfGuard(origin: string, csrfName: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get('x-csrf-token') || '';
    const cookie = cookieValue(req, csrfName);
    if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site' ||
      !/^[a-f0-9]{64}$/.test(header) || !/^[a-f0-9]{64}$/.test(cookie) ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) {
      res.status(403).json({ error: 'Refresh the page and try again.', code: 'csrf_rejected' }); return;
    }
    next();
  };
}
export const loginLimiter = () => rateLimit({ windowMs: 15 * 60_000, limit: 5,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
