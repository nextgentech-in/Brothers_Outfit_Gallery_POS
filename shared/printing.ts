export const barcodeFormats = {
  'thermal-50x25': { label: 'Thermal roll · 50 × 25 mm', width: 50, height: 25, perPage: 1 },
  'thermal-50x38': { label: 'True-Ally labels · 50 × 38 mm (shop default)', width: 50, height: 38, perPage: 1 },
  'thermal-38x25': { label: 'Thermal roll · 38 × 25 mm', width: 38, height: 25, perPage: 1 },
  'thermal-38x60': { label: 'Clothing tag · 38 × 60 mm', width: 38, height: 60, perPage: 1 },
  'thermal-100x150': { label: 'Thermal label · 100 × 150 mm', width: 100, height: 150, perPage: 1 },
  'thermal-4x6': { label: 'SEZNIK Shakti · 4 × 6 in (101.6 × 152.4 mm)', width: 101.6, height: 152.4, perPage: 1 },
  'a4-18': { label: 'A4 · 18 labels (63.5 × 46.6 mm)', width: 63.5, height: 46.6, perPage: 18 },
  'a4-24': { label: 'A4 · 24 labels (64 × 34 mm)', width: 64, height: 34, perPage: 24 },
  'a4-40': { label: 'A4 · 40 labels (39 × 35 mm)', width: 39, height: 35, perPage: 40 }
} as const;
export type LabelFormat = keyof typeof barcodeFormats;
export const receiptFormats = {
  '4x6': 'SEZNIK Shakti · 4 × 6 in',
  '100x150': 'Thermal label · 100 × 150 mm',
  '80': 'Receipt roll · 80 mm',
  '58': 'Receipt roll · 58 mm',
  'a5': 'A5 paper',
  'a4': 'A4 paper'
} as const;
export type ReceiptFormat = keyof typeof receiptFormats;
export const deliveryFormats = {
  '4x6': 'SEZNIK Shakti · 4 × 6 in',
  '100x150': 'Thermal label · 100 × 150 mm',
  'a5': 'A5 paper',
  'a4': 'A4 paper'
} as const;
export type DeliveryFormat = keyof typeof deliveryFormats;

export function labelPageGroups<T>(labels: T[], format: LabelFormat): T[][] {
  const perPage = barcodeFormats[format].perPage;
  return Array.from({ length: Math.ceil(labels.length / perPage) }, (_, index) => labels.slice(index * perPage, (index + 1) * perPage));
}

type ShippingAddress = {
  fullName?: string; name?: string; phone?: string; addressLine?: string; addressLine1?: string;
  addressLine2?: string; line1?: string; line2?: string; address?: string; landmark?: string;
  city?: string; state?: string; pincode?: string; postalCode?: string; country?: string;
};
export type DeliveryOrder = {
  id: string; channel?: string; status?: string; customerName?: string; customerPhone?: string;
  shippingAddress?: ShippingAddress; waybill?: string; trackingNumber?: string; courier?: string;
  paymentMethod?: string; paymentStatus?: string; totalAmount?: number; codAmount?: number;
  items?: { name?: string; quantity?: number; size?: string; color?: string }[];
};
export function deliveryDetails(order: DeliveryOrder) {
  const address = order.shippingAddress || {};
  const street = address.addressLine || address.addressLine1 || address.line1 || address.address || '';
  const city = [address.city, address.state, address.pincode || address.postalCode].filter(Boolean).join(' · ');
  const lines = [street, address.addressLine2 || address.line2, address.landmark, city, address.country].filter((value): value is string => Boolean(value));
  const payment = String(order.paymentMethod || '').toLowerCase().replace(/[\s_-]+/g, '');
  const paid = ['paid', 'completed', 'success'].includes(String(order.paymentStatus || '').toLowerCase());
  const cod = ['cod', 'cashondelivery'].includes(payment) && !paid;
  const amount = Number(order.codAmount ?? order.totalAmount ?? 0);
  const waybill = order.waybill || order.trackingNumber || '';
  return {
    name: address.fullName || address.name || order.customerName || '',
    phone: address.phone || order.customerPhone || '', lines, waybill,
    paymentLabel: cod ? 'CASH ON DELIVERY' : paid ? 'PREPAID' : 'PAYMENT: ' + (order.paymentMethod || 'NOT RECORDED').toUpperCase(),
    collect: cod && Number.isFinite(amount) ? Math.max(0, amount) : 0,
    barcode: waybill || order.id,
    barcodeCaption: waybill ? 'AWB / WAYBILL' : 'ORDER REFERENCE',
    complete: Boolean((address.fullName || address.name || order.customerName) && street && address.city && (address.pincode || address.postalCode))
  };
}
