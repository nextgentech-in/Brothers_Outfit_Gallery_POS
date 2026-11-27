// Puts every product's colours in CAPITALS so the POS and website never see "Black" and "BLACK"
// as two colours. Changes ONLY: variant `color`, the `colors` list, `primaryColor` and image
// `color` tags. Stock, quantities, product names, SKUs, barcodes and prices are not changed.
//
//   npm run migrate:color-caps              -> dry run, lists what would change, writes nothing
//   npm run migrate:color-caps -- --apply   -> applies (saves a private snapshot of old values first)
//
// Safe to run again. Each product is re-read inside its own transaction, so stock sold while the
// script runs is kept (only the colour text inside each variant is replaced).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { firebase } from '../server/firebase.js';
import { root } from '../server/config.js';
import { capitalColorPatch } from '../shared/colors.js';

const apply = process.argv.includes('--apply');
const db = firebase().db;
const products = await db.collection('products').get();
const pending = products.docs.flatMap(doc => { const patch = capitalColorPatch(doc.data()); return patch ? [{ doc, patch }] : []; });
console.log(`${apply ? 'APPLY' : 'DRY RUN'} · ${products.size} products · ${pending.length} have colours not in CAPITALS`);
for (const { doc, patch } of pending.slice(0, 50)) {
  const data = doc.data();
  const before = [...new Set([...(data.variants || []).map((v: any) => v?.color), ...(data.colors || []).map((c: any) => c?.name ?? c)].filter(Boolean))];
  console.log(`  ${doc.id} · ${data.name || ''} · ${before.join(', ')} · fields: ${Object.keys(patch).join(', ')}`);
}
if (pending.length > 50) console.log(`  …and ${pending.length - 50} more`);
if (!apply) { console.log('No changes made. Export an owner backup, then re-run with --apply.'); process.exit(0); }

const dir = path.join(root, 'artifacts');
mkdirSync(dir, { recursive: true });
const snapshotFile = path.join(dir, `color-caps-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(snapshotFile, JSON.stringify(pending.map(({ doc }) => {
  const d = doc.data();
  return { id: doc.id, primaryColor: d.primaryColor ?? null, colors: d.colors ?? null,
    variantColors: (d.variants || []).map((v: any) => ({ sku: v?.sku ?? null, color: v?.color ?? null })),
    imageColors: (d.images || []).map((i: any) => typeof i === 'string' ? null : { url: i?.url ?? null, color: i?.color ?? null }) };
}), null, 2), { mode: 0o600 });
console.log(`Saved original colours to ${snapshotFile}`);

let changed = 0;
for (const { doc } of pending) {
  await db.runTransaction(async tx => {
    const ref = db.collection('products').doc(doc.id);
    const fresh = await tx.get(ref);
    const patch = fresh.exists ? capitalColorPatch(fresh.data()!) : null;
    if (!patch) return;
    tx.update(ref, patch);
    changed++;
  });
}
const left = (await db.collection('products').get()).docs.filter(doc => capitalColorPatch(doc.data())).length;
console.log(`Updated ${changed} products · still not in CAPITALS: ${left}`);
process.exit(left === 0 ? 0 : 1);
