import { startBackupWorker } from './backup.js';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { config, root } from './config.js';
import { createApp } from './app.js';
import { firebase } from './firebase.js';
import { deliverInvoice, whatsappReady } from './whatsapp.js';
import { customerMessagesReady, processCustomerMessages } from './customerMessages.js';

const app = createApp();
const server = createServer(app);
if (config.production) {
  // Hashed build files never change, so browsers may keep them for a year.
  app.use('/assets', express.static(path.join(root, 'dist/assets'), { index: false, fallthrough: false,
    setHeaders: res => res.set('Cache-Control', 'public, max-age=31536000, immutable') }));
  const publicFile = (name: string, cache = 'public, max-age=3600') => app.get(`/${name}`, (_req, res) =>
    res.set('Cache-Control', cache).sendFile(path.join(root, 'dist', name)));
  publicFile('favicon.svg');
  publicFile('purchase-template.csv');
  publicFile('manifest.webmanifest');
  // The service worker must always be revalidated so new deployments reach every device.
  publicFile('sw.js', 'no-cache');
  app.use((_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, ws: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await readFile(path.join(root, 'index.html'), 'utf8'))); }
    catch (error) { next(error); }
  });
}
server.listen(config.port, config.host, () => console.log(`Brothers Outfit Admin · ${config.origin} · store operations enabled`));

let deliveryWorkerBusy = false;
const deliveryWorker = setInterval(async () => {
  if (deliveryWorkerBusy || (!whatsappReady() && !customerMessagesReady())) return;
  deliveryWorkerBusy = true;
  try {
    const db = firebase().db;
    const pending = await db.collection('erp_syncLog').where('status', '==', 'awaiting_provider').limit(20).get();
    for (const event of pending.docs) await deliverInvoice(db, event.id);
    await processCustomerMessages(db);
  } catch { /* A pending outbox record remains for the next attempt. */ }
  finally { deliveryWorkerBusy = false; }
}, 45_000);
deliveryWorker.unref();

startBackupWorker();

process.on('unhandledRejection', reason => console.error('Unhandled rejection:', reason instanceof Error ? reason.message : reason));
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received · finishing open requests`);
  clearInterval(deliveryWorker);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
});
