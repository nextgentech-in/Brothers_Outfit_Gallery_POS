export const paise = (value: unknown) => Math.round(Number(value || 0) * 100);
export function summarize(orders: any[], returns: any[], ledger: any[], refunds: any[], expenses: any[], supplierPayments: any[]) {
  const sales = orders.filter(o => ['delivered','returned','partially returned'].includes(String(o.status || '').toLowerCase()));
  const sum = (rows: any[], fn: (r: any) => number) => rows.reduce((n,r) => n + fn(r),0) / 100;
  const received = (method: string) => sum(sales, o => Array.isArray(o.payments) ? o.payments.filter((p: any) => p.method === method).reduce((n: number,p: any) => n + paise(p.amount),0) : o.paymentMethod === method ? paise(o.totalAmount) : 0);
  const repaid = (method: string) => sum(ledger.filter(l => l.kind === 'payment' && l.paymentMethod === method), l => -paise(l.creditDelta));
  const refunded = (method: string) => sum(refunds.filter(r => r.method === method), r => paise(r.amount));
  const cashExpenses = sum(expenses.filter(e => e.method === 'cash'), e => paise(e.amount));
  const cashSupplierPayments = sum(supplierPayments.filter(e => e.method === 'cash'), e => paise(e.amount));
  const grossSales = sum(sales, o => paise(o.totalAmount)), returned = sum(returns, r => paise(r.total ?? r.amount));
  return { billCount: sales.length, grossSales, returned, netSales: (paise(grossSales)-paise(returned))/100,
    cashSales: received('cash'), upiSales: received('upi'), cardSales: received('card'), creditSales: received('credit'),
    creditCashCollected: repaid('cash'), creditUpiCollected: repaid('upi'), creditCardCollected: repaid('card'),
    cashRefunds: refunded('cash'), upiRefunds: refunded('upi'), cardRefunds: refunded('card'), cashExpenses, cashSupplierPayments,
    expenses: sum(expenses,e => paise(e.amount)), cashMovement: received('cash') + repaid('cash') - refunded('cash') - cashExpenses - cashSupplierPayments };
}
