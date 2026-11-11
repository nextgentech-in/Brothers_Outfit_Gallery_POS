import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';

export const SEQUENCE_COLLECTION = 'erp_sequences';
export const SEQUENCE_DOC_ID = 'productNumber';
export const BARCODE_PREFIX = 'BOG';

export function formatProductNumber(num: number): string {
  return `#${num}`;
}

/**
 * Format standard Code 128 barcode: BOG-000001-001
 * Prefix: BOG
 * Segment 1: 6-digit zero-padded product number
 * Segment 2: 3-digit zero-padded variant sequence
 */
export function formatBarcode(productNumber: number, variantSequence = 1): string {
  const pStr = String(Math.max(1, Math.floor(productNumber))).padStart(6, '0');
  const vStr = String(Math.max(1, Math.floor(variantSequence))).padStart(3, '0');
  return `${BARCODE_PREFIX}-${pStr}-${vStr}`;
}

export function parseBarcode(barcode: string): { productNumber: number; variantSequence: number } | null {
  const match = String(barcode || '').trim().toUpperCase().match(/^BOG-(\d{6})-(\d{3})$/);
  if (!match) return null;
  return {
    productNumber: parseInt(match[1], 10),
    variantSequence: parseInt(match[2], 10)
  };
}

/**
 * Read product number counter snapshot inside a Firestore transaction.
 * Must be called in the READ phase before any writes.
 */
export async function readProductNumberCounter(db: Firestore, tx: Transaction): Promise<number> {
  const counterRef = db.collection(SEQUENCE_COLLECTION).doc(SEQUENCE_DOC_ID);
  const snap = await tx.get(counterRef);
  return snap.exists ? Number(snap.data()?.lastNumber || 0) : 0;
}

/**
 * Record updated counter inside a Firestore transaction.
 * Must be called in the WRITE phase.
 */
export function writeProductNumberCounter(db: Firestore, tx: Transaction, lastNumber: number): void {
  const counterRef = db.collection(SEQUENCE_COLLECTION).doc(SEQUENCE_DOC_ID);
  tx.set(counterRef, {
    lastNumber,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * Convenience helper when no other reads follow in the transaction.
 */
export async function getNextProductNumber(db: Firestore, tx: Transaction): Promise<number> {
  const current = await readProductNumberCounter(db, tx);
  const next = current + 1;
  writeProductNumberCounter(db, tx, next);
  return next;
}
