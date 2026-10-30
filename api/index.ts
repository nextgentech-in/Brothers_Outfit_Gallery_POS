import { createApp } from '../server/app.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel invokes this as a function. The static Vite build is served by its CDN.
// Do not import server/index.ts here: it binds a port and starts a worker.
const app = createApp();
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://vercel.internal');
  const route = url.searchParams.get('route');
  if (route) {
    url.searchParams.delete('route');
    req.url = `/api/${route.replace(/^\/+/, '')}${url.search}`;
  }
  return app(req, res);
}
