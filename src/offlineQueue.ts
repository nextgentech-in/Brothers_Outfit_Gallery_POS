export type QueuedSale = {
  requestId: string;
  lines: { productId: string; sku: string; quantity: number }[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  whatsappOptIn?: boolean;
  discount: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'credit';
  queuedAt: string;
  state: 'pending' | 'review';
  error?: string;
};
const DB_NAME = 'brothers-pos-offline';
const STORE = 'sales';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'requestId' });
      if (!request.result.objectStoreNames.contains('catalog')) request.result.createObjectStore('catalog');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function request<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const action = operation(transaction.objectStore(STORE));
    let result: T;
    action.onsuccess = () => { result = action.result; };
    action.onerror = () => reject(action.error);
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
export const queueSale = (sale: QueuedSale) => request('readwrite', store => store.put(sale));
export const queuedSales = () => request<QueuedSale[]>('readonly', store => store.getAll());
export const removeSale = (requestId: string) => request('readwrite', store => store.delete(requestId));
export async function cacheCatalog<T>(products: T[]) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('catalog', 'readwrite');
    transaction.objectStore('catalog').put(products, 'latest');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
export async function cachedCatalog<T>(): Promise<T[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('catalog', 'readonly');
    const action = transaction.objectStore('catalog').get('latest');
    action.onsuccess = () => { database.close(); resolve(action.result || []); };
    action.onerror = () => { database.close(); reject(action.error); };
  });
}
export async function syncQueuedSales(send: (sale: QueuedSale) => Promise<void>) {
  const items = await queuedSales();
  const results = { sent: 0, review: 0, pending: 0 };
  for (const sale of items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
    if (sale.state === 'review') { results.review++; continue; }
    try { await send(sale); await removeSale(sale.requestId); results.sent++; }
    catch (error) {
      if ((error as { status?: number }).status === 409) {
        await queueSale({ ...sale, state: 'review', error: 'Stock or identity conflict. Review before retrying.' });
        results.review++;
      } else results.pending++;
    }
  }
  return results;
}
