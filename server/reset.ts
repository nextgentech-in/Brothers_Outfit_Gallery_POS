import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { config } from './config.js';
import { firebase } from './firebase.js';

// What each partial reset removes. Website customer accounts (users), website settings, staff,
// trusted devices and the product-number counter are never touched. Website orders are kept.
export const resetScopes = {
  customers: {
    label: 'Customers',
    collections: ['erp_customerProfiles', 'erp_customerLedger', 'erp_loyaltyAccounts', 'erp_creditAccounts', 'erp_customerMessages']
  },
  products: {
    label: 'Products & stock',
    collections: ['products', 'erp_posPricing', 'productSkuMappings', 'productSlugMappings', 'erp_productCosts', 'stockMovements',
      'posProductMappings', 'posStockEvents', 'posReconciliationDiscrepancies']
  },
  sales: {
    label: 'Bills, dashboard & reports',
    collections: ['erp_invoices', 'erp_invoiceSequences', 'erp_returns', 'erp_creditNotes', 'erp_creditNoteSequences', 'erp_refunds',
      'erp_dayClosings', 'erp_expenses', 'erp_commands', 'erp_syncLog'],
    // Only shop bills; orders placed on the website stay in the customer's account.
    filtered: [{ collection: 'orders', field: 'createdBy', values: ['admin-pos', 'pin-owner'] }, { collection: 'erp_orderMeta', field: 'channel', values: ['POS'] }]
  },
  purchases: {
    label: 'Suppliers & purchases',
    collections: ['erp_suppliers', 'erp_purchases', 'erp_purchaseOrders', 'erp_purchaseOrderKeys', 'erp_supplierInvoiceKeys', 'erp_supplierPayments',
      'erp_supplierAccounts', 'erp_supplierReturns', 'erp_supplierRefunds', 'erp_supplierCreditUsage']
  }
} as const;
export type ResetScope = keyof typeof resetScopes | 'all';
const scopeNames = Object.keys(resetScopes) as (keyof typeof resetScopes)[];
const expand = (scopes: ResetScope[]) => [...new Set(scopes.includes('all') ? scopeNames : scopes.filter((s): s is keyof typeof resetScopes => s !== 'all'))];

type Target = { collection: string; field?: string; values?: readonly string[] };
function targets(scopes: ResetScope[]): Target[] {
  const list: Target[] = expand(scopes).flatMap(name => {
    const scope = resetScopes[name];
    return [...scope.collections.map(collection => ({ collection })), ...('filtered' in scope ? scope.filtered : [])];
  });
  if (scopes.includes('all')) list.push({ collection: 'erp_auditLog' });
  return list;
}
async function refsFor(db: Firestore, target: Target): Promise<DocumentReference[]> {
  const base = db.collection(target.collection);
  const query = target.field && target.values ? base.where(target.field, 'in', [...target.values]) : base;
  return (await query.get()).docs.map(doc => doc.ref);
}

export async function previewReset(db: Firestore, scopes: ResetScope[]) {
  const counts: Record<string, number> = {};
  for (const target of targets(scopes)) counts[target.collection] = (counts[target.collection] ?? 0) + (await refsFor(db, target)).length;
  return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export async function runReset(db: Firestore, scopes: ResetScope[]) {
  const counts: Record<string, number> = {};
  for (const target of targets(scopes)) {
    const refs = await refsFor(db, target);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    counts[target.collection] = (counts[target.collection] ?? 0) + refs.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  await db.collection('erp_auditLog').doc(`reset_${Date.now()}`).set({
    kind: 'data_reset', scopes: expand(scopes), all: scopes.includes('all'), counts, total, createdAt: FieldValue.serverTimestamp()
  });
  return { counts, total };
}

export function ownerPinMatches(pin: unknown) {
  const expected = config.adminPin;
  if (typeof pin !== 'string' || !expected || !/^\d{4}$/.test(expected) || !/^\d{4}$/.test(pin)) return false;
  return timingSafeEqual(Buffer.from(pin), Buffer.from(expected));
}

const attempts = new Map<string, { count: number; startedAt: number }>();
function limited(key: string, failed: boolean) {
  const now = Date.now(), entry = attempts.get(key);
  const current = entry && now - entry.startedAt < 15 * 60_000 ? entry : { count: 0, startedAt: now };
  if (failed) current.count += 1;
  attempts.set(key, current);
  return current.count >= 5;
}

const scopeSchema = z.array(z.enum(['customers', 'products', 'sales', 'purchases', 'all'])).min(1).max(5);
export const resetRouter = Router();
resetRouter.get('/backup/reset/preview', async (req, res) => {
  if (res.locals.owner?.role !== 'owner') { res.status(403).json({ error: 'Owner access required.' }); return; }
  const scopes = scopeSchema.safeParse(String(req.query.scopes || '').split(',').filter(Boolean));
  if (!scopes.success) { res.status(400).json({ error: 'Choose what to reset.' }); return; }
  try { res.json(await previewReset(firebase().db, scopes.data)); }
  catch { res.status(503).json({ error: 'Could not count records. Nothing was changed.' }); }
});
resetRouter.post('/backup/reset', async (req, res) => {
  if (res.locals.owner?.role !== 'owner') { res.status(403).json({ error: 'Owner access required.' }); return; }
  const input = z.object({ scopes: scopeSchema, pin: z.string(), confirm: z.literal('RESET') }).strict().safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Type RESET and enter the owner PIN to continue.' }); return; }
  const key = String(res.locals.owner?.uid || 'owner');
  if (limited(key, false)) { res.status(429).json({ error: 'Too many wrong PIN attempts. Try again in 15 minutes.' }); return; }
  if (!ownerPinMatches(input.data.pin)) { limited(key, true); res.status(403).json({ error: 'Wrong owner PIN. Nothing was deleted.' }); return; }
  attempts.delete(key);
  try { res.json({ success: true, ...(await runReset(firebase().db, input.data.scopes)) }); }
  catch { res.status(503).json({ error: 'Reset stopped part way. Download a fresh backup and run it again to finish.' }); }
});
