import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel invokes this as a function. The static Vite build is served by its CDN.
// Do not import server/index.ts here: it binds a port and starts a worker.
let appPromise: Promise<ReturnType<(typeof import('../server/app.js'))['createApp']>> | undefined;
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ||= import('../server/app.js').then(({ createApp }) => createApp());
    const app = await appPromise;
    const url = new URL(req.url || '/', 'http://vercel.internal');
    const route = url.searchParams.get('route');
    if (route) {
      url.searchParams.delete('route');
      req.url = `/api/${route.replace(/^\/+/, '')}${url.search}`;
    }
    return app(req, res);
  } catch (error) {
    // Configuration errors are safe to show. Never return credential values.
    const message = error instanceof Error ? error.message : '';
    const known = /^(Production ADMIN_ORIGIN must use HTTPS\.|ADMIN_ORIGIN must be an origin|Invalid url|Session secret is missing\.)/.test(message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Admin API could not start.', reason: known || (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUIRE_ESM') ? message.slice(0, 350) : 'Module or runtime error',
      code: error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined }));
  }
}
