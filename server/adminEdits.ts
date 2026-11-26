import { createHash } from 'node:crypto';
import { Router, type Response } from 'express';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { idempotent } from './transactions.js';
import { changeStock } from './commerce.js';
import { appendCreditEntry, readCreditState } from './creditLedger.js';
import { readRewardBalance, writeRewardBalance } from './rewards.js';
import { deleteCostFields, extractCosts, mergeCosts, readCostsTx, stripCosts, writeCosts } from './productCosts.js';
import { MAX_PURCHASE_LINES, purchaseLineSchema } from '../shared/purchases.js';

// Owner/manager corrections: delete customers and bills, edit purchases.
// Every stock, coin and credit change happens inside one Firestore transaction.
export const adminEditsRouter = Router();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const paise = (n: unknown) => Math.round(Number(n || 0) * 100);
const requestId = z.string().min(12).max(128).regex(/^[\w.:-]+$/);
const docId = z.string().trim().min(1).max(128).regex(/^[\w.:-]+$/);
const money = z.number().finite().min(0).max(10_000_000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Use at most two decimal places.');
const reject = (message: string, status = 422): never => { throw Object.assign(new Error(message), { status }); };
function fail(res: Response, error: unknown) {
  const status = Number((error as { status?: number })?.status || 503);
  res.status(status >= 400 && status < 500 ? status : 503)
    .json({ error: status >= 400 && status < 500 ? (error as Error).message : 'Operation unavailable. No change was confirmed.' });
}
function managerOnly(res: Response) {
  const role = res.locals.owner?.role;
  if (role === 'owner' || role === 'manager') return true;
  res.status(403).json({ error: 'Owner or manager access required.' });
  return false;
}
const actor = (res: Response) => res.locals.owner?.uid || 'pin-owner';

/** Weighted purchase rate after replacing one receipt line (oldQty @ oldUnit) with newQty @ newUnit. */
export function reweightCost(currentCost: number, currentStock: number, oldQty: number, oldUnit: number, newQty: number, newUnit: number) {
  const baseStock = currentStock - oldQty;
  const baseValue = paise(currentCost) * currentStock - paise(oldUnit) * oldQty;
  if (baseStock <= 0) return newQty > 0 ? paise(newUnit) / 100 : currentCost;
  const baseCost = Math.max(0, baseValue / baseStock);
  if (newQty <= 0) return Math.round(baseCost) / 100;
  return Math.round((baseCost * baseStock + paise(newUnit) * newQty) / (baseStock + newQty)) / 100;
}

/** Coins to take back so the customer's balance never goes below zero. */
export function coinsToReverse(balance: number, earned: number, redeemed: number) {
  const back = Math.max(0, earned) - Math.max(0, redeemed);
  return (back > 0 ? -Math.min(back, Math.max(0, balance)) : -back) || 0;
}

adminEditsRouter.post('/customers/delete', async (req, res) => {
  if (!managerOnly(res)) return;
  const parsed = z.object({ requestId, customerKey: docId }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Select a customer to delete.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    res.json(await idempotent(db, 'customer_delete', input.requestId, input, async tx => {
      const ref = db.collection('erp_customerProfiles').doc(input.customerKey);
      const profile = await tx.get(ref);
      if (!profile.exists) reject('This customer has no POS profile. Website accounts are managed on the website.', 404);
      const state = await readCreditState(db, tx, input.customerKey);
      if (state.summary.balance > 0) reject(`This customer still owes ₹${state.summary.balance.toFixed(2)} udhar. Settle it before deleting.`, 409);
      tx.delete(ref);
      tx.create(db.collection('erp_auditLog').doc(hash(`customer_delete:${input.requestId}`)), {
        actor: actor(res), target: `erp_customerProfiles/${input.customerKey}`, action: 'customer_deleted',
        before: profile.data(), createdAt: FieldValue.serverTimestamp() });
      return { deleted: true, customerKey: input.customerKey };
    }));
  } catch (e) { fail(res, e); }
});

adminEditsRouter.post('/invoices/delete', async (req, res) => {
  if (!managerOnly(res)) return;
  const parsed = z.object({ requestId, invoiceId: docId, restock: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Select a bill and how to delete it.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    res.json(await idempotent(db, 'invoice_delete', input.requestId, input, async tx => {
      const invoiceRef = db.collection('erp_invoices').doc(input.invoiceId);
      const invoiceSnap = await tx.get(invoiceRef);
      if (!invoiceSnap.exists) reject('Bill not found.', 404);
      const invoice = invoiceSnap.data()!;
      if (invoice.channel !== 'POS') reject('Only POS bills can be deleted here. Cancel website orders from their order status.', 409);
      const orderId = String(invoice.orderId || '');
      const orderRef = orderId ? db.collection('orders').doc(orderId) : null;
      const metaRef = orderId ? db.collection('erp_orderMeta').doc(orderId) : null;
      const [orderSnap, metaSnap] = orderRef && metaRef ? await tx.getAll(orderRef, metaRef) : [null, null];
      const order = orderSnap?.exists ? orderSnap.data()! : null;
      const returned = Object.values((order?.returnedQuantities || {}) as Record<string, number>).some(q => Number(q) > 0);
      if (returned || ['Returned', 'Partially returned'].includes(String(order?.status || '')) || Number(invoice.exchangeCreditUsed || 0) > 0)
        reject('This bill has a return or exchange recorded, so it cannot be deleted.', 409);
      const lines = (Array.isArray(invoice.lines) ? invoice.lines : []) as DocumentData[];

      // Stock: read every product before any write.
      const working = new Map<string, DocumentData>();
      const productIds = input.restock ? [...new Set(lines.map(l => String(l.productId || '')))].filter(Boolean).sort() : [];
      if (input.restock && productIds.length !== new Set(lines.map(l => String(l.productId || ''))).size)
        reject('A bill line has no product link. Use Delete permanently instead.', 409);
      const productRefs = productIds.map(id => db.collection('products').doc(id));
      const productSnaps = productRefs.length ? await tx.getAll(...productRefs) : [];
      productSnaps.forEach((snap, i) => {
        if (!snap.exists || snap.data()?.isDeleted === true) reject(`Product ${productIds[i]} no longer exists. Use Delete permanently instead.`, 409);
        working.set(productIds[i], snap.data()!);
      });

      // Coins and udhar for the customer on this bill.
      const customerKey = String(invoice.customerKey || metaSnap?.data()?.customerKey || '');
      const creditAmount = Number(invoice.creditAmount || 0) > 0 ? Number(invoice.creditAmount) : invoice.paymentMethod === 'credit' ? Number(invoice.total || 0) : 0;
      const creditState = customerKey && creditAmount > 0 ? await readCreditState(db, tx, customerKey) : null;
      const ledger = customerKey ? await tx.get(db.collection('erp_customerLedger').where('customerKey', '==', customerKey)) : null;
      // Coin balance lives in erp_loyaltyAccounts; the bill records what it earned and redeemed.
      const rewardsAccount = customerKey ? await readRewardBalance(db, tx, customerKey) : null;
      const earned = Math.max(0, Number(invoice.rewards?.earned ?? order?.rewards?.earned ?? 0));
      const redeemed = Math.max(0, Number(invoice.rewards?.redeemed ?? order?.rewards?.redeemed ?? 0));
      const coinDelta = rewardsAccount ? coinsToReverse(rewardsAccount.balance, earned, redeemed) : 0;
      // Older ledger rows also carry loyaltyDelta per bill; reverse that too so the two never disagree.
      const legacyBalance = ledger ? ledger.docs.reduce((sum, d) => sum + Number(d.data().loyaltyDelta || 0), 0) : 0;
      const legacyEarned = Math.max(0, Number(ledger?.docs.find(d => d.id === orderId)?.data().loyaltyDelta || 0));
      const legacyDelta = ledger ? coinsToReverse(legacyBalance, legacyEarned, 0) : 0;

      // Writes.
      const restocked: { productId: string; sku: string; quantity: number; stockAfter: number }[] = [];
      if (input.restock) {
        lines.forEach((line, index) => {
          const productId = String(line.productId), sku = String(line.sku || ''), quantity = Number(line.quantity);
          if (!sku || !Number.isSafeInteger(quantity) || quantity < 1) reject('A bill line has an invalid SKU or quantity. Use Delete permanently instead.', 409);
          const changed = changeStock(working.get(productId)!, sku, quantity);
          working.set(productId, changed.product);
          const movementId = `erp_billdel_${hash(input.invoiceId)}_${index}`;
          tx.create(db.collection('stockMovements').doc(movementId), { movementId, productId, sku, deltaChange: quantity,
            stockAfter: changed.after, source: 'pos', reason: 'bill_deleted_restock', orderId, invoiceId: input.invoiceId,
            createdAt: FieldValue.serverTimestamp() });
          restocked.push({ productId, sku, quantity, stockAfter: changed.after });
        });
        for (const ref of productRefs) tx.update(ref, { ...working.get(ref.id), updatedAt: FieldValue.serverTimestamp() });
      }
      const entryId = `billdel_${hash(input.invoiceId)}`;
      let creditReversed = 0;
      if (rewardsAccount && coinDelta) writeRewardBalance(tx, rewardsAccount, coinDelta);
      if (creditState) {
        creditReversed = creditState.summary.debts.find(d => d.id === orderId)?.remaining || 0;
        if (creditReversed > 0 || legacyDelta) appendCreditEntry(db, tx, creditState, entryId, { kind: 'return', creditDelta: -creditReversed,
          ...(creditReversed > 0 ? { appliesTo: orderId } : {}), loyaltyDelta: legacyDelta, orderId, invoiceId: input.invoiceId,
          note: `Bill ${input.invoiceId} deleted`, paymentMethod: 'credit' });
      } else if (legacyDelta) {
        tx.create(db.collection('erp_customerLedger').doc(entryId), { customerKey, orderId, invoiceId: input.invoiceId, channel: 'POS',
          kind: 'bill_deleted', creditDelta: 0, loyaltyDelta: legacyDelta, note: `Bill ${input.invoiceId} deleted`, createdAt: FieldValue.serverTimestamp() });
      }
      tx.delete(invoiceRef);
      if (orderSnap?.exists) tx.delete(orderRef!);
      if (metaSnap?.exists) tx.delete(metaRef!);
      tx.create(db.collection('erp_auditLog').doc(hash(`invoice_delete:${input.requestId}`)), {
        actor: actor(res), target: `erp_invoices/${input.invoiceId}`, action: input.restock ? 'bill_deleted_restocked' : 'bill_deleted_permanently',
        before: { invoice, order }, restocked, coinDelta, creditReversed, createdAt: FieldValue.serverTimestamp() });
      return { deleted: true, invoiceId: input.invoiceId, restocked: restocked.length, coinDelta, creditReversed };
    }));
  } catch (e) { fail(res, e); }
});

const editLineSchema = z.object({ productId: docId, sku: docId, quantity: z.number().int().min(1).max(10_000), unitCost: money,
  salePrice: money.optional(), mrp: money.optional() }).strict();
adminEditsRouter.post('/purchases/update', async (req, res) => {
  if (!managerOnly(res)) return;
  const parsed = z.object({ requestId, purchaseId: z.string().regex(/^PUR-[a-f0-9]{24}$/), lines: z.array(editLineSchema).min(1).max(MAX_PURCHASE_LINES) }).strict()
    .refine(v => new Set(v.lines.map(l => `${l.productId}:${l.sku}`)).size === v.lines.length, 'List each item once.')
    .safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0]?.message || 'Check the edited purchase lines.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    res.json(await idempotent(db, 'purchase_update', input.requestId, input, async tx => {
      const ref = db.collection('erp_purchases').doc(input.purchaseId), snap = await tx.get(ref);
      if (!snap.exists) reject('Stock receipt not found.', 404);
      const purchase = snap.data()!;
      if (Object.values((purchase.returnedQuantities || {}) as Record<string, number>).some(q => Number(q) > 0))
        reject('Items from this receipt were returned to the supplier, so it cannot be edited.', 409);
      // Purchase orders are received on creation; keep the linked PO record in step with its receipt.
      const linkedOrders = await tx.get(db.collection('erp_purchaseOrders').where('purchaseId', '==', input.purchaseId));
      const oldLines = (Array.isArray(purchase.lines) ? purchase.lines : []) as DocumentData[];
      const key = (l: { productId?: unknown; sku?: unknown }) => `${l.productId}:${l.sku}`;
      const oldByKey = new Map<string, DocumentData>();
      for (const line of oldLines) {
        const prev = oldByKey.get(key(line));
        oldByKey.set(key(line), prev ? { ...prev, quantity: Number(prev.quantity) + Number(line.quantity),
          unitCost: (paise(prev.unitCost) * Number(prev.quantity) + paise(line.unitCost) * Number(line.quantity)) / (Number(prev.quantity) + Number(line.quantity)) / 100 } : line);
      }
      const newByKey = new Map(input.lines.map(l => [key(l), l]));
      const productIds = [...new Set([...oldByKey.values(), ...input.lines].map(l => String(l.productId)))].sort();
      const productRefs = productIds.map(id => db.collection('products').doc(id));
      const snaps = await tx.getAll(...productRefs);
      const working = new Map<string, DocumentData>();
      snaps.forEach((s, i) => { if (!s.exists) reject(`Product ${productIds[i]} no longer exists.`, 409); working.set(productIds[i], s.data()!); });
      // Costs are private (erp_productCostPrices); merge them in memory and split them out again on write.
      for (const [productId, record] of await readCostsTx(db, tx, productIds)) working.set(productId, mergeCosts(working.get(productId)!, record));

      const lines: DocumentData[] = [];
      const movements: DocumentData[] = [];
      let total = 0;
      for (const k of new Set([...oldByKey.keys(), ...newByKey.keys()])) {
        const before = oldByKey.get(k), after = newByKey.get(k);
        const productId = String((after || before)!.productId), sku = String((after || before)!.sku);
        let product = working.get(productId)!;
        const variant = (Array.isArray(product.variants) ? product.variants : []).find((v: DocumentData) => v.sku === sku);
        if (!variant && (product.variants?.length || product.sku !== sku)) reject(`SKU ${sku} is no longer in the catalog.`, 409);
        const target = variant || product;
        const oldQty = Number(before?.quantity || 0), oldUnit = Number(before?.unitCost || 0);
        const newQty = after?.quantity || 0, newUnit = after?.unitCost ?? oldUnit;
        const stock = Number(target.stock ?? target.quantity ?? 0);
        const currentCost = Number(target.costPrice ?? product.costPrice ?? 0);
        const delta = newQty - oldQty;
        if (delta) {
          try { const changed = changeStock(product, sku, delta); product = changed.product;
            movements.push({ productId, sku, deltaChange: delta, stockAfter: changed.after });
          } catch { reject(`Not enough stock of ${sku} left to reduce this receipt by ${-delta}. It may already be sold.`, 409); }
        }
        const costPrice = delta || newUnit !== oldUnit ? reweightCost(currentCost, stock, oldQty, oldUnit, newQty, newUnit) : currentCost;
        const selling = after?.salePrice ?? Number(before?.salePrice ?? target.price ?? target.salePrice ?? product.salePrice ?? product.price);
        const mrp = after?.mrp ?? Number(before?.mrp ?? target.mrp ?? product.mrp);
        if (after && !(selling > 0 && mrp >= selling)) reject('Every item needs a positive sale price no higher than its MRP.');
        const priceFields = { costPrice, cost_price: costPrice, purchasePrice: costPrice, purchase_price: costPrice,
          ...(after ? { price: selling, salePrice: selling, mrp } : {}) };
        if (variant) product = { ...product, variants: product.variants.map((v: DocumentData) => v.sku === sku ? { ...v, ...priceFields } : v) };
        if (!variant || product.variants?.length === 1) product = { ...product, ...priceFields, ...(after ? { compareAtPrice: mrp } : {}) };
        working.set(productId, product);
        if (after) {
          const lineTotal = paise(after.unitCost) * after.quantity; total += lineTotal;
          lines.push({ productId, productNumber: product.productNumber ?? null, barcode: variant?.barcode || product.barcode || '', sku,
            name: product.name, quantity: after.quantity, unitCost: after.unitCost, salePrice: selling, mrp, stockValue: lineTotal / 100 });
        }
      }
      const settled = paise(purchase.total) - paise(purchase.payable);
      if (total < settled) reject(`The new total is below the ₹${(settled / 100).toFixed(2)} already paid or credited to the supplier.`);
      for (const r of productRefs) {
        const full = working.get(r.id)!;
        writeCosts(db, tx, r.id, extractCosts(full));
        tx.update(r, { ...stripCosts(full), ...deleteCostFields(), updatedAt: FieldValue.serverTimestamp() });
      }
      movements.forEach((m, i) => {
        const movementId = `${input.purchaseId}_edit_${hash(input.requestId).slice(0, 16)}_${i}`;
        tx.create(db.collection('stockMovements').doc(movementId), { movementId, ...m, reason: 'purchase_edit', source: 'admin',
          supplierId: purchase.supplierId, purchaseId: input.purchaseId, createdAt: FieldValue.serverTimestamp() });
      });
      for (const line of lines) tx.set(db.collection('erp_productCosts').doc(hash(`${line.productId}:${line.sku}`)),
        { productId: line.productId, sku: line.sku, unitCost: line.unitCost, updatedAt: FieldValue.serverTimestamp() });
      tx.update(ref, { lines, total: total / 100, payable: (total - settled) / 100, editedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      for (const order of linkedOrders.docs) tx.update(order.ref, { lines: lines.map(l => ({ productId: l.productId, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost,
        salePrice: l.salePrice, mrp: l.mrp })), total: total / 100, payable: (total - settled) / 100, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection('erp_auditLog').doc(hash(`purchase_update:${input.requestId}`)), { actor: actor(res), target: `erp_purchases/${input.purchaseId}`,
        action: 'purchase_edited', before: { lines: oldLines, total: purchase.total, payable: purchase.payable }, after: { lines, total: total / 100 },
        createdAt: FieldValue.serverTimestamp() });
      return { purchaseId: input.purchaseId, total: total / 100, payable: (total - settled) / 100, stockChanges: movements.length };
    }));
  } catch (e) { fail(res, e); }
});

adminEditsRouter.post('/purchase-orders/update', async (req, res) => {
  if (!managerOnly(res)) return;
  const parsed = z.object({ requestId, orderId: z.string().regex(/^PO-[a-f0-9]{24}$/), lines: z.array(purchaseLineSchema).min(1).max(MAX_PURCHASE_LINES) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0]?.message || 'Check the purchase order lines.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    res.json(await idempotent(db, 'purchase_order_update', input.requestId, input, async tx => {
      const ref = db.collection('erp_purchaseOrders').doc(input.orderId), snap = await tx.get(ref);
      if (!snap.exists) reject('Purchase order not found.', 404);
      if (snap.data()?.status !== 'ordered') reject('This order is already received. Edit its stock receipt instead.', 409);
      const total = input.lines.reduce((sum, l) => sum + paise(l.unitCost) * l.quantity, 0) / 100;
      tx.update(ref, { lines: input.lines, total, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection('erp_auditLog').doc(hash(`purchase_order_update:${input.requestId}`)), { actor: actor(res),
        target: `erp_purchaseOrders/${input.orderId}`, action: 'purchase_order_edited', before: { lines: snap.data()?.lines, total: snap.data()?.total },
        after: { lines: input.lines, total }, createdAt: FieldValue.serverTimestamp() });
      return { orderId: input.orderId, total };
    }));
  } catch (e) { fail(res, e); }
});
