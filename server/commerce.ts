import { paymentBreakdown } from '../shared/payments.js';
import { createHash, randomBytes } from 'node:crypto';
import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { toSVG } from '@bwip-js/node';
import { firebase } from './firebase.js';
import { invoicePdf } from './invoicePdf.js';
import { deliverInvoice } from './whatsapp.js';
import { customerBillUrl } from './billLink.js';
import { customerKey } from './customerIdentity.js';
import { customerDirectory, customerProfileFields } from './customers.js';
import { customerDetailsError, mobileNumber } from '../shared/customers.js';
import { config } from './config.js';
import { idempotent } from './transactions.js';
import { appendCreditEntry, readCreditState } from './creditLedger.js';
import { deliverCustomerMessage, queueCustomerMessage } from './customerMessages.js';
import { validDueDate } from '../shared/credit.js';
import { shopDate } from '../shared/customers.js';

const id = z.string().trim().min(1).max(128).regex(/^[\w.:-]+$/);
const key = z.string().trim().min(12).max(128).regex(/^[\w.:-]+$/);
const positiveInt = z.number().int().min(1).max(10_000);
const money = z.number().finite().min(0).max(10_000_000).refine(n=>Math.abs(n*100-Math.round(n*100))<.00001,'Use at most two decimal places.');
const lineSchema = z.object({
  productId: id,
  sku: id,
  quantity: positiveInt,
  price: money.optional(),
  name: z.string().trim().max(200).optional(),
  discount: money.optional(),
  tax: money.optional(),
  taxPercent: z.number().min(0).max(100).optional()
}).strict();
const saleSchema = z.object({
  expectedTotal: money.optional(),
  requestId: key,
  lines: z.array(lineSchema).min(1).max(100),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  customerEmail: z.email().max(254).optional(),
  customerAddress: z.string().trim().max(500).optional(),
  invoiceNumber: z.number().int().optional(),
  invoiceDate: z.string().max(30).optional(),
  customerDateOfBirth: z.string().max(10).optional(),
  birthdayOffersOptIn: z.boolean().optional(),
  creditDueDate: z.string().max(10).optional(),
  creditWhatsAppOptIn: z.boolean().optional(),
  payments: z.array(z.object({ method: z.enum(['cash','upi','card','credit']), amount: money }).strict()).max(4).optional(),
  cashTendered: money.optional(),
  discount: money.default(0),
  tax: money.optional(),
  paymentMethod: z.enum(['cash', 'upi', 'card', 'credit', 'split']),
  whatsappOptIn: z.boolean().default(false)
}).strict().superRefine((input, ctx) => {
    const error = customerDetailsError(input.customerPhone || '', input.customerDateOfBirth || '');
    if (error) ctx.addIssue({ code: 'custom', path: ['customerDateOfBirth'], message: error });
    if (input.birthdayOffersOptIn && !input.customerPhone?.trim())
      ctx.addIssue({ code: 'custom', path: ['birthdayOffersOptIn'], message: 'A mobile number is required for birthday offers.' });
    if (input.paymentMethod === 'credit' || (input.paymentMethod === 'split' && input.payments?.some(p => p.method === 'credit' && p.amount > 0))) {
      if (!input.customerName?.trim() || !mobileNumber(input.customerPhone || ''))
        ctx.addIssue({ code: 'custom', message: 'Customer name and mobile number are required for udhar.' });
      if (!validDueDate(input.creditDueDate) || input.creditDueDate < shopDate())
        ctx.addIssue({ code: 'custom', message: 'Choose a credit repayment due date today or later.' });
    }
  });
const adjustmentSchema = z.object({ requestId: key, productId: id, sku: id, delta: z.number().int().min(-10_000).max(10_000).refine(x => x !== 0),
  reason: z.enum(['purchase', 'adjustment', 'damage', 'return']), note: z.string().trim().max(500).optional() }).strict();
const batchAdjustmentSchema = z.object({ requestId: key, productId: id,
  adjustments: z.array(z.object({ sku: id, delta: z.number().int().min(-10_000).max(10_000).refine(x => x !== 0),
    note: z.string().trim().max(500).optional() }).strict()).min(1).max(100)
}).strict().refine(input => new Set(input.adjustments.map(item => item.sku)).size === input.adjustments.length);
const productPatchSchema = z.object({ requestId: key, productId: id, patch: z.object({
  brand: z.string().trim().max(100).optional(), design: z.string().trim().max(100).optional(), fabric: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1).max(200).optional(), description: z.string().trim().max(5000).optional(),
  shortDescription: z.string().trim().max(500).optional(), category: z.string().trim().min(2).max(100).optional(),
  subCategory: z.string().trim().max(100).optional(), gsl: z.string().trim().max(120).optional(),
  salePrice: money.optional(), mrp: money.optional(), costPrice: money.optional(), active: z.boolean().optional(),
  primaryImageUrl: z.url().max(2048).optional(),
  barcode: id.or(z.literal('')).optional(),
  variantPatches: z.array(z.object({ sku: id, barcode: id.or(z.literal('')).optional(), size: z.string().trim().min(1).max(50),
    color: z.string().trim().min(1).max(80), price: money, costPrice: money.optional() })).max(100).optional(),
  images: z.array(z.object({ url: z.url().max(2048), isPrimary: z.boolean().optional(), color: z.string().max(80).optional() })).max(20).optional()
}).strict().refine(x => Object.keys(x).length > 0) }).strict();
const productCreateSchema = z.object({ requestId: key,
  name: z.string().trim().min(2).max(200), sku: id, barcode: id.optional(),
  brand: z.string().trim().max(100).optional(), design: z.string().trim().max(100).optional(), fabric: z.string().trim().max(100).optional(),
  category: z.string().trim().min(2).max(100), subCategory: z.string().trim().max(100).optional(),
  shortDescription: z.string().trim().max(500).optional(), description: z.string().trim().max(5000).optional(),
  gsl: z.string().trim().max(120).optional(), salePrice: money, mrp: money, costPrice: money.default(0),
  variants: z.array(z.object({ size: z.string().trim().min(1).max(50), color: z.string().trim().min(1).max(80),
    colorHex: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), stock: z.number().int().min(0).max(100_000),
    price: money, costPrice: money, barcode: id.optional() }).strict()).min(1).max(100),
  imageUrls: z.array(z.url().startsWith('https://').max(2048)).max(20).optional(),
  publish: z.boolean().default(false), isTrending: z.boolean().default(false),
  offerEnabled: z.boolean().default(false), offerDiscountPercentage: z.number().min(0).max(100).default(0),
  offerStartAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  offerEndAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  offerTitle: z.string().trim().max(200).optional(), offerItems: z.array(z.string().trim().min(1).max(250)).max(20).optional(),
  sizeGuide: z.object({ enabled: z.boolean(), unit: z.enum(['in', 'cm']),
    columns: z.array(z.string().trim().min(1).max(100)).max(12),
    rows: z.array(z.record(z.string().regex(/^c\d+$/), z.string().trim().max(100))).max(100) }).optional()
}).strict().refine(input => input.mrp > 0 && input.salePrice > 0 && input.salePrice <= input.mrp &&
  input.variants.every(variant => variant.price > 0 && variant.price <= input.mrp) &&
  (!input.offerStartAt || !input.offerEndAt || input.offerEndAt > input.offerStartAt) &&
  (!input.publish || Boolean(input.imageUrls?.length)), { message: 'Product pricing or images are incomplete.' });

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const rupees = (value: unknown) => Math.round(Number(value || 0) * 100);
const safe = (value: unknown) => JSON.parse(JSON.stringify(value));
type Variant = { sku?: string; stock?: number; quantity?: number; reserved?: number; price?: number; salePrice?: number; size?: string; color?: string; [key: string]: unknown };
type Product = DocumentData & { variants?: Variant[]; stock?: number; quantity?: number; reserved?: number; active?: boolean; name?: string; sku?: string; salePrice?: number; price?: number };

export function fiscalYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}
function stockFor(product: Product, sku: string) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) {
    const index = variants.findIndex(v => v.sku === sku);
    if (index < 0) throw Object.assign(new Error('Variant SKU not found.'), { status: 409 });
    const onHand = Number(variants[index].stock ?? variants[index].quantity ?? 0), reserved = Number(variants[index].reserved ?? 0);
    return { available: onHand - reserved, onHand, reserved, index };
  }
  if (product.sku !== sku) throw Object.assign(new Error('Product SKU not found.'), { status: 409 });
  const onHand = Number(product.stock ?? product.quantity ?? 0), reserved = Number(product.reserved ?? 0);
  return { available: onHand - reserved, onHand, reserved, index: -1 };
}
export function changeStock(product: Product, sku: string, delta: number): { product: Product; after: number } {
  const { available, onHand, reserved, index } = stockFor(product, sku);
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(onHand) || !Number.isSafeInteger(reserved) ||
      reserved < 0 || available < 0 || !Number.isSafeInteger(onHand + delta) || onHand + delta < reserved)
    throw Object.assign(new Error('Insufficient available stock; review required.'), { status: 409 });
  const after = onHand + delta;
  if (index >= 0) {
    const variants = (product.variants || []).map(v => ({ ...v }));
    variants[index] = { ...variants[index], stock: after, quantity: after };
    const total = variants.reduce((sum, v) => sum + Number(v.stock ?? 0), 0);
    return { product: { ...product, variants, stock: total, quantity: total, inStock: total > 0,
      reserved: variants.reduce((sum, v) => sum + Number(v.reserved ?? 0), 0),
      sizes: [...new Set(variants.filter(v => Number(v.stock) - Number(v.reserved ?? 0) > 0).map(v => v.size).filter(Boolean))] }, after };
  }
  return { product: { ...product, stock: after, quantity: after, inStock: after > 0 }, after };
}
function publicProduct(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data();
  return { id: doc.id, name: data.name || '', sku: data.sku || '', barcode: data.barcode || data.posBarcode || '', price: data.salePrice ?? data.price ?? 0,
    brand: data.brand || '', design: data.design || '', fabric: data.fabric || '', mrp: data.mrp ?? 0, costPrice: data.costPrice ?? data.cost_price ?? data.purchasePrice ?? 0,
    category: data.category || '', subCategory: data.subCategory || '', shortDescription: data.shortDescription || '',
    description: data.description || '', gsl: data.gsl || '', active: data.active !== false,
    onHand: Number(data.stock ?? 0), reserved: Number(data.reserved ?? 0), reorderThreshold: Number(data.reorderThreshold ?? 5), stock: Number(data.stock ?? 0) - Number(data.reserved ?? 0),
    image: data.thumbnailUrl || data.image || data.images?.[0]?.url || data.images?.[0] || '',
    variants: (data.variants || []).map((v: Variant) => ({ sku: v.sku, barcode: v.barcode || v.posBarcode || '', size: v.size, color: v.color,
      onHand: Number(v.stock ?? v.quantity ?? 0), reserved: Number(v.reserved ?? 0), reorderThreshold: Number(v.reorderThreshold ?? data.reorderThreshold ?? 5), stock: Number(v.stock ?? v.quantity ?? 0) - Number(v.reserved ?? 0), price: Number(v.price ?? v.salePrice ?? data.salePrice ?? data.price ?? 0),
      mrp: Number(v.mrp ?? data.mrp ?? 0), costPrice: Number(v.costPrice ?? v.cost_price ?? v.purchasePrice ?? data.costPrice ?? data.cost_price ?? 0) })) };
}
export const commerceRouter = Router();
commerceRouter.get('/products', async (_req, res) => {
  try {
    const docs = await firebase().db.collection('products').get();
    res.json({
      items: docs.docs
        .filter(d => {
          const data = d.data();
          if (data.isDeleted === true) return false;
          const id = d.id.toLowerCase();
          const name = String(data.name || '').toLowerCase();
          const sku = String(data.sku || '').toLowerCase();
          if (data.isDemo === true || data.preview === true || data.isPreview === true || data.isSample === true) return false;
          if (id.startsWith('demo') || id.includes('preview') || id.includes('sample')) return false;
          if (name.includes('demo') || name.includes('preview') || name.includes('sample')) return false;
          if (sku.startsWith('demo') || sku.includes('preview') || sku.includes('sample')) return false;
          return true;
        })
        .map(d => {
          const product = publicProduct(d);
          if (res.locals.owner?.role === 'cashier') {
            delete (product as any).costPrice;
            product.variants = product.variants.map((v: any) => {
              const { costPrice, ...safe } = v;
              return safe;
            });
          }
          return product;
        })
    });
  } catch {
    res.status(503).json({ error: 'Products are unavailable.' });
  }
});
commerceRouter.get('/products/:productId/label', async (req, res) => {
  const productId = id.safeParse(req.params.productId), sku = id.safeParse(req.query.sku);
  const format = z.enum(['code128', 'qrcode']).safeParse(req.query.format || 'code128');
  if (!productId.success || !sku.success || !format.success) { res.status(400).json({ error: 'Invalid label.' }); return; }
  try {
    const product = await firebase().db.collection('products').doc(productId.data).get();
    if (!product.exists) { res.status(404).json({ error: 'Product not found.' }); return; }
    const data = product.data() as Product;
    stockFor(data, sku.data);
    const variant = data.variants?.find(v => v.sku === sku.data);
    const labelText = String(variant ? (variant.barcode || sku.data) : (data.barcode || sku.data));
    const svg = toSVG({ bcid: format.data, text: labelText, scale: 3, height: 12,
      includetext: format.data === 'code128', textxalign: 'center', backgroundcolor: 'FFFFFF' });
    res.set({ 'Content-Type': 'image/svg+xml', 'Content-Disposition': `inline; filename="${sku.data}-${format.data}.svg"`,
      'Cache-Control': 'private, no-store' }).send(svg);
  } catch (error) { fail(res, error); }
});
commerceRouter.post('/products/images/upload', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }), async (req, res) => {
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const mime = req.get('content-type')?.split(';')[0]?.trim() || '';
  const valid = (mime === 'image/jpeg' && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid || bytes.length > 3_000_000) { res.status(422).json({ error: 'Choose a JPEG, PNG or WebP image under 3 MB.' }); return; }
  if (!config.imagekitPrivateKey) { res.status(503).json({ error: 'Image uploads are not configured on this server.' }); return; }
  try {
    const form = new FormData();
    const fileName = `product-${randomBytes(8).toString('hex')}.${mime.split('/')[1]}`;
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), fileName);
    form.append('fileName', fileName);
    form.append('folder', '/products');
    const upstream = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.imagekitPrivateKey}:`).toString('base64')}` },
      body: form, signal: AbortSignal.timeout(20_000)
    });
    if (!upstream.ok) { res.status(502).json({ error: 'Image service could not upload this file.' }); return; }
    const payload = await upstream.json() as { url?: string };
    if (!payload.url?.startsWith('https://')) { res.status(502).json({ error: 'Image service returned no secure URL.' }); return; }
    res.status(201).json({ url: payload.url });
  } catch { res.status(502).json({ error: 'Image upload failed. Please retry.' }); }
});
commerceRouter.get('/orders', async (_req, res) => {
  try { const docs = await firebase().db.collection('orders').orderBy('createdAt', 'desc').limit(80).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Orders are unavailable.' }); }
});
commerceRouter.get('/customers', async (_req, res) => {
  try {
    const db = firebase().db;
    const [users, profiles] = await Promise.all([db.collection('users').get(), db.collection('erp_customerProfiles').get()]);
    res.json({ items: customerDirectory(users.docs.map(d => ({ id: d.id, data: d.data() })),
      profiles.docs.map(d => ({ id: d.id, data: d.data() }))) });
  }
  catch { res.status(503).json({ error: 'Customers are unavailable.' }); }
});
commerceRouter.get('/customers/by-phone', async (req, res) => {
  const phone = typeof req.query.phone === 'string' ? mobileNumber(req.query.phone) : '';
  if (!phone) { res.status(422).json({ error: 'Enter a valid mobile number.' }); return; }
  try {
    const profile = await firebase().db.collection('erp_customerProfiles').doc(customerKey(phone, '')).get();
    res.json({ customer: profile.exists ? customerDirectory([], [{ id: profile.id, data: profile.data()! }])[0] : null });
  } catch { res.status(503).json({ error: 'Saved customer details are unavailable. Enter the date of birth to continue.' }); }
});
commerceRouter.get('/suppliers', async (_req, res) => {
  try { const docs = await firebase().db.collection('erp_suppliers').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Suppliers are unavailable.' }); }
});
commerceRouter.get('/purchases', async (_req, res) => {
  try { const docs = await firebase().db.collection('erp_purchases').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Purchases are unavailable.' }); }
});
commerceRouter.get('/movements', async (_req, res) => {
  try { const docs = await firebase().db.collection('stockMovements').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Stock movements are unavailable.' }); }
});
commerceRouter.get('/invoices', async (_req, res) => {
  try { const docs = await firebase().db.collection('erp_invoices').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Invoices are unavailable.' }); }
});
commerceRouter.get('/invoices/:invoiceId/pdf', async (req, res) => {
  const parsed = id.safeParse(req.params.invoiceId);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid receipt ID.' }); return; }
  try {
    const snapshot = await firebase().db.collection('erp_invoices').doc(parsed.data).get();
    if (!snapshot.exists) { res.status(404).json({ error: 'Receipt not found.' }); return; }
    const pdf = invoicePdf({ id: snapshot.id, ...snapshot.data() });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${parsed.data}.pdf"`,
      'Cache-Control': 'private, no-store' }).send(pdf);
  } catch { res.status(503).json({ error: 'Receipt PDF is unavailable.' }); }
});
commerceRouter.get('/sync-health', async (_req, res) => {
  try { const docs = await firebase().db.collection('erp_syncLog').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ items: docs.docs.map(d => ({ id: d.id, ...d.data() })) }); }
  catch { res.status(503).json({ error: 'Sync log is unavailable.' }); }
});
commerceRouter.post('/sync/retry', async (req, res) => {
  const parsed = z.object({ requestId: key, eventId: id }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid sync retry.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'sync_retry', input.requestId, input, async tx => {
      const ref = db.collection('erp_syncLog').doc(input.eventId);
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.event !== 'invoice_delivery') throw Object.assign(new Error('Delivery event not found.'), { status: 404 });
      const event = snap.data()!;
      if (!['failed', 'awaiting_provider'].includes(event.status)) {
        throw Object.assign(new Error('Only failed or pending deliveries can be retried.'), { status: 409 });
      }
      const invoice = await tx.get(db.collection('erp_invoices').doc(String(event.invoiceId || '')));
      if (!invoice.exists || invoice.data()?.whatsappOptIn !== true) {
        throw Object.assign(new Error('Customer receipt consent is missing.'), { status: 409 });
      }
      tx.update(ref, { status: 'awaiting_provider', retryCount: Number(event.retryCount || 0) + 1,
        error: null, updatedAt: FieldValue.serverTimestamp() });
      return { eventId: input.eventId, queued: true };
    });
    const delivery = await deliverInvoice(db, input.eventId);
    res.json({ ...result, delivery });
  } catch (error) { fail(res, error); }
});
commerceRouter.get('/shop-details', async (_req, res) => {
  try { const doc = await firebase().db.collection('settings').doc('storeSettings').get();
    res.json({ name: doc.data()?.storeName || 'Brothers Outfit Gallery', phone: doc.data()?.phone || '+91 84602 33020',
      address: doc.data()?.address || 'FF-57, Pratham Square, Sahakari Jin Road, Himatnagar, Gujarat 383001',
      email: doc.data()?.email || 'brothersoutfitgallery@gmail.com', whatsapp: doc.data()?.whatsappNumber || '918460233020',
      logo: '/favicon.svg' }); }
  catch { res.status(503).json({ error: 'Shop details are unavailable.' }); }
});

commerceRouter.post('/products/create', async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid new product.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'product_create', input.requestId, input, async tx => {
      const productId = `BOG-POS-${hash(input.requestId).slice(0, 24)}`;
      const skuPart = (value: string) => value.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'STANDARD';
      const variants = input.variants.map((variant, index) => ({ ...variant, index,
        sku: `${input.sku}-${skuPart(variant.color)}-${skuPart(variant.size)}` }));
      const skus = [input.sku, ...variants.map(variant => variant.sku)];
      const normalizedSkus = skus.map(sku => sku.toLowerCase());
      if (skus.some(sku => sku.length > 128) || new Set(normalizedSkus).size !== skus.length)
        throw Object.assign(new Error('Variant SKUs must be unique and at most 128 characters.'), { status: 422 });
      const variantCodes = variants.flatMap(variant => [variant.sku, variant.barcode || '']).filter(Boolean).map(code => code.toLowerCase());
      if (new Set(variantCodes).size !== variantCodes.length)
        throw Object.assign(new Error('Two variants cannot share a SKU or barcode.'), { status: 422 });
      const slugBase = input.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'product';
      const slug = `${slugBase}-${hash(input.requestId).slice(0, 10)}`;
      const ref = db.collection('products').doc(productId);
      const skuRefs = normalizedSkus.map(sku => db.collection('productSkuMappings').doc(hash(sku)));
      const slugRef = db.collection('productSlugMappings').doc(hash(slug));
      const catalog = await tx.get(db.collection('products'));
      const candidateCodes = [input.sku, input.barcode || '', ...variantCodes].filter(Boolean).map(code => code.toLowerCase());
      for (const entry of catalog.docs) {
        const data = entry.data();
        const existing = [data.sku, data.barcode, data.posBarcode,
          ...(Array.isArray(data.variants) ? data.variants.flatMap((v: Variant | null) => [v?.sku, v?.barcode, v?.posBarcode]) : [])]
          .filter(Boolean).map((code: unknown) => String(code).trim().toLowerCase());
        if (candidateCodes.some(code => existing.includes(code)))
          throw Object.assign(new Error('SKU or barcode is already in use.'), { status: 409 });
      }
      const [existingProduct, ...existingMappings] = await tx.getAll(ref, ...skuRefs, slugRef);
      if (existingProduct.exists || existingMappings.some(snapshot => snapshot.exists))
        throw Object.assign(new Error('Product identity is already in use.'), { status: 409 });
      const now = FieldValue.serverTimestamp();
      const variantDocs = variants.map(variant => ({ id: `${productId}-v${variant.index + 1}`, sku: variant.sku,
        barcode: variant.barcode || '', size: variant.size, color: variant.color,
        stock: variant.stock, quantity: variant.stock, reserved: 0, price: variant.price, salePrice: variant.price,
        costPrice: variant.costPrice, cost_price: variant.costPrice, purchasePrice: variant.costPrice,
        purchase_price: variant.costPrice, isDefaultPrice: variant.index === 0 }));
      const totalStock = variants.reduce((sum, variant) => sum + variant.stock, 0);
      const colors = [...new Map(variants.map(variant => [variant.color.toLowerCase(),
        { name: variant.color, hex: variant.colorHex || '#b88a2e' }])).values()];
      const images = (input.imageUrls || []).map((url, index) => ({ url, isPrimary: index === 0 }));
      const primaryImage = input.imageUrls?.[0] || '';
      const categoryKey = input.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const subCategoryKey = (input.subCategory || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      tx.create(ref, { webProductId: productId, integrationOrigin: 'admin-pos', name: input.name,
        brand: input.brand || '', design: input.design || '', fabric: input.fabric || '', sku: input.sku, barcode: input.barcode || '', slug, category: input.category, categoryId: input.category,
        categoryKey, subCategory: input.subCategory || '', subCategoryKey, primaryColor: variants[0].color, colors,
        shortDescription: input.shortDescription || '', description: input.description || '', gsl: input.gsl || '',
        price: input.salePrice, salePrice: input.salePrice, mrp: input.mrp, compareAtPrice: input.mrp,
        costPrice: input.costPrice, cost_price: input.costPrice, purchasePrice: input.costPrice, purchase_price: input.costPrice,
        discountPercentage: input.mrp > input.salePrice ? Math.round((input.mrp - input.salePrice) / input.mrp * 100) : 0,
        variants: variantDocs, stock: totalStock, quantity: totalStock, reserved: 0,
        inStock: totalStock > 0, active: input.publish, isDeleted: false, isTrending: input.isTrending,
        offerEnabled: input.offerEnabled, offerDiscountPercentage: input.offerDiscountPercentage,
        offerStartAt: input.offerStartAt || '', offerEndAt: input.offerEndAt || '',
        offersConfig: { enabled: input.offerEnabled, useCustomOffers: Boolean(input.offerItems?.length),
          title: input.offerTitle || 'Offers for you', items: input.offerItems || [] },
        customOffers: input.offerItems || [], offersTitle: input.offerTitle || 'Offers for you',
        sizeGuide: input.sizeGuide || { enabled: false, unit: 'in', columns: [], rows: [] },
        sizes: [...new Set(variants.filter(variant => variant.stock > 0).map(variant => variant.size))],
        allSizes: [...new Set(variants.map(variant => variant.size))], images,
        thumbnailUrl: primaryImage, image: primaryImage,
        createdAt: now, updatedAt: now });
      skuRefs.forEach((skuRef, index) => tx.create(skuRef, { normalizedSku: normalizedSkus[index],
        sku: skus[index], productId, webProductId: productId, updatedAt: now }));
      tx.create(slugRef, { normalizedSlug: slug, slug, productId, webProductId: productId, updatedAt: now });
      for (const variant of variants.filter(variant => variant.stock > 0)) {
        const movementId = `erp_${hash(`product_create:${input.requestId}:${variant.sku}`)}`;
        tx.create(db.collection('stockMovements').doc(movementId), { movementId, productId,
          webProductId: productId, sku: variant.sku, size: variant.size, color: variant.color,
          deltaChange: variant.stock, stockAfter: variant.stock, source: 'admin',
          reason: 'product_created', externalReference: input.requestId, createdAt: now });
      }
      tx.create(db.collection('erp_auditLog').doc(hash(`product_create:${input.requestId}`)), {
        actor: res.locals.owner?.uid || 'pin-owner', target: `products/${productId}`, fields: Object.keys(input),
        after: { ...input, productId, variantSkus: variants.map(variant => variant.sku), slug }, createdAt: now
      });
      return { productId, sku: variants[0].sku, slug, published: input.publish };
    });
    res.status(201).json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/products/patch', async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid product edit.' }); return; }
  const { productId, patch, requestId } = parsed.data;
  try {
    const db = firebase().db;
    const result = await idempotent(db, 'product_patch', requestId, parsed.data, async tx => {
      const ref = db.collection('products').doc(productId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error('Product not found.'), { status: 404 });
      const before = Object.fromEntries(Object.keys(patch).map(field => [field, snapshot.data()?.[field] ?? null]));
      const { primaryImageUrl, variantPatches, ...direct } = patch;
      const after: Record<string, unknown> = { ...direct,
        ...(patch.salePrice !== undefined ? { price: patch.salePrice } : {}),
        ...(patch.mrp !== undefined ? { compareAtPrice:patch.mrp, variants:(snapshot.data()?.variants||[]).map((v:Variant)=>({...v,mrp:patch.mrp})) } : {}),
        ...(patch.costPrice !== undefined ? { cost_price: patch.costPrice, purchasePrice: patch.costPrice, purchase_price: patch.costPrice } : {}),
        ...(patch.category !== undefined ? { categoryId: patch.category, categoryKey: patch.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') } : {}),
        ...(patch.subCategory !== undefined ? { subCategoryKey: patch.subCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-') } : {}),
        updatedAt: FieldValue.serverTimestamp() };
      if (primaryImageUrl) {
        const existing = Array.isArray(snapshot.data()?.images) ? snapshot.data()!.images : [];
        const rest = existing.filter((image: unknown) => (typeof image === 'string' ? image : (image as { url?: string })?.url) !== primaryImageUrl);
        after.images = [{ url: primaryImageUrl, isPrimary: true }, ...rest].slice(0, 20);
        after.thumbnailUrl = primaryImageUrl;
        after.image = primaryImageUrl;
      }
      if (variantPatches) {
        const existing = Array.isArray(snapshot.data()?.variants) ? snapshot.data()!.variants as Variant[] : [];
        if (variantPatches.length !== existing.length || new Set(variantPatches.map(v => v.sku)).size !== existing.length) {
          throw Object.assign(new Error('Variant list changed; refresh before editing.'), { status: 409 });
        }
        const changes = new Map(variantPatches.map(v => [v.sku, v]));
        after.variants = existing.map(variant => {
          const edit = changes.get(String(variant.sku || ''));
          if (!edit) throw Object.assign(new Error('Variant SKU changed; refresh before editing.'), { status: 409 });
          return { ...variant, ...(patch.mrp!==undefined?{mrp:patch.mrp}:{}), barcode: edit.barcode ?? variant.barcode ?? '', size: edit.size, color: edit.color, price: edit.price, salePrice: edit.price,
            ...(edit.costPrice !== undefined ? { costPrice: edit.costPrice, cost_price: edit.costPrice, purchasePrice: edit.costPrice, purchase_price: edit.costPrice } : {}) };
        });
        after.sizes = [...new Set((after.variants as Variant[]).filter(v => Number(v.stock ?? v.quantity ?? 0) > 0).map(v => v.size).filter(Boolean))];
      }
      if (patch.barcode !== undefined || variantPatches?.some(v => v.barcode !== undefined)) {
        const editedVariants = (after.variants || snapshot.data()?.variants || []) as Variant[];
        const variantOwners = new Map<string, string>();
        for (const variant of editedVariants) {
          for (const code of [variant.sku, variant.barcode].filter(Boolean)) {
            const normalized = String(code).toLowerCase();
            const owner = variantOwners.get(normalized);
            if (owner && owner !== variant.sku) throw Object.assign(new Error('Two variants cannot use the same SKU or barcode.'), { status: 409 });
            variantOwners.set(normalized, String(variant.sku));
          }
        }
        const ownCodes = new Set([String(snapshot.data()?.sku || ''), String(patch.barcode ?? snapshot.data()?.barcode ?? ''),
          ...editedVariants.flatMap(v => [String(v.sku || ''), String(v.barcode || '')])]
          .filter(Boolean).map(code => code.toLowerCase()));
        const catalog = await tx.get(db.collection('products'));
        for (const other of catalog.docs) {
          if (other.id === productId || other.data().isDeleted === true) continue;
          const data = other.data();
          const codes = [data.sku, data.barcode, data.posBarcode,
            ...(Array.isArray(data.variants) ? data.variants.flatMap((v: Variant | null) => [v?.sku, v?.barcode, v?.posBarcode]) : [])];
          if (codes.some((code: unknown) => typeof code === 'string' && ownCodes.has(code.toLowerCase())))
            throw Object.assign(new Error('SKU or barcode is already in use.'), { status: 409 });
        }
      }
      if(patch.mrp!==undefined||patch.salePrice!==undefined||variantPatches){const current=snapshot.data()!,mrp=Number(after.mrp??current.mrp),price=Number(after.salePrice??current.salePrice??current.price);if(!(price>0&&mrp>=price)||(after.variants as Variant[]||current.variants||[]).some((v:Variant)=>Number(v.price??v.salePrice??price)<=0||Number(v.price??v.salePrice??price)>Number(v.mrp??mrp)))throw Object.assign(new Error('Sale prices must be positive and cannot exceed MRP.'),{status:422});}
      tx.update(ref, after);
      tx.create(db.collection('erp_auditLog').doc(hash(`product_patch:${requestId}`)), {
        actor: res.locals.owner?.uid || 'pin-owner', target: `products/${productId}`, fields: Object.keys(patch), before, after: patch,
        createdAt: FieldValue.serverTimestamp()
      });
      return { productId, fields: Object.keys(patch) };
    });
    res.json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/inventory/adjust', async (req, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid stock adjustment.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'stock_adjustment', input.requestId, input, async tx => {
      const ref = db.collection('products').doc(input.productId), doc = await tx.get(ref);
      if (!doc.exists) throw Object.assign(new Error('Product not found.'), { status: 404 });
      const changed = changeStock(doc.data() as Product, input.sku, input.delta);
      tx.update(ref, { ...changed.product, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection('stockMovements').doc(`erp_${hash(input.requestId)}`), {
        movementId: `erp_${hash(input.requestId)}`, productId: input.productId, sku: input.sku,
        deltaChange: input.delta, stockAfter: changed.after, reason: input.reason,
        source: 'admin', note: input.note || '', createdAt: FieldValue.serverTimestamp()
      });
      return { productId: input.productId, sku: input.sku, stockAfter: changed.after };
    });
    res.json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/inventory/adjust-batch', async (req, res) => {
  const parsed = batchAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid variant stock adjustments.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'stock_adjustment_batch', input.requestId, input, async tx => {
      const ref = db.collection('products').doc(input.productId), doc = await tx.get(ref);
      if (!doc.exists) throw Object.assign(new Error('Product not found.'), { status: 404 });
      let current = doc.data() as Product;
      const changes: { sku: string; delta: number; stockAfter: number }[] = [];
      for (const adjustment of input.adjustments) {
        const changed = changeStock(current, adjustment.sku, adjustment.delta);
        current = changed.product;
        const movementId = `erp_${hash(`${input.requestId}:${adjustment.sku}`)}`;
        tx.create(db.collection('stockMovements').doc(movementId), {
          movementId, productId: input.productId, sku: adjustment.sku, deltaChange: adjustment.delta,
          stockAfter: changed.after, reason: 'adjustment', source: 'admin-product-edit',
          note: adjustment.note || 'Adjusted from Edit product', createdAt: FieldValue.serverTimestamp()
        });
        changes.push({ sku: adjustment.sku, delta: adjustment.delta, stockAfter: changed.after });
      }
      tx.update(ref, { ...current, updatedAt: FieldValue.serverTimestamp() });
      return { productId: input.productId, changes };
    });
    res.json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/suppliers/create', async (req, res) => {
  const parsed = z.object({ requestId: key, name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(20).optional(), email: z.email().max(254).optional(),
    gstin: z.string().trim().max(15).optional() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid supplier details.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'supplier_create', input.requestId, input, async tx => {
      const supplierId = `supplier_${hash(input.requestId).slice(0,24)}`;
      tx.create(db.collection('erp_suppliers').doc(supplierId), { name: input.name, phone: input.phone || '',
        email: input.email || '', gstin: input.gstin || '', active: true, createdAt: FieldValue.serverTimestamp() });
      return { supplierId };
    });
    res.status(201).json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/pos/recover',async(req,res)=>{
 const parsed=z.object({requestId:key}).strict().safeParse(req.body);if(!parsed.success){res.status(422).json({error:'Invalid provisional bill.'});return;}
 try{const db=firebase().db;res.json(await db.runTransaction(async tx=>{const ref=db.collection('erp_commands').doc(hash(`pos_sale:${parsed.data.requestId}`)),doc=await tx.get(ref);if(doc.exists&&!doc.data()?.cancelled)return {state:'posted',...doc.data()?.result};if(!doc.exists)tx.create(ref,{scope:'pos_sale',requestId:parsed.data.requestId,cancelled:true,createdAt:FieldValue.serverTimestamp()});return {state:'editable'};}));}catch(e){fail(res,e);}
});
commerceRouter.post('/pos/sale', async (req, res) => {
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues.find(issue => issue.code === 'custom')?.message || 'Invalid sale.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'pos_sale', input.requestId, input, async tx => {
      const identity = customerKey(input.customerPhone, input.customerEmail);
      const creditState = (input.paymentMethod === 'credit' || (input.paymentMethod === 'split' && input.payments?.some(p => p.method === 'credit' && p.amount > 0))) ? await readCreditState(db, tx, identity) : null;
      const creditProfile = creditState ? await tx.get(db.collection('erp_customerProfiles').doc(identity)) : null;
      const fy = fiscalYear(), counterRef = db.collection('erp_invoiceSequences').doc(fy);
      const orderId = `POS-${hash(input.requestId).slice(0,24)}`;
      const products = new Map<string, Product>();
      const refs = [...new Set(input.lines.map(line => line.productId))].sort().map(productId => db.collection('products').doc(productId));
      const [counter, ...snapshots] = await tx.getAll(counterRef, ...refs);
      snapshots.forEach((doc, index) => { if (!doc.exists) throw Object.assign(new Error('Product not found.'), { status: 404 }); products.set(refs[index].id, doc.data() as Product); });
      const invoiceNumber = Number(counter.data()?.lastNumber || 0) + 1;
      const invoiceId = `BOG-${fy}-${String(invoiceNumber).padStart(5, '0')}`;
      let subtotalPaise = 0;
      let totalLineDiscountPaise = 0;
      let totalLineTaxPaise = 0;
      const lineSnapshots: Record<string, unknown>[] = [];
      input.lines.forEach((line, index) => {
        const product = products.get(line.productId)!;
        const current = stockFor(product, line.sku);
        const variant = current.index >= 0 ? product.variants?.[current.index] : undefined;
        const pricePaise = line.price !== undefined ? rupees(line.price) : rupees(variant?.price ?? variant?.salePrice ?? product.salePrice ?? product.price);
        if (!Number.isSafeInteger(pricePaise) || pricePaise < 0) throw Object.assign(new Error('Invalid product price.'), { status: 409 });
        const lineBasePaise = pricePaise * line.quantity;
        const lineDiscPaise = line.discount !== undefined ? rupees(line.discount) : 0;
        const lineTaxPaise = line.tax !== undefined ? rupees(line.tax) : 0;
        subtotalPaise += lineBasePaise;
        totalLineDiscountPaise += lineDiscPaise;
        totalLineTaxPaise += lineTaxPaise;
        const changed = changeStock(product, line.sku, -line.quantity);
        products.set(line.productId, changed.product);
        const rawCost = variant?.costPrice ?? variant?.cost_price ?? variant?.purchasePrice ?? (product as any).costPrice ?? (product as any).cost_price ?? (product as any).purchasePrice;
        const costKnown = typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0;
        const unitCost = costKnown ? Number(rawCost) : 0;
        const totalCost = costKnown ? Math.round(unitCost * line.quantity * 100) / 100 : 0;
        const costSource = costKnown ? (variant?.costPrice !== undefined ? 'variant_cost' : 'product_cost') : 'missing';
        const sellingValue = lineBasePaise / 100;
        const netRevenue = (lineBasePaise - lineDiscPaise) / 100;
        lineSnapshots.push({
          productId: line.productId,
          sku: line.sku,
          name: line.name || product.name || '',
          size: variant?.size || '',
          color: variant?.color || '',
          quantity: line.quantity,
          price: pricePaise / 100,
          sellingValue,
          discount: lineDiscPaise / 100,
          netRevenue,
          tax: lineTaxPaise / 100,
          taxPercent: line.taxPercent || 0,
          amount: (lineBasePaise - lineDiscPaise + lineTaxPaise) / 100,
          unitCost,
          totalCost,
          costSource,
          costKnown
        });
        tx.create(db.collection('stockMovements').doc(`${orderId}_${index}`), {
          movementId: `${orderId}_${index}`, productId: line.productId, sku: line.sku, deltaChange: -line.quantity,
          stockAfter: changed.after, source: 'pos', reason: 'pos_sale', orderId, createdAt: FieldValue.serverTimestamp()
        });
      });
      const overallDiscountPaise = rupees(input.discount || 0);
      const discountPaise = totalLineDiscountPaise > 0 ? totalLineDiscountPaise : overallDiscountPaise;
      const taxPaise = totalLineTaxPaise > 0 ? totalLineTaxPaise : rupees(input.tax || 0);
      const totalPaise = Math.max(0, subtotalPaise - discountPaise + taxPaise);
      const total = totalPaise / 100;
      if(input.expectedTotal !== undefined && Math.round(input.expectedTotal*100)!==Math.round(total*100)) throw Object.assign(new Error('Prices changed. Restore this bill for review before collecting payment.'),{status:409});
      let settlement; try { settlement = paymentBreakdown(total, input.paymentMethod, input.payments, input.cashTendered); } catch (e) { throw Object.assign(e as Error, { status: 422 }); }
      for (const ref of refs) tx.update(ref, { ...products.get(ref.id), updatedAt: FieldValue.serverTimestamp() });
      tx.set(counterRef, { lastNumber: invoiceNumber, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection('orders').doc(orderId), {
        items: lineSnapshots, subtotal: subtotalPaise / 100, discount: discountPaise / 100, tax: taxPaise / 100, totalAmount: total,
        ...settlement, status: 'Delivered', paymentStatus: settlement.creditAmount ? (settlement.creditAmount === total ? 'Credit' : 'Part paid') : 'Paid',
        paymentMethod: input.paymentMethod, customerName: input.customerName || '', customerPhone: input.customerPhone || '',
        customerAddress: input.customerAddress || '',
        customerDateOfBirth: input.customerDateOfBirth || '',
        createdBy: 'admin-pos', inventoryDeducted: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      tx.create(db.collection('erp_orderMeta').doc(orderId), { channel: 'POS', invoiceId,
        customerKey: identity || null, createdAt: FieldValue.serverTimestamp() });
      if (identity) {
        tx.set(db.collection('erp_customerProfiles').doc(identity), {
          customerKey: identity, ...customerProfileFields(input),
          ...(creditState && input.creditWhatsAppOptIn !== undefined ? { creditWhatsAppOptIn: input.creditWhatsAppOptIn } : {}), updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        if (creditState) {
          const summary = appendCreditEntry(db, tx, creditState, orderId, { kind: 'credit', creditDelta: settlement.creditAmount, loyaltyDelta: 0,
            orderId, invoiceId, dueDate: input.creditDueDate!, note: `POS bill ${invoiceId}`, paymentMethod: 'credit' });
          queueCustomerMessage(db, tx, `credit_${hash(input.requestId)}`, { customerKey: identity, name: input.customerName!, phone: mobileNumber(input.customerPhone!),
            action: 'Credit sale recorded', amount: settlement.creditAmount, balance: summary.balance, dueDate: input.creditDueDate!,
            consent: input.creditWhatsAppOptIn ?? creditProfile?.data()?.creditWhatsAppOptIn === true });
        } else tx.create(db.collection('erp_customerLedger').doc(orderId), {
          customerKey: identity, orderId, invoiceId, channel: 'POS',
          creditDelta: input.paymentMethod === 'credit' ? total : 0,
          loyaltyDelta: input.paymentMethod === 'credit' ? 0 : Math.floor(total / 100),
          createdAt: FieldValue.serverTimestamp()
        });
      }
      tx.create(db.collection('erp_invoices').doc(invoiceId), { orderId, invoiceNumber, fiscalYear: fy,
        customerName: input.customerName || '', customerPhone: input.customerPhone || '', customerEmail: input.customerEmail || '',
        customerAddress: input.customerAddress || '',
        customerDateOfBirth: input.customerDateOfBirth || '',
        customerKey: identity || null, lines: lineSnapshots,
        ...settlement, subtotal: subtotalPaise / 100, discount: discountPaise / 100, tax: taxPaise / 100, total, paymentMethod: input.paymentMethod,
        channel: 'POS', kind: 'sales_receipt', whatsappOptIn: input.whatsappOptIn, createdAt: FieldValue.serverTimestamp(),
        ...(creditState ? { creditDueDate: input.creditDueDate } : {})
      });
      tx.create(db.collection('erp_syncLog').doc(`invoice_${hash(input.requestId)}`), { event: 'invoice_delivery',
        source: 'pos', status: input.whatsappOptIn && input.customerPhone ? 'awaiting_provider' : 'consent_missing',
        invoiceId, retryCount: 0, createdAt: FieldValue.serverTimestamp()
      });
      return { orderId, invoiceId, total, channel: 'POS', ...settlement };
    });
    if (input.whatsappOptIn && input.customerPhone) await deliverInvoice(db, `invoice_${hash(input.requestId)}`).catch(() => {});
    if (result.creditAmount > 0) await deliverCustomerMessage(db, `credit_${hash(input.requestId)}`).catch(() => {});
    res.status(201).json({ ...result, billUrl: customerBillUrl(result.invoiceId) });
  } catch (error) { fail(res, error); }
});

const statusSchema = z.object({ requestId: key, orderId: id,
  status: z.enum(['Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled']) }).strict();
const transitions: Record<string, string[]> = {
  Processing: ['Confirmed', 'Packed', 'Cancelled'], Confirmed: ['Packed', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'], Shipped: ['Delivered', 'Cancelled'],
  Delivered: [], Cancelled: [], Returned: []
};
function itemSku(product: Product, item: DocumentData): string {
  if (item.sku) return String(item.sku);
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length && product.sku) return product.sku;
  const size = String(item.size || item.selectedSize || '').trim().toLowerCase();
  const color = String(item.color || item.selectedColor || '').trim().toLowerCase();
  const matches = variants.filter(v => (!size || String(v.size || '').trim().toLowerCase() === size) &&
    (!color || String(v.color || '').trim().toLowerCase() === color));
  if (matches.length !== 1 || !matches[0].sku) throw Object.assign(new Error('Ambiguous order item; review stock before cancelling.'), { status: 409 });
  return matches[0].sku;
}
commerceRouter.post('/orders/status', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid order status update.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'order_status', input.requestId, input, async tx => {
      const orderRef = db.collection('orders').doc(input.orderId), orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw Object.assign(new Error('Order not found.'), { status: 404 });
      const order = orderSnap.data()!;
      const current = String(order.status || 'Processing');
      if (current === input.status) return { orderId: input.orderId, status: current, duplicateState: true };
      if (!transitions[current]?.includes(input.status)) throw Object.assign(new Error('Invalid status transition.'), { status: 409 });
      const items = Array.isArray(order.items) ? order.items : [];
      const refs = input.status === 'Cancelled' && order.inventoryDeducted && !order.stockRestoredAt
        ? [...new Set(items.map((item: DocumentData) => String(item.productId || item.id || '')))].filter(Boolean).sort().map(productId => db.collection('products').doc(productId))
        : [];
      const snapshots = refs.length ? await tx.getAll(...refs) : [];
      const working = new Map<string, Product>();
      snapshots.forEach((doc, i) => {
        if (!doc.exists) throw Object.assign(new Error('Ordered product is missing; review cancellation.'), { status: 409 });
        working.set(refs[i].id, doc.data() as Product);
      });
      if (refs.length) {
        items.forEach((item: DocumentData, index: number) => {
          const productId = String(item.productId || item.id || '');
          const product = working.get(productId)!;
          const sku = itemSku(product, item);
          const quantity = Number(item.quantity);
          if (!Number.isSafeInteger(quantity) || quantity < 1) throw Object.assign(new Error('Invalid order quantity.'), { status: 409 });
          const changed = changeStock(product, sku, quantity);
          working.set(productId, changed.product);
          tx.create(db.collection('stockMovements').doc(`erp_cancel_${hash(input.orderId)}_${index}`), {
            movementId: `erp_cancel_${hash(input.orderId)}_${index}`, productId, sku,
            deltaChange: quantity, stockAfter: changed.after, source: 'website', reason: 'order_cancelled',
            orderId: input.orderId, createdAt: FieldValue.serverTimestamp()
          });
        });
        for (const ref of refs) tx.update(ref, { ...working.get(ref.id), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(orderRef, { status: input.status, updatedAt: FieldValue.serverTimestamp(),
        ...(input.status === 'Cancelled' ? { cancelledAt: FieldValue.serverTimestamp(),
          ...(refs.length ? { stockRestoredAt: FieldValue.serverTimestamp(), inventoryRestored: true } : {}) } : {}),
        ...(input.status === 'Shipped' ? { shipmentStatus: 'IN_TRANSIT' } : {}),
        ...(input.status === 'Delivered' ? { shipmentStatus: 'DELIVERED', deliveredAt: FieldValue.serverTimestamp() } : {})
      });
      tx.create(db.collection('erp_auditLog').doc(hash(`order_status:${input.requestId}`)), {
        actor: res.locals.owner?.uid || 'pin-owner', target: `orders/${input.orderId}`, fields: ['status'], before: { status: current },
        after: { status: input.status }, createdAt: FieldValue.serverTimestamp()
      });
      return { orderId: input.orderId, status: input.status, stockRestored: refs.length > 0 };
    });
    res.json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.post('/orders/invoice', async (req, res) => {
  const parsed = z.object({ requestId: key, orderId: id }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Invalid invoice request.' }); return; }
  try {
    const input = parsed.data, db = firebase().db;
    const result = await idempotent(db, 'online_invoice', input.requestId, input, async tx => {
      const orderRef = db.collection('orders').doc(input.orderId), metaRef = db.collection('erp_orderMeta').doc(input.orderId);
      const fy = fiscalYear(), counterRef = db.collection('erp_invoiceSequences').doc(fy);
      const [orderSnap, metaSnap, counter] = await tx.getAll(orderRef, metaRef, counterRef);
      if (!orderSnap.exists) throw Object.assign(new Error('Order not found.'), { status: 404 });
      if (metaSnap.data()?.invoiceId) return { orderId: input.orderId, invoiceId: metaSnap.data()?.invoiceId, duplicateState: true };
      const order = orderSnap.data()!;
      if (order.status === 'Cancelled' || !order.inventoryDeducted) throw Object.assign(new Error('Order cannot be invoiced.'), { status: 409 });
      const invoiceNumber = Number(counter.data()?.lastNumber || 0) + 1;
      const invoiceId = `BOG-${fy}-${String(invoiceNumber).padStart(5, '0')}`;
      tx.set(counterRef, { lastNumber: invoiceNumber, updatedAt: FieldValue.serverTimestamp() });
      tx.set(metaRef, { channel: 'Website', invoiceId, createdAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(db.collection('erp_invoices').doc(invoiceId), {
        orderId: input.orderId, invoiceNumber, fiscalYear: fy, lines: safe(order.items || []),
        subtotal: Number(order.subtotal || 0), discount: Number(order.discount || 0),
        total: Number(order.totalAmount || 0), customerName: order.shippingAddress?.fullName || '',
        customerPhone: order.userPhone || order.shippingAddress?.phone || '',
        paymentMethod: order.paymentMethod || '', paymentId: order.paymentId || null,
        channel: 'Website', kind: 'sales_receipt', whatsappOptIn: order.whatsappInvoiceOptIn === true,
        createdAt: FieldValue.serverTimestamp()
      });
      tx.create(db.collection('erp_syncLog').doc(`invoice_${hash(input.requestId)}`), { event: 'invoice_delivery',
        source: 'website', status: order.whatsappInvoiceOptIn === true ? 'awaiting_provider' : 'consent_missing',
        invoiceId, retryCount: 0, createdAt: FieldValue.serverTimestamp() });
      return { orderId: input.orderId, invoiceId, channel: 'Website' };
    });
    await deliverInvoice(db, `invoice_${hash(input.requestId)}`).catch(() => {});
    res.status(201).json(result);
  } catch (error) { fail(res, error); }
});

commerceRouter.get('/orders/stream', async (_req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');
  let initialized = false;
  const unsubscribe = firebase().db.collection('orders').orderBy('createdAt', 'desc').limit(40).onSnapshot(snapshot => {
    if (!initialized) { initialized = true; return; }
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added') res.write(`event: new-order\ndata: ${JSON.stringify({ id: change.doc.id, total: change.doc.data().totalAmount || 0 })}\n\n`);
    }
  }, () => { res.write('event: unavailable\ndata: {}\n\n'); res.end(); });
  const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 25_000);
  _req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

function fail(res: import('express').Response, error: unknown) {
  const status = Number((error as { status?: number })?.status || 500);
  res.status(status >= 400 && status < 500 ? status : 503).json({ error: status >= 400 && status < 500 ? (error as Error).message : 'Operation unavailable. No change was confirmed.' });
}
