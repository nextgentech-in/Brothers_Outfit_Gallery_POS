import { shopDate } from './customers.js';

export type CreditEntry = {
  id: string; customerKey: string; creditDelta: number; kind?: 'credit' | 'payment' | 'return';
  dueDate?: string; note?: string; paymentMethod?: string; orderId?: string; invoiceId?: string;
  appliesTo?: string; sequence?: number; createdAt: string | null;
};
export type CreditSummary = { balance: number; given: number; received: number; adjusted: number;
  overdue: number; nextDueDate: string | null; undated: number;
  debts: { id: string; orderId?: string; remaining: number; dueDate: string }[] };
export type CreditCustomer = { customerKey: string; name: string; phone: string; dateOfBirth: string;
  creditWhatsAppOptIn: boolean; profileAvailable?: boolean; summary: CreditSummary };

export function validDueDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function displayDueDate(value: string) {
  return validDueDate(value) ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  }) : 'Not recorded';
}
export function dueDateAfter(days: number, from = shopDate()) {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function creditSummary(entries: CreditEntry[], today = shopDate()): CreditSummary {
  const debts: { id: string; orderId?: string; remaining: number; dueDate: string }[] = [];
  let given = 0, received = 0, adjusted = 0;
  // Returns target their original bill; other payments settle the oldest credit first.
  const ordered = [...entries].sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    const amount = Math.round(entry.creditDelta * 100);
    if (!Number.isSafeInteger(amount)) throw new Error('Invalid credit ledger amount.');
    if (amount > 0) { given += amount; debts.push({ id: entry.id, orderId: entry.orderId, remaining: amount, dueDate: entry.dueDate || '' }); }
    else if (amount < 0) {
      if (entry.kind === 'return') adjusted -= amount; else received -= amount;
      let rest = -amount;
      for (const debt of debts) {
        if (entry.appliesTo && debt.id !== entry.appliesTo) continue;
        const taken = Math.min(debt.remaining, rest); debt.remaining -= taken; rest -= taken;
        if (!rest) break;
      }
      if (rest) throw new Error('Credit ledger needs review: reductions exceed credit.');
    }
  }
  const open = debts.filter(debt => debt.remaining > 0);
  return { balance: open.reduce((sum, debt) => sum + debt.remaining, 0) / 100, given: given / 100,
    received: received / 100, adjusted: adjusted / 100,
    overdue: open.filter(debt => debt.dueDate && debt.dueDate < today).reduce((sum, debt) => sum + debt.remaining, 0) / 100,
    nextDueDate: open.map(debt => debt.dueDate).filter(Boolean).sort()[0] || null,
    undated: open.filter(debt => !debt.dueDate).reduce((sum, debt) => sum + debt.remaining, 0) / 100,
    debts: debts.map(debt => ({ ...debt, remaining: debt.remaining / 100 })) };
}
