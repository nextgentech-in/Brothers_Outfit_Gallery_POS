import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function idempotent<T>(db: Firestore, scope: string, requestId: string, payload: unknown,
  operation: (tx: Transaction, commandRef: DocumentReference) => Promise<T>): Promise<T> {
  const commandRef = db.collection('erp_commands').doc(hash(`${scope}:${requestId}`));
  const fingerprint = hash(JSON.stringify(payload));
  return db.runTransaction(async tx => {
    const old = await tx.get(commandRef);
    if (old.exists) {
      if (old.data()?.cancelled) throw Object.assign(new Error('This provisional bill was moved back to held bills.'), {status:409});
      if (old.data()?.fingerprint !== fingerprint) throw Object.assign(new Error('Idempotency key reused with different data.'), { status: 409 });
      return old.data()?.result as T;
    }
    const result = await operation(tx, commandRef);
    tx.create(commandRef, { scope, requestId, fingerprint, result: JSON.parse(JSON.stringify(result)), createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}
