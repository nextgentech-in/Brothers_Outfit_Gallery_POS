type Invoice = { id: string; orderId?: string; customerName?: string; total?: number;
  lines?: { name?: string; sku?: string; quantity?: number; price?: number }[]; paymentMethod?: string };
const ascii = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').slice(0, 100);
const escaped = (value: unknown) => ascii(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
const amount = (value: unknown) => `INR ${Number(value || 0).toFixed(2)}`;

// Minimal single-page PDF for receipt delivery. GST tax-invoice issuance is gated
// until shop GSTIN and per-item HSN/tax rules are configured and verified.
export function invoicePdf(invoice: Invoice): Buffer {
  const lines = [
    'BROTHERS OUTFIT GALLERY',
    'FF-57, Pratham Square, Sahakari Jin Road',
    'Himatnagar, Gujarat 383001 | +91 84602 33020',
    'brothersoutfitgallery@gmail.com',
    '',
    'SALES RECEIPT',
    `Receipt: ${ascii(invoice.id)}`,
    `Order: ${ascii(invoice.orderId)}`,
    `Customer: ${ascii(invoice.customerName || 'Walk-in')}`,
    '',
    'Item                                                    Qty       Rate',
    '---------------------------------------------------------------',
    ...(invoice.lines || []).slice(0, 25).map(item => `${ascii(item.name || item.sku).slice(0, 43).padEnd(48)} ${String(item.quantity || 0).padStart(3)}   ${amount(item.price)}`),
    '---------------------------------------------------------------',
    `TOTAL: ${amount(invoice.total)}`,
    `Payment: ${ascii(invoice.paymentMethod || '')}`,
    '',
    'Thank you for shopping with Brothers Outfit Gallery.'
  ];
  const text = ['BT', '/F1 10 Tf', '50 790 Td', '14 TL', ...lines.map((line, index) => `${index ? 'T* ' : ''}(${escaped(line)}) Tj`), 'ET'].join('\n');
  const stream = Buffer.from(text, 'ascii');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${stream.length} >>\nstream\n${text}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
