import { firebase } from '../server/firebase.js';

const { db, projectId } = firebase();
const collections = await db.listCollections();
const counts = await Promise.all(collections.map(async collection => ({
  name: collection.id,
  count: (await collection.count().get()).data().count
})));
console.log(JSON.stringify({ projectId, collections: counts.sort((a, b) => a.name.localeCompare(b.name)) }, null, 2));
const products = await db.collection('products').get();
const group = new Map<string, number>();
for (const doc of products.docs) {
  const item = doc.data();
  const key = `${String(item.integrationOrigin || 'unset')} | ${String(item.createdBy || 'unset')} | ${item.isDeleted === true ? 'deleted' : 'active'}`;
  group.set(key, (group.get(key) || 0) + 1);
}
console.log(JSON.stringify({ productOrigins: Object.fromEntries(group) }, null, 2));
const websiteActive = products.docs.filter(doc => doc.data().integrationOrigin === 'website' && doc.data().isDeleted !== true);
console.log(JSON.stringify({ websiteActive: {
  count: websiteActive.length,
  withVariants: websiteActive.filter(doc => Array.isArray(doc.data().variants) && doc.data().variants.length > 0).length,
  withSku: websiteActive.filter(doc => Boolean(doc.data().sku)).length,
  withStock: websiteActive.filter(doc => Number(doc.data().stock ?? doc.data().quantity ?? 0) > 0).length,
  explicitPreviewFlags: websiteActive.filter(doc => ['isDemo','preview','isPreview','isSample'].some(key => doc.data()[key] === true)).length
} }, null, 2));
