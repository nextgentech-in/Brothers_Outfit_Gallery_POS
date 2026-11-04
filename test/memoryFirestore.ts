import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export function memoryFirestore(db: Firestore) {
  const records = new Map<string, Record<string, any>>();
  function stored(value: any): any {
    if (value === undefined) throw new Error('Firestore cannot store undefined.');
    if (value instanceof FieldValue && value.isEqual(FieldValue.serverTimestamp())) return timestamp(new Date());
    if (value instanceof Date) return timestamp(value);
    if (Array.isArray(value)) return value.map(stored);
    if (value && typeof value === 'object' && !value.toMillis) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stored(item)]));
    return value;
  }
  function timestamp(date: Date) { return { toDate: () => date, toMillis: () => date.getTime() }; }
  const snapshot = (ref: Ref) => ({ id: ref.id, ref, exists: records.has(ref.path), data: () => records.get(ref.path) });
  class Ref {
    constructor(public path: string) {}
    get id() { return this.path.split('/').at(-1)!; }
    async get() { return snapshot(this); }
    async update(data: Record<string, unknown>) { assert.ok(records.has(this.path)); records.set(this.path, { ...records.get(this.path), ...stored(data) }); }
  }
  class Query {
    constructor(public path: string, public filters: [string, string, unknown][] = [], public order?: [string, string], public count?: number) {}
    doc(id: string) { return new Ref(`${this.path}/${id}`); }
    where(field: string, operator: string, value: unknown) { return new Query(this.path, [...this.filters, [field, operator, value]], this.order, this.count); }
    orderBy(field: string, direction = 'asc') { return new Query(this.path, this.filters, [field, direction], this.count); }
    limit(count: number) { return new Query(this.path, this.filters, this.order, count); }
    async get() {
      let docs = [...records].filter(([path, data]) => path.startsWith(`${this.path}/`) && path.split('/').length === this.path.split('/').length + 1 &&
        this.filters.every(([field, op, value]) => op === 'in' ? (value as unknown[]).includes(data[field]) : data[field] === value))
        .map(([path]) => snapshot(new Ref(path)));
      if (this.order) {
        const [field, direction] = this.order;
        docs = docs.filter(doc => doc.data()?.[field] !== undefined).sort((a, b) => {
          const av = a.data()?.[field]?.toMillis?.() ?? a.data()?.[field], bv = b.data()?.[field]?.toMillis?.() ?? b.data()?.[field];
          return (av < bv ? -1 : av > bv ? 1 : 0) * (direction === 'desc' ? -1 : 1);
        });
      }
      if (this.count) docs = docs.slice(0, this.count);
      return { docs, size: docs.length, empty: !docs.length };
    }
  }
  mock.method(db, 'collection', (path: string) => new Query(path));
  let previous: Promise<unknown> = Promise.resolve();
  mock.method(db, 'runTransaction', (operation: (tx: unknown) => Promise<unknown>) => {
    const run = previous.catch(() => {}).then(async () => {
      const writes: (() => void)[] = [];
      const read = async (ref: Ref | Query) => { assert.equal(writes.length, 0, 'All Firestore reads must precede writes'); return ref.get(); };
      const result = await operation({ get: read, getAll: (...refs: Ref[]) => Promise.all(refs.map(read)),
        create: (ref: Ref, data: Record<string, unknown>) => { const value = stored(data); writes.push(() => { assert.equal(records.has(ref.path), false); records.set(ref.path, value); }); },
        update: (ref: Ref, data: Record<string, unknown>) => { const value = stored(data); writes.push(() => { assert.ok(records.has(ref.path)); records.set(ref.path, { ...records.get(ref.path), ...value }); }); },
        set: (ref: Ref, data: Record<string, unknown>, options?: { merge: boolean }) => { const value = stored(data); writes.push(() => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...value })); }
      });
      writes.forEach(write => write());
      return result;
    });
    previous = run; return run;
  });
  return { records, timestamp };
}
