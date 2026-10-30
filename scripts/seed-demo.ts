import { config } from '../server/config.js';
import { firebase } from '../server/firebase.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !config.projectId?.startsWith('demo-') || config.production) {
  console.error('Demo data is emulator-only. Set both emulator hosts and a demo- project ID. Nothing was written.');
  process.exit(1);
}
const { db } = firebase();
await db.runTransaction(async tx => {
  const ref = db.collection('products').doc('demo-shirt');
  const existing = await tx.get(ref);
  if (existing.exists) return;
  tx.create(ref, { name: 'Demo Oxford Shirt', slug: 'demo-oxford-shirt', sku: 'DEMO-OX', active: true, inStock: true,
    salePrice: 1299, price: 1299, mrp: 1799, stock: 5, quantity: 5, images: [],
    variants: [{ id: 'demo-m-sage', sku: 'DEMO-OX-SAGE-M', size: 'M', color: 'Sage', stock: 5, quantity: 5, price: 1299 }] });
});
console.log('Emulator-only demo product seeded. No user or owner account was created.');
