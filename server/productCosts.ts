import { FieldValue, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore';

// Purchase/cost prices are business-private. The shared `products` collection is publicly
// readable by the website, so costs live in `erp_productCostPrices/{productId}` instead.
// Browser clients have no Firestore rule for erp_* collections, so this data is server-only.
//
// Older product documents may still carry these fields. Reads fall back to them until
// `npm run migrate:private-costs -- --apply` moves them and removes them from `products`.
export const COST_COLLECTION = 'erp_productCostPrices';
export const COST_FIELDS = ['costPrice', 'cost_price', 'purchasePrice', 'purchase_price'] as const;

export type CostRecord = { costPrice: number | null; variants: { sku: string; costPrice: number }[] };
type Source = Record<string, unknown> | null | undefined;

const finite = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};
/** First usable cost from any of the legacy public field names. */
export function legacyCost(source: Source): number | undefined {
  if (!source) return undefined;
  for (const field of COST_FIELDS) { const value = finite(source[field]); if (value !== undefined) return value; }
  return undefined;
}
export const costRef = (db: Firestore, productId: string) => db.collection(COST_COLLECTION).doc(productId);

export function parseCostRecord(data: DocumentData | undefined): CostRecord | undefined {
  if (!data) return undefined;
  const variants = Array.isArray(data.variants) ? data.variants
    .map((v: { sku?: unknown; costPrice?: unknown }) => ({ sku: String(v?.sku || ''), costPrice: finite(v?.costPrice) }))
    .filter((v): v is { sku: string; costPrice: number } => Boolean(v.sku) && v.costPrice !== undefined) : [];
  return { costPrice: finite(data.costPrice) ?? null, variants };
}
/** Builds a private record from a product-shaped object that still has cost fields. */
export function extractCosts(product: Source): CostRecord {
  const variants = Array.isArray(product?.variants) ? product!.variants as Source[] : [];
  return {
    costPrice: legacyCost(product) ?? null,
    variants: variants.flatMap(v => {
      const sku = String(v?.sku || ''); const cost = legacyCost(v);
      return sku && cost !== undefined ? [{ sku, costPrice: cost }] : [];
    })
  };
}
/** Removes every cost field from a product and its variants. Never mutates the input. */
export function stripCosts<T extends Record<string, unknown>>(product: T): T {
  const copy: Record<string, unknown> = { ...product };
  for (const field of COST_FIELDS) delete copy[field];
  if (Array.isArray(copy.variants)) copy.variants = (copy.variants as unknown[]).map(v => {
    if (!v || typeof v !== 'object') return v;
    const variant = { ...(v as Record<string, unknown>) };
    for (const field of COST_FIELDS) delete variant[field];
    return variant;
  });
  return copy as T;
}
/** Field deletes for `update()` so legacy top-level cost fields disappear from `products`. */
export const deleteCostFields = () => Object.fromEntries(COST_FIELDS.map(field => [field, FieldValue.delete()]));

/**
 * Returns a copy of the product data with `costPrice` filled in on the product and each
 * variant. Private costs win; otherwise the legacy public value is used.
 * Use only for reading/calculating. Never write the result back to `products`.
 */
export function mergeCosts<T extends DocumentData>(data: T, record: CostRecord | undefined): T {
  const bySku = new Map((record?.variants || []).map(v => [v.sku.toLowerCase(), v.costPrice]));
  const productCost = record?.costPrice ?? legacyCost(data);
  const variants = Array.isArray(data.variants) ? data.variants.map((v: DocumentData | null) => {
    if (!v || typeof v !== 'object') return v;
    const cost = bySku.get(String(v.sku || '').toLowerCase()) ?? legacyCost(v);
    return cost === undefined ? v : { ...v, costPrice: cost };
  }) : data.variants;
  return { ...data, ...(productCost === undefined ? {} : { costPrice: productCost }), ...(variants ? { variants } : {}) } as T;
}
/** Combines an existing private record with newer values (variants are matched by SKU). */
export function combineCosts(base: CostRecord | undefined, update: CostRecord): CostRecord {
  const variants = new Map((base?.variants || []).map(v => [v.sku.toLowerCase(), v]));
  for (const v of update.variants) variants.set(v.sku.toLowerCase(), v);
  return { costPrice: update.costPrice ?? base?.costPrice ?? null, variants: [...variants.values()] };
}
export async function readAllCosts(db: Firestore) {
  const docs = await db.collection(COST_COLLECTION).get();
  return new Map(docs.docs.map(doc => [doc.id, parseCostRecord(doc.data())]));
}
export async function readCostsTx(db: Firestore, tx: Transaction, productIds: string[]) {
  if (!productIds.length) return new Map<string, CostRecord | undefined>();
  const docs = await tx.getAll(...productIds.map(id => costRef(db, id)));
  return new Map(docs.map(doc => [doc.id, parseCostRecord(doc.data())]));
}
export function writeCosts(db: Firestore, tx: Transaction, productId: string, record: CostRecord) {
  tx.set(costRef(db, productId), { productId, costPrice: record.costPrice, variants: record.variants,
    updatedAt: FieldValue.serverTimestamp() });
}
