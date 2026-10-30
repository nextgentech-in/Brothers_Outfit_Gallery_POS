import { firebase } from '../server/firebase.js';

// Read only. Never emit document IDs, field values, customer records, or credentials.
function shape(value: unknown, depth = 0): unknown {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  if ('toDate' in value) return 'timestamp';
  if (Array.isArray(value)) return { array: value.length ? shape(value[0], depth + 1) : 'empty' };
  if (depth > 3) return 'object';
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item, depth + 1)]));
}
const timeout = setTimeout(() => { console.error('Inspection timed out. No writes were performed.'); process.exit(1); }, 30_000);
try {
  const { db } = firebase();
  for (const name of ['products', 'orders', 'users', 'stockMovements', 'admins', 'productSkuMappings', 'posStockEvents', 'settings']) {
    const snapshot = await db.collection(name).limit(3).get();
    const fields = Object.assign({}, ...snapshot.docs.map(doc => shape(doc.data())));
    console.log(JSON.stringify({ collection: name, sampled: snapshot.size, fields }));
  }
} catch { console.error('Read-only inspection failed. Check server credentials and connectivity.'); process.exitCode = 1; }
finally { clearTimeout(timeout); }
