import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { authService, type AuthService } from './auth.js';
import { config } from './config.js';
import { firebase } from './firebase.js';
import { cookieValue, csrfGuard, csrfToken, loginLimiter } from './security.js';
import { mapping, phases, type Overview, type DashboardSummary } from '../shared/contracts.js';
import { commerceRouter } from './commerce.js';
import { deliverInvoice } from './whatsapp.js';

export type AppOptions = { auth?: AuthService; overview?: () => Promise<Overview> };
export function createApp(options: AppOptions = {}) {
  const app = express();
  const auth = options.auth || authService;
  const sessionName = config.production ? '__Host-bo_session' : 'bo_session';
  const csrfName = config.production ? '__Host-bo_csrf' : 'bo_csrf';
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict' as const, path: '/' };
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet({ contentSecurityPolicy: config.production ? { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
  }} : false, strictTransportSecurity: config.production ? { maxAge: 31536000 } : false }));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.post('/api/internal/receipt', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
    express.raw({ type: 'application/json', limit: '4kb' }), async (req, res) => {
    if (!config.businessWritesEnabled || !config.erpSyncSecret) { res.status(423).json({ error: 'Receipt delivery is disabled.' }); return; }
    const signature = req.get('x-erp-signature') || '';
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const expected = createHmac('sha256', config.erpSyncSecret).update(raw).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(401).json({ error: 'Invalid signature.' }); return;
    }
    let input: unknown;
    try { input = JSON.parse(raw.toString('utf8')); } catch { res.status(400).json({ error: 'Invalid event.' }); return; }
    const parsed = z.object({ orderId: z.string().min(1).max(128), invoiceId: z.string().min(1).max(128),
      eventId: z.string().regex(/^invoice_[a-f0-9]{64}$/) }).strict().safeParse(input);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid event.' }); return; }
    try {
      const db = firebase().db;
      const [rollout, event, invoice] = await db.getAll(db.collection('erp_settings').doc('commerce'),
        db.collection('erp_syncLog').doc(parsed.data.eventId), db.collection('erp_invoices').doc(parsed.data.invoiceId));
      if (rollout.data()?.enabled !== true) { res.status(423).json({ error: 'Receipt delivery is disabled.' }); return; }
      if (event.data()?.invoiceId !== parsed.data.invoiceId || invoice.data()?.orderId !== parsed.data.orderId) {
        res.status(409).json({ error: 'Event identity mismatch.' }); return;
      }
      res.json(await deliverInvoice(db, parsed.data.eventId));
    } catch { res.status(503).json({ error: 'Receipt delivery unavailable.' }); }
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', phase: 'review-preview' }));
  app.get('/api/auth/csrf', (_req, res) => {
    const token = csrfToken();
    res.cookie(csrfName, token, { ...cookieOptions, maxAge: config.sessionMs }).json({ token });
  });
  const csrf = csrfGuard(config.origin, csrfName);
  app.post('/api/auth/login', loginLimiter(), csrf, async (req, res) => {
    if (config.production && !config.protectedDeployment) {
      res.status(503).json({ error: 'Enable deployment protection before using PIN sign-in online.' }); return;
    }
    const input = z.object({ pin: z.string().regex(/^\d{4}$/) }).strict().safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Enter a 4-digit PIN.' }); return; }
    try {
      const cookie = await auth.login(input.data.pin, req.ip);
      res.cookie(sessionName, cookie, { ...cookieOptions, maxAge: config.sessionMs }).json({ success: true });
    } catch (error) {
      // Do not log the submitted PIN or reveal the configured PIN.
      const message = (error as Error).message;
      const rejected = message === 'Invalid PIN' || message === 'Too many sign-in attempts.';
      res.status(!config.production || rejected ? 401 : 503)
        .json({ error: !config.production || rejected ? 'Incorrect PIN or sign-in temporarily limited.' : 'Admin sign-in is not configured on this host.' });
    }
  });
  const authenticate: RequestHandler = async (req, res, next) => {
    const cookie = cookieValue(req, sessionName);
    if (cookie) {
      try { res.locals.owner = await auth.verify(cookie); next(); return; } catch { /* Fail closed. */ }
    }
    if (req.path.startsWith('/api/')) res.status(401).json({ error: 'Sign in to continue.' });
    else res.redirect(303, '/login');
  };
  app.use('/api', async (req, res, next) => {
    // Mounted paths omit /api; preserve API failure semantics without sending HTML redirects.
    const cookie = cookieValue(req, sessionName);
    if (!cookie) { res.status(401).json({ error: 'Sign in to continue.' }); return; }
    auth.verify(cookie).then(owner => { res.locals.owner = owner; next(); }).catch(() => res.status(401).json({ error: 'Sign in to continue.' }));
  });
  app.get('/api/auth/me', (_req, res) => res.json(res.locals.owner));
  app.post('/api/auth/logout', csrf, async (req, res) => {
    try {
      await auth.logout(cookieValue(req, sessionName));
      res.clearCookie(sessionName, cookieOptions).clearCookie(csrfName, cookieOptions).json({ success: true });
    } catch { res.status(503).json({ error: 'Sign-out could not be completed. Please retry.' }); }
  });
  app.get('/api/foundation', (_req, res) => res.json({ mapping, phases, businessWritesEnabled: config.businessWritesEnabled }));
  app.get('/api/overview', async (_req, res) => {
    try {
      const overview = options.overview ? await options.overview() : await readOverview();
      res.json(overview);
    } catch { res.status(503).json({ error: 'Database summary is unavailable. No data was changed.' }); }
  });
  app.get('/api/dashboard', async (_req, res) => {
    try { res.json(await readDashboard()); }
    catch { res.status(503).json({ error: 'Dashboard data is unavailable. Check the server connection to the shared database.' }); }
  });
  app.use('/api', (req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : csrf(req, res, next));
  app.use('/api', async (req, res, next) => {
    const writes = new Set(['/products/create', '/products/patch', '/products/images/upload', '/inventory/adjust', '/pos/sale', '/orders/status',
      '/orders/invoice', '/orders/return', '/suppliers/create', '/purchases/receive', '/sync/retry']);
    if (req.method !== 'POST' || !writes.has(req.path)) { next(); return; }
    if (!config.businessWritesEnabled) { res.status(423).json({ error: 'Live business writes are locked pending schema and stock-cutover review.' }); return; }
    try {
      const rollout = await firebase().db.collection('erp_settings').doc('commerce').get();
      if (rollout.data()?.enabled === true) next();
      else res.status(423).json({ error: 'Commerce rollout is disabled in the shared database.' });
    } catch { res.status(503).json({ error: 'Commerce rollout status is unavailable.' }); }
  });
  app.use('/api', commerceRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Operation not found.' }));
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => res.status(400).json({ error: 'The request could not be processed.' });
  app.use(errors);
  // Public login and compiled assets contain no business records or credentials.
  app.use((req, res, next) => {
    const publicPath = req.path === '/login' || req.path === '/favicon.svg' || req.path === '/manifest.webmanifest' || req.path.startsWith('/assets/');
    const devAsset = !config.production && /^\/(?:@vite\/|@react-refresh|src\/|shared\/|node_modules\/(?:\.vite\/|vite\/dist\/client\/))/.test(req.path);
    if (publicPath || devAsset) next(); else authenticate(req, res, next);
  });
  return app;
}
async function readOverview(): Promise<Overview> {
  const db = firebase().db;
  const counts = await Promise.all(['products', 'orders', 'users', 'stockMovements'].map(name => db.collection(name).count().get()));
  return { products: counts[0].data().count, orders: counts[1].data().count, customers: counts[2].data().count,
    movements: counts[3].data().count, checkedAt: new Date().toISOString(), businessWritesEnabled: config.businessWritesEnabled };
}
async function readDashboard(): Promise<DashboardSummary> {
  type OrderData = { id: string; status?: unknown; createdBy?: unknown; totalAmount?: unknown; total?: unknown;
    customerName?: unknown; shippingAddress?: { fullName?: unknown }; createdAt?: { toDate?: () => Date } };
  const db = firebase().db;
  const [productDocs, orderDocs, customers, orderCount, syncDocs] = await Promise.all([
    db.collection('products').get(), db.collection('orders').orderBy('createdAt', 'desc').limit(200).get(),
    db.collection('users').count().get(), db.collection('orders').count().get(),
    db.collection('erp_syncLog').orderBy('createdAt', 'desc').limit(100).get()
  ]);
  const products = productDocs.docs.filter(doc => doc.data().isDeleted !== true);
  const stock = products.map(doc => {
    const data = doc.data();
    const variants = Array.isArray(data.variants) ? data.variants : [];
    const available = variants.length
      ? variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock ?? variant.quantity ?? 0) - Number(variant.reserved ?? 0)), 0)
      : Math.max(0, Number(data.stock ?? data.quantity ?? 0) - Number(data.reserved ?? 0));
    const retailValue = variants.length
      ? variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock ?? variant.quantity ?? 0) - Number(variant.reserved ?? 0)) * Number(variant.salePrice ?? variant.price ?? data.salePrice ?? data.price ?? 0), 0)
      : available * Number(data.salePrice ?? data.price ?? 0);
    return { id: doc.id, name: String(data.name || 'Unnamed product'), sku: String(data.sku || ''), available, retailValue, variants: variants.length };
  });
  const orders = orderDocs.docs.map(doc => ({ id: doc.id, ...doc.data() } as OrderData));
  const saleOrders = orders.filter(order => !['cancelled', 'returned'].includes(String(order.status || '').toLowerCase()));
  const amount = (order: OrderData) => Number(order.totalAmount ?? order.total ?? 0);
  const isPos = (order: OrderData) => order.createdBy === 'admin-pos';
  return {
    products: products.length, variants: stock.reduce((sum, product) => sum + (product.variants || 1), 0),
    customers: customers.data().count, orders: orderCount.data().count,
    availableUnits: stock.reduce((sum, product) => sum + product.available, 0),
    stockRetailValue: stock.reduce((sum, product) => sum + product.retailValue, 0),
    lowStock: stock.filter(product => product.available > 0 && product.available <= 5).length,
    outOfStock: stock.filter(product => product.available === 0).length,
    recentSales: saleOrders.reduce((sum, order) => sum + amount(order), 0),
    websiteSales: saleOrders.filter(order => !isPos(order)).reduce((sum, order) => sum + amount(order), 0),
    posSales: saleOrders.filter(isPos).reduce((sum, order) => sum + amount(order), 0),
    pendingOrders: orders.filter(order => ['processing', 'pending', 'confirmed', 'packed'].includes(String(order.status || '').toLowerCase())).length,
    syncFailures: syncDocs.docs.filter(doc => ['failed', 'awaiting_provider'].includes(String(doc.data().status || ''))).length,
    sampledOrders: orders.length, checkedAt: new Date().toISOString(), businessWritesEnabled: config.businessWritesEnabled,
    lowStockItems: stock.filter(product => product.available <= 5).sort((a, b) => a.available - b.available).slice(0, 8)
      .map(({ id, name, sku, available }) => ({ id, name, sku, available })),
    recentOrders: orders.slice(0, 6).map(order => ({ id: order.id, customer: String(order.customerName || order.shippingAddress?.fullName || 'Walk-in'),
      status: String(order.status || 'Processing'), channel: isPos(order) ? 'POS' as const : 'Website' as const, total: amount(order),
      createdAt: order.createdAt?.toDate?.()?.toISOString?.() || null }))
  };
}
