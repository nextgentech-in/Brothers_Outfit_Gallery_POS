import { createHash } from 'node:crypto';
import { Router } from 'express';
import { FieldValue, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { idempotent } from './transactions.js';
import { changeStock } from './commerce.js';
import { purchaseSchema, type PurchaseInput } from '../shared/purchases.js';
import { readProductNumberCounter, writeProductNumberCounter, formatBarcode } from './productNumbering.js';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cash = (n: number) => Math.round(n * 100);
const failure = (res: any, e: any) => res.status(e.status || 503).json({ error: e.status ? e.message : 'Purchase result is unconfirmed. Retry with the same reference.' });
const reject = (message: string, status = 422): never => { throw Object.assign(new Error(message), { status }); };
export const purchasesRouter = Router();
async function receive(db: Firestore, tx: Transaction, input: PurchaseInput) {
  const purchaseId = `PUR-${hash(input.requestId).slice(0,24)}`;
  const supplier = await tx.get(db.collection('erp_suppliers').doc(input.supplierId));
  if (!supplier.exists || supplier.data()?.active === false) reject('Supplier not found.', 404);
  const invoiceKey = db.collection('erp_supplierInvoiceKeys').doc(hash(`${input.supplierId}:${input.supplierInvoice.toLowerCase()}`));
  if ((await tx.get(invoiceKey)).exists) reject('This supplier invoice has already been received.', 409);
  const catalog = await tx.get(db.collection('products'));
  const products = new Map<string, DocumentData>(catalog.docs.map(doc => [doc.id, doc.data()]));
  const codes = new Set<string>();
  for (const product of products.values()) for (const code of [product.sku, product.barcode, product.posBarcode, ...(product.variants || []).flatMap((v: any) => [v.sku,v.barcode,v.posBarcode])]) if (code) codes.add(String(code).toLowerCase());
  const hasNewItems = input.lines.some(l => l.newItem);
  const currentCounter = hasNewItems ? await readProductNumberCounter(db, tx) : 0;
  let nextProductNumber = currentCounter;

  const created = new Set<string>(), touched = new Set<string>(), mappings: { sku: string; productId: string }[] = [];
  const lines: DocumentData[] = [], movements: DocumentData[] = [];
  let total = 0;
  for (const [index, line] of input.lines.entries()) {
    let productId = line.productId || `BOG-PUR-${hash(`${input.requestId}:${index}`).slice(0,24)}`, sku = line.sku;
    if (line.newItem) {
      nextProductNumber += 1;
      const productNumber = nextProductNumber;
      const barcode = formatBarcode(productNumber, 1);
      const variantSku = `${sku}-V1`;
      if (codes.has(sku.toLowerCase()) || codes.has(variantSku.toLowerCase())) reject('New item SKU already exists. Select the existing item.', 409);
      codes.add(sku.toLowerCase()); codes.add(variantSku.toLowerCase()); codes.add(barcode.toLowerCase());
      const slug = `purchase-${hash(`${input.requestId}:${index}`).slice(0,24)}`;
      products.set(productId, { ...line.newItem, gstEnabled: line.newItem.gstEnabled === true, gstPercent: line.newItem.gstEnabled ? Number(line.newItem.gstPercent || 0) : 0, productNumber, nextVariantSequence: 2, sku, slug, barcode, price: line.salePrice, salePrice: line.salePrice, mrp: line.mrp,
        costPrice: line.unitCost, cost_price:line.unitCost, purchasePrice:line.unitCost, purchase_price:line.unitCost, webProductId:productId, categoryId:line.newItem.category, categoryKey:line.newItem.category.toLowerCase().replace(/[^a-z0-9]+/g,'-'), primaryColor:line.newItem.color, colors:[{name:line.newItem.color,hex:'#b88a2e'}], allSizes:[line.newItem.size], sizes:[line.newItem.size], compareAtPrice:line.mrp, stock: 0, quantity: 0, reserved: 0, active: false, isDeleted: false, images: [], integrationOrigin: 'admin-pos',
        variants: [{ id:`${productId}-v1`, variantSequence: 1, sku: variantSku, size: line.newItem.size, color: line.newItem.color, barcode, stock: 0, quantity: 0, reserved: 0, price: line.salePrice, salePrice: line.salePrice, mrp: line.mrp, costPrice: line.unitCost }],
        createdAt: FieldValue.serverTimestamp() });
      created.add(productId); mappings.push({ sku, productId }, { sku: variantSku, productId }); sku = variantSku;
    }
    const product = products.get(productId);
    if (!product || product.isDeleted) reject('Product not found.', 404);
    const variant = (product!.variants || []).find((v: any) => v.sku === sku);
    const target = variant || product!;
    const oldStock = Number(target.stock ?? target.quantity ?? 0);
    const costPrice = Math.round((cash(Number(target.costPrice ?? product!.costPrice ?? 0)) * oldStock + cash(line.unitCost) * line.quantity) / (oldStock + line.quantity)) / 100;
    const selling = line.salePrice ?? Number(target.price ?? target.salePrice ?? product!.salePrice ?? product!.price);
    const mrp = line.mrp ?? Number(target.mrp ?? product!.mrp);
    if (!(selling > 0 && mrp >= selling)) reject('Every received item needs a positive sale price no higher than its MRP.');
    const changed = changeStock(product!, sku, line.quantity).product;
    if (variant) changed.variants = changed.variants!.map(v => v.sku === sku ? { ...v, costPrice, cost_price:costPrice, purchasePrice:costPrice, purchase_price:costPrice, price: selling, salePrice: selling, mrp } : v);
    else Object.assign(changed, { costPrice, cost_price:costPrice, purchasePrice:costPrice, purchase_price:costPrice, price: selling, salePrice: selling, mrp, compareAtPrice:mrp });
    if (changed.variants?.length === 1) Object.assign(changed, { costPrice, cost_price:costPrice, purchasePrice:costPrice, purchase_price:costPrice, price: selling, salePrice: selling, mrp, compareAtPrice:mrp });
    products.set(productId, changed); touched.add(productId);
    const lineTotal = cash(line.unitCost) * line.quantity; total += lineTotal;
    lines.push({ productId, productNumber: product!.productNumber, barcode: variant?.barcode || product!.barcode || '', sku, name: product!.name, quantity: line.quantity, unitCost: line.unitCost, salePrice: selling, mrp, stockValue: lineTotal / 100 });
    movements.push({ movementId: `${purchaseId}_${index}`, productId, sku, deltaChange: line.quantity, stockAfter: oldStock + line.quantity, reason: 'purchase', source: 'admin', supplierId: input.supplierId, purchaseId, createdAt: FieldValue.serverTimestamp() });
  }
  if (cash(input.amountPaid) > total) reject('Amount paid exceeds purchase total.');
  for (const mapping of mappings) if ((await tx.get(db.collection('productSkuMappings').doc(hash(mapping.sku.toLowerCase())))).exists) reject('SKU is already registered.', 409);
  for (const productId of created) if ((await tx.get(db.collection('productSlugMappings').doc(hash(products.get(productId)!.slug)))).exists) reject('Product identity already exists.', 409);

  if (nextProductNumber > currentCounter) {
    writeProductNumberCounter(db, tx, nextProductNumber);
  }
  for (const productId of touched) {
    const data: DocumentData = { ...products.get(productId), updatedAt: FieldValue.serverTimestamp() };
    if (created.has(productId)) {
      tx.create(db.collection('products').doc(productId), data);
      tx.create(db.collection('productSlugMappings').doc(hash(data.slug)), { productId, slug: data.slug, createdAt: FieldValue.serverTimestamp() });
    } else tx.update(db.collection('products').doc(productId), data);
  }
  for (const mapping of mappings) tx.create(db.collection('productSkuMappings').doc(hash(mapping.sku.toLowerCase())), { ...mapping, normalizedSku:mapping.sku.toLowerCase(), webProductId:mapping.productId, createdAt: FieldValue.serverTimestamp() });
  for (const row of movements) tx.create(db.collection('stockMovements').doc(row.movementId), row);
  for (const line of lines) tx.set(db.collection('erp_productCosts').doc(hash(`${line.productId}:${line.sku}`)), { productId: line.productId, sku: line.sku, unitCost: line.unitCost, updatedAt: FieldValue.serverTimestamp() });
  if (input.amountPaid > 0) tx.create(db.collection('erp_supplierPayments').doc(`${purchaseId}-initial`), { supplierId: input.supplierId, purchaseId, amount: input.amountPaid, method: input.paymentMethod, note: 'Payment on receipt', createdAt: FieldValue.serverTimestamp() });
  tx.create(invoiceKey, { purchaseId, supplierId: input.supplierId, invoice: input.supplierInvoice });
  tx.create(db.collection('erp_purchases').doc(purchaseId), { supplierId: input.supplierId, supplierName: supplier.data()?.name || '', supplierInvoice: input.supplierInvoice,
    lines, total: total / 100, amountPaid: input.amountPaid, payable: (total - cash(input.amountPaid)) / 100, status: 'received', createdAt: FieldValue.serverTimestamp() });
  return { purchaseId, total: total / 100, payable: (total - cash(input.amountPaid)) / 100, createdProductIds: [...created] };
}
purchasesRouter.post('/purchases/receive', async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.issues[0].message }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    const result = await idempotent(db, 'purchase_receive_v2', input.requestId, input, async tx => {
      if (input.mode === 'receive') return receive(db, tx, input);
      if (input.amountPaid) reject('Record payment when receiving this purchase order.');
      const supplier = await tx.get(db.collection('erp_suppliers').doc(input.supplierId));
      if (!supplier.exists) reject('Supplier not found.', 404);
      const referenceKey = hash(`${input.supplierId}:${input.supplierInvoice.toLowerCase()}`);
      const orderKey = db.collection('erp_purchaseOrderKeys').doc(referenceKey);
      if ((await tx.get(orderKey)).exists || (await tx.get(db.collection('erp_supplierInvoiceKeys').doc(referenceKey))).exists)
        reject('This supplier reference already has a purchase order or receipt.', 409);
      const orderId = `PO-${hash(input.requestId).slice(0,24)}`;
      tx.create(orderKey, { orderId, supplierId: input.supplierId, supplierInvoice: input.supplierInvoice, createdAt: FieldValue.serverTimestamp() });
      tx.create(db.collection('erp_purchaseOrders').doc(orderId), { ...input, supplierName: supplier.data()?.name || '', status: 'ordered', total: input.lines.reduce((sum, l) => sum + cash(l.unitCost) * l.quantity, 0) / 100, createdAt: FieldValue.serverTimestamp() });
      return { orderId };
    }); res.status(201).json(result);
  } catch (e) { failure(res, e); }
});
purchasesRouter.get('/purchase-orders', async (_req, res) => {
  try { const docs = await firebase().db.collection('erp_purchaseOrders').orderBy('createdAt', 'desc').limit(100).get(); res.json({ items: docs.docs.map(doc => ({ id: doc.id, ...doc.data() })) }); } catch (e) { failure(res, e); }
});
purchasesRouter.post('/purchases/receive-order', async (req, res) => {
  const parsed = z.object({ requestId: z.string().min(12).max(128), orderId: z.string().regex(/^PO-[a-f0-9]{24}$/), paymentMethod: z.enum(['cash','upi','card']).default('cash'), amountPaid: z.number().finite().min(0).max(10000000).refine(n=>Math.abs(n*100-Math.round(n*100))<.00001) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: 'Select a purchase order and amount paid.' }); return; }
  try {
    const db = firebase().db, input = parsed.data;
    const result = await idempotent(db, 'receive_purchase_order', input.requestId, input, async tx => {
      const ref = db.collection('erp_purchaseOrders').doc(input.orderId), order = await tx.get(ref);
      if (order.data()?.status !== 'ordered') reject('This order is already received or unavailable.', 409);
      const data = order.data()!;
      const result = await receive(db, tx, { requestId: input.requestId, supplierId: data.supplierId, supplierInvoice: data.supplierInvoice, lines: data.lines, amountPaid: input.amountPaid, paymentMethod: input.paymentMethod, mode: 'receive' });
      tx.update(ref, { status: 'received', purchaseId: result.purchaseId, receivedAt: FieldValue.serverTimestamp() }); return result;
    });res.status(201).json(result);
  } catch (e) { failure(res, e); }
});
