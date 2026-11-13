type Invoice = { id: string; orderId?: string; customerName?: string; total?: number; creditDueDate?: string; creditAmount?: number; payments?: { method: string; amount: number }[]; change?: number; exchangeCreditUsed?: number;
  lines?: { name?: string; sku?: string; quantity?: number; price?: number; discount?: number; tax?: number; amount?: number }[]; paymentMethod?: string; subtotal?: number; discount?: number; tax?: number; createdAt?: { _seconds?: number; seconds?: number }; issuedAt?: { _seconds?: number; seconds?: number } };
const ascii = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').slice(0, 100);
const escaped = (value: unknown) => ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
const amount = (value: unknown) => `INR ${Number(value || 0).toFixed(2)}`;

// Minimal single-page PDF for receipt delivery. GST tax-invoice issuance is gated
// until shop GSTIN and per-item HSN/tax rules are configured and verified.
export function invoicePdf(invoice: Invoice): Buffer {
  const subtotal = invoice.subtotal ?? (invoice.lines || []).reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.price || 0), 0);
  const discount = invoice.discount ?? Math.max(0, subtotal - Number(invoice.total || 0));
  const showHistoricalTax = Number(invoice.tax || 0) > 0 || (invoice.lines || []).some(item => Number(item.tax || 0) > 0);
  const issued = invoice.issuedAt?._seconds || invoice.issuedAt?.seconds || invoice.createdAt?._seconds || invoice.createdAt?.seconds;
  const lines = [
    'BROTHERS OUTFIT GALLERY',
    'FF-57, Pratham Square, Sahakari Jin Road',
    'Himatnagar, Gujarat 383001',
    'Phone: +91 84602 33020',
    'brothersoutfitgallery@gmail.com',
    '====================================================================',
    (invoice.paymentMethod === 'credit' || Number(invoice.creditAmount) > 0) ? 'SALES RECEIPT                                      PAYMENT DUE' : 'SALES RECEIPT                                      PAYMENT RECEIVED',
    `Receipt: ${ascii(invoice.id)}`,
    issued ? `Date: ${new Date(issued * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : '',
    `Customer: ${ascii(invoice.customerName || 'Walk-in')}`,
    `Payment: ${ascii(invoice.paymentMethod || '')}`,
    ...(Number(invoice.exchangeCreditUsed) > 0 ? [`Exchange credit applied: ${amount(invoice.exchangeCreditUsed)}`] : []),
    ...(invoice.payments || []).map(p => `${ascii(p.method)}: ${amount(p.amount)}`),
    ...(Number(invoice.change) > 0 ? [`Change: ${amount(invoice.change)}`] : []),
    ...((invoice.paymentMethod === 'credit' || Number(invoice.creditAmount) > 0) ? [`Repayment due: ${ascii(invoice.creditDueDate || 'Not recorded')}`] : []),
    '',
    showHistoricalTax ? 'ITEM / SKU                         QTY       MRP      DISCOUNT     GST      TOTAL' : 'ITEM / SKU                         QTY       MRP      DISCOUNT      TOTAL',
    '--------------------------------------------------------------------',
    ...(invoice.lines || []).map(item => `${ascii(item.name || item.sku).slice(0, 30).padEnd(32)} ${String(item.quantity || 0).padStart(3)} ${amount(item.price).padStart(11)} ${amount(item.discount).padStart(11)} ${showHistoricalTax ? amount(item.tax).padStart(11) + ' ' : ''}${amount(item.amount ?? (Number(item.price || 0) * Number(item.quantity || 0) - Number(item.discount || 0) + Number(item.tax || 0))).padStart(11)}`),
    '--------------------------------------------------------------------',
    `Subtotal: ${amount(subtotal)}`,
    ...(discount > 0 ? [`Discount: -${amount(discount)}`] : []),
    ...(Number(invoice.tax) > 0 ? [`GST: ${amount(invoice.tax)}`] : []),
    `TOTAL: ${amount(invoice.total)}`,
    '',
    'Thank you for shopping with Brothers Outfit Gallery.',
    'Keep this receipt for your records. GST tax invoice not issued.'
  ];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 46) pages.push(lines.slice(index, index + 46));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_,i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
  ];
  pages.forEach((page,index) => {
    const text = [
      ...(index === 0 ? ['0.08 0.12 0.17 rg 0 720 595 122 re f', '0.55 0.36 0.08 rg 0 712 595 8 re f'] : []),
      'BT', '/F1 10 Tf', '14 TL',
      ...page.flatMap((line, i) => {
        const y = 790 - i * 14;
        const heading = line === 'BROTHERS OUTFIT GALLERY';
        const total = line.startsWith('TOTAL:');
        const section = line.startsWith('SALES RECEIPT') || line.startsWith('ITEM / SKU');
        const color = index === 0 && (i < 5 || heading) ? '1 1 1 rg' : total ? '0.53 0.34 0.08 rg' : section ? '0.16 0.27 0.35 rg' : '0.16 0.20 0.24 rg';
        return [color, `1 0 0 1 40 ${y} Tm`, `(${escaped(line)}) Tj`];
      }),
      'ET'
    ].join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(text, 'ascii')} >>\nstream\n${text}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
