export type PaymentPart = { method: 'cash' | 'upi' | 'card' | 'credit'; amount: number };
export function paymentBreakdown(total: number, method: string, parts?: PaymentPart[], tendered?: number) {
  const paise = (n: number) => Math.round(n * 100);
  const payments = method === 'split' ? parts || [] : [{ method: method as PaymentPart['method'], amount: total }];
  if (!payments.length || payments.some(p => !['cash','upi','card','credit'].includes(p.method) || !Number.isFinite(p.amount) || p.amount < 0 || Math.abs(p.amount * 100 - paise(p.amount)) > .00001) || new Set(payments.map(p => p.method)).size !== payments.length || payments.reduce((sum,p) => sum + paise(p.amount),0) !== paise(total)) throw new Error('Payment amounts must add up exactly to the bill total.');
  const cash = payments.find(p => p.method === 'cash')?.amount || 0;
  if (tendered !== undefined && (!Number.isFinite(tendered) || paise(tendered) < paise(cash))) throw new Error('Cash received must cover the cash payment.');
  return { payments, creditAmount: payments.find(p => p.method === 'credit')?.amount || 0, cashTendered: tendered ?? cash, change: (paise(tendered ?? cash) - paise(cash)) / 100 };
}
