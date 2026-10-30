import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Resolve the project root in both source and compiled distributions.
const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, here.includes(`${path.sep}dist-server${path.sep}`) ? '../..' : '..');
const localPath = path.join(root, '.env');
const local = existsSync(localPath) ? parseEnv(readFileSync(localPath, 'utf8')) : {};
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const inheritedPath = path.resolve(root, process.env.EXISTING_WEBSITE_ENV || local.EXISTING_WEBSITE_ENV || '../Brothers_Outfit/brothers/.env');
// Production must be configured explicitly; it never reads a sibling checkout by default.
const useInherited = !production || Boolean(process.env.EXISTING_WEBSITE_ENV || local.EXISTING_WEBSITE_ENV);
const inherited = useInherited && existsSync(inheritedPath) ? parseEnv(readFileSync(inheritedPath, 'utf8')) : {};
const env = { ...inherited, ...local, ...process.env };
const port = z.coerce.number().int().min(1024).max(65535).parse(env.ADMIN_PORT || 4310);
const vercelHost = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
// The production alias is known for this dedicated POS project. Vercel's
// system URL variables may be disabled, so an unset ADMIN_ORIGIN must not
// crash even the unauthenticated health endpoint during function startup.
const defaultOrigin = production ? 'https://brothers-outfit-gallery-pos.vercel.app' : `http://localhost:${port}`;
const origin = z.url().parse(env.ADMIN_ORIGIN || (vercelHost ? `https://${vercelHost}` : defaultOrigin));
if (new URL(origin).origin !== origin) throw new Error('ADMIN_ORIGIN must be an origin without a path or trailing slash.');
if (production && !origin.startsWith('https://')) throw new Error('Production ADMIN_ORIGIN must use HTTPS.');
const pairingOrigin = z.url().parse(env.ADMIN_PAIRING_ORIGIN || 'https://brothers-outfit-gallery-pos.vercel.app');
if (!pairingOrigin.startsWith('https://') || new URL(pairingOrigin).origin !== pairingOrigin)
  throw new Error('ADMIN_PAIRING_ORIGIN must be an HTTPS origin.');

export const config = {
  production, port, origin, pairingOrigin, host: env.ADMIN_HOST || '127.0.0.1',
  projectId: env.FIREBASE_ADMIN_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID,
  serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  adminPin: env.ADMIN_PIN,
  sessionSecret: env.ADMIN_SESSION_SECRET || '',
  deviceAccessEnabled: env.ADMIN_DEVICE_ACCESS !== 'disabled',
  businessWritesEnabled: env.ADMIN_BUSINESS_WRITES === 'enabled',
  erpSyncSecret: env.ERP_SYNC_SECRET || '',
  imagekitPrivateKey: env.IMAGEKIT_PRIVATE_KEY || '',
  whatsapp: {
    graphVersion: env.WA_GRAPH_VERSION || '', phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
    accessToken: env.WA_ACCESS_TOKEN || '', templateName: env.WA_TEMPLATE_NAME || '',
    templateLanguage: env.WA_TEMPLATE_LANGUAGE || 'en_US'
  },
  sessionMs: z.coerce.number().int().min(1).max(24).parse(env.SESSION_HOURS || 8) * 3600_000,
  trustProxyHops: z.coerce.number().int().min(0).max(3).parse(env.TRUST_PROXY_HOPS || 0)
};
