export type BillPricing = {
  quantity: number;
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discount: number;
  amount: number;
};

export const billPaise = (amount: number) => Math.round(amount * 100);
const between = (value: number, max: number) => Math.min(max, Math.max(0, value));

export function priceBillLine(
  quantity: number, mrp: number, value: number, basis: 'price' | 'percent' | 'amount'
): BillPricing {
  const unitMrp = Math.max(0, billPaise(mrp));
  const gross = quantity * unitMrp;
  const net = between(basis === 'price' ? quantity * billPaise(value)
    : basis === 'percent' ? gross - Math.round(gross * value / 100) : billPaise(value), gross);
  return {
    quantity,
    mrp: unitMrp / 100,
    salePrice: quantity ? Math.round(net / quantity) / 100 : 0,
    discountPercent: gross ? Math.round((gross - net) / gross * 10000) / 100 : 0,
    discount: (gross - net) / 100,
    amount: net / 100
  };
}

export function setBillTotal<T extends BillPricing>(lines: T[], total: number): T[] {
  const current = lines.reduce((sum, line) => sum + billPaise(line.amount), 0);
  const gross = lines.reduce((sum, line) => sum + billPaise(line.mrp) * line.quantity, 0);
  const change = between(billPaise(total), gross) - current;
  const capacity = change < 0 ? current : gross - current;
  if (!change || !capacity) return lines;
  let cumulativeCapacity = 0;
  let allocated = 0;
  return lines.map(line => {
    const amount = billPaise(line.amount);
    cumulativeCapacity += change < 0 ? amount : billPaise(line.mrp) * line.quantity - amount;
    const cumulativeAllocation = Math.round(change * cumulativeCapacity / capacity);
    const nextAmount = amount + cumulativeAllocation - allocated;
    allocated = cumulativeAllocation;
    return { ...line, ...priceBillLine(line.quantity, line.mrp, nextAmount / 100, 'amount') };
  });
}
