import express from 'express';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { config, root } from './config.js';
import { createApp } from './app.js';
import { firebase } from './firebase.js';
import { deliverInvoice, whatsappReady } from './whatsapp.js';

const app = createApp();
const server = createServer(app);
if (config.production) {
  app.use('/assets', express.static(path.join(root, 'dist/assets'), { index: false }));
  app.use((_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ root, server: { middlewareMode: true, ws: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try { res.type('html').send(await vite.transformIndexHtml(req.originalUrl, await readFile(path.join(root, 'index.html'), 'utf8'))); }
    catch (error) { next(error); }
  });
}
server.listen(config.port, config.host, () => console.log(`Brothers Outfit Admin · ${config.origin} · review preview · writes ${config.businessWritesEnabled ? 'environment-enabled' : 'locked'}`));

let deliveryWorkerBusy = false;
const deliveryWorker = setInterval(async () => {
  if (deliveryWorkerBusy || !config.businessWritesEnabled || !whatsappReady()) return;
  deliveryWorkerBusy = true;
  try {
    const db = firebase().db;
    const rollout = await db.collection('erp_settings').doc('commerce').get();
    if (rollout.data()?.enabled !== true) return;
    const pending = await db.collection('erp_syncLog').where('status', '==', 'awaiting_provider').limit(20).get();
    for (const event of pending.docs) await deliverInvoice(db, event.id);
  } catch { /* A pending outbox record remains for the next attempt. */ }
  finally { deliveryWorkerBusy = false; }
}, 45_000);
deliveryWorker.unref();
