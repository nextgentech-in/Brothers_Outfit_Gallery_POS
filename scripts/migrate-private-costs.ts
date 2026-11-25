// Moves purchase/cost prices out of the publicly readable `products` collection into the
// server-only `erp_productCostPrices` collection.
//
//   npm run migrate:private-costs              -> dry run, changes nothing
//   npm run migrate:private-costs -- --apply   -> moves costs (saves a private snapshot first)
//
// Safe to run again: products without public cost fields are skipped. Each product is moved in its
// own transaction, so live sales and website checkouts continue normally while it runs.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { firebase } from '../server/firebase.js';
import { root } from '../server/config.js';
import { COST_FIELDS, combineCosts, costRef, deleteCostFields, extractCosts, parseCostRecord, stripCosts, writeCosts } from '../server/productCosts.js';

const apply = process.argv.includes('--apply');
const hasPublicCost = (data: Record<string, unknown>) =>
  COST_FIELDS.some(field => field in data) ||
  (Array.isArray(data.variants) && data.variants.some(v => v && typeof v === 'object' && COST_FIELDS.some(field => field in v)));
const publicCostFields = (data: Record<string, unknown>) => ({
  product: Object.fromEntries(COST_FIELDS.filter(field => field in data).map(field => [field, data[field]])),
  variants: (Array.isArray(data.variants) ? data.variants : []).map((v: Record<string, unknown>) =>
    ({ sku: v?.sku ?? null, ...Object.fromEntries(COST_FIELDS.filter(field => v && field in v).map(field => [field, v[field]])) }))
});

const db = firebase().db;
const products = await db.collection('products').get();
const pending = products.docs.filter(doc => hasPublicCost(doc.data()));
console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${products.size} products · ${pending.length} expose cost prices publicly`);
if (!apply) {
  console.log('No changes made. Export an owner backup, then re-run with --apply to move them.');
  process.exit(0);
}

// Private local snapshot of the original public values (artifacts/ is excluded from Git).
const dir = path.join(root, 'artifacts');
mkdirSync(dir, { recursive: true });
const snapshotFile = path.join(dir, `cost-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(snapshotFile, JSON.stringify(pending.map(doc => ({ id: doc.id, ...publicCostFields(doc.data()) })), null, 2), { mode: 0o600 });
console.log(`Saved original cost fields to ${snapshotFile}`);

let moved = 0, skipped = 0;
for (const doc of pending) {
  await db.runTransaction(async tx => {
    const ref = db.collection('products').doc(doc.id);
    const [product, saved] = await tx.getAll(ref, costRef(db, doc.id));
    const data = product.data();
    if (!data || !hasPublicCost(data)) { skipped++; return; }
    // Existing private values win over legacy public ones.
    const record = combineCosts(extractCosts(data), parseCostRecord(saved.data()) || { costPrice: null, variants: [] });
    writeCosts(db, tx, doc.id, record);
    tx.update(ref, { ...deleteCostFields(), ...(Array.isArray(data.variants) ? { variants: stripCosts({ variants: data.variants }).variants } : {}) });
    moved++;
  });
}
const left = (await db.collection('products').get()).docs.filter(doc => hasPublicCost(doc.data())).length;
console.log(`Moved ${moved} · skipped ${skipped} · products still exposing costs: ${left}`);
process.exit(left === 0 ? 0 : 1);
