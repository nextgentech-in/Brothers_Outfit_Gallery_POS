import { FieldValue, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { creditSummary, type CreditEntry } from '../shared/credit.js';

export function ledgerEntry(id: string, data: DocumentData): CreditEntry {
  const createdAt = data.createdAt?.toDate?.()?.toISOString() || (typeof data.createdAt === 'string' ? data.createdAt : null);
  return { id, customerKey: String(data.customerKey || ''), creditDelta: Number(data.creditDelta || 0),
    kind: data.kind, dueDate: data.dueDate || '', note: data.note || '', paymentMethod: data.paymentMethod || '',
    orderId: data.orderId || '', invoiceId: data.invoiceId || '', appliesTo: data.appliesTo || '', sequence: data.sequence, createdAt };
}
export async function readCreditState(db: Firestore, tx: Transaction, customerKey: string) {
  const ref = db.collection('erp_creditAccounts').doc(customerKey);
  // Every credit writer reads and updates this document to serialize simultaneous repayments/sales.
  const account = await tx.get(ref);
  const history = await tx.get(db.collection('erp_customerLedger').where('customerKey', '==', customerKey));
  const entries = history.docs.map(doc => ledgerEntry(doc.id, doc.data()));
  return { ref, revision: Number(account.data()?.revision || 0), entries, summary: creditSummary(entries), customerKey };
}
export function appendCreditEntry(db: Firestore, tx: Transaction, state: Awaited<ReturnType<typeof readCreditState>>,
  id: string, entry: Omit<CreditEntry, 'id' | 'customerKey' | 'createdAt'> & { loyaltyDelta?: number }) {
  const data = { ...entry, sequence: state.revision + 1, customerKey: state.customerKey, createdAt: FieldValue.serverTimestamp() };
  const summary = creditSummary([...state.entries, { ...entry, sequence: state.revision + 1, id, customerKey: state.customerKey, createdAt: new Date().toISOString() }]);
  tx.create(db.collection('erp_customerLedger').doc(id), data);
  tx.set(state.ref, { customerKey: state.customerKey, revision: state.revision + 1, balance: summary.balance, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return summary;
}
