type Stamp = { _seconds?: number; seconds?: number };
type Line = { name?: string; sku?: string; quantity?: number; price?: number; discount?: number; discountPercent?: number; tax?: number; amount?: number };
type Invoice = {
  id: string; orderId?: string; customerName?: string; customerPhone?: string; channel?: string;
  total?: number; creditDueDate?: string; creditAmount?: number; payments?: { method: string; amount: number }[];
  change?: number; exchangeCreditUsed?: number; lines?: Line[]; paymentMethod?: string;
  subtotal?: number; discount?: number; tax?: number; createdAt?: Stamp; issuedAt?: Stamp;
};

const ascii = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
const money = (value = 0) => 'INR ' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ink = '0.12 0.14 0.16', muted = '0.36 0.39 0.43', gold = '0.54 0.35 0.09';
const paperHeight = 842, left = 35, right = 560, bottom = 801;

function wrap(value: unknown, max: number) {
  const rows: string[] = [];
  let text = ascii(value).trim();
  while (text.length > max) {
    const space = text.lastIndexOf(' ', max);
    const split = space > 0 ? space : max;
    rows.push(text.slice(0, split));
    text = text.slice(split).trimStart();
  }
  rows.push(text);
  return rows;
}

export function invoicePdf(invoice: Invoice): Buffer {
  const pages: string[][] = [[]];
  let page = pages[0];
  let y = 0;
  const text = (value: unknown, x: number, top: number, size = 10, bold = false, color = ink) => {
    page.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${paperHeight - top} Tm (${escape(ascii(value))}) Tj ET`);
  };
  const fill = (x: number, top: number, width: number, height: number, color: string) =>
    page.push(`${color} rg ${x} ${paperHeight - top - height} ${width} ${height} re f`);
  const rule = (top: number, start = left, end = right) =>
    page.push(`0.79 0.81 0.83 RG 0.65 w ${start} ${paperHeight - top} m ${end} ${paperHeight - top} l S`);
  const items = invoice.lines || [];
  const subtotal = invoice.subtotal ?? items.reduce((sum, row) => sum + (row.quantity || 0) * (row.price || 0), 0);
  const discount = invoice.discount ?? Math.max(0, subtotal - (invoice.total || 0));
  const hasTax = Number(invoice.tax) > 0 || items.some(row => Number(row.tax) > 0);
  const credit = invoice.paymentMethod === 'credit' || Number(invoice.creditAmount) > 0;
  const stamp = invoice.issuedAt ?? invoice.createdAt;
  const seconds = stamp?.seconds ?? stamp?._seconds;
  const date = seconds ? new Date(seconds * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '-';
  const columns = hasTax ? [249, 279, 352, 424, 492] : [295, 329, 410, 492];

  function brand() {
    // Vector mark uses the same outline and lettering as the POS preview.
    page.push(`q 0.72 0.54 0.18 RG 1.5 w 36 797 m 47 797 l 60 797 60 785 47 785 c 36 785 l h S
      36 781 m 47 781 l 60 781 60 769 47 769 c 36 769 l h S Q`);
    text("BROTHER'S", 65, 57, 13);
    text('O U T F I T   G A L L E R Y', 65, 72, 7, false, muted);
    text('Brothers Outfit Gallery', 305, 48, 13, true);
    text('FF-57, Pratham Square, Sahakari Jin Road', 305, 65, 9, false, muted);
    text('Himatnagar, Gujarat 383001', 305, 77, 9, false, muted);
    text('Phone: +91 84602 33020', 305, 89, 9, false, muted);
    text('brothersoutfitgallery@gmail.com', 305, 101, 9, false, muted);
    rule(117);
  }
  function tableHeader() {
    fill(left, y, right - left, 24, '0.96 0.95 0.93');
    text('ITEM / SKU', left + 7, y + 15, 9, true);
    const labels = hasTax ? ['QTY', 'MRP', 'DISCOUNT', 'GST', 'TOTAL'] : ['QTY', 'MRP', 'DISCOUNT', 'TOTAL'];
    labels.forEach((value, index) => text(value, columns[index], y + 15, 9, true));
    y += 24;
    rule(y);
  }
  function nextPage(withItems: boolean) {
    page = [];
    pages.push(page);
    text('Brothers Outfit Gallery', left, 44, 13, true);
    text(`Receipt ${invoice.id} (continued)`, left, 61, 9, false, muted);
    y = 75;
    if (withItems) tableHeader();
  }

  brand();
  text('RETAIL SALES RECEIPT', left, 142, 9, true, gold);
  text('Thank you for shopping', left, 164, 19, true);
  fill(458, 139, 102, 22, credit ? '0.99 0.95 0.87' : '0.91 0.96 0.93');
  text(credit ? 'PAYMENT DUE' : 'PAID', 474, 153, 9, true, credit ? gold : '0.14 0.40 0.25');
  const customer = wrap(invoice.customerName || 'Walk-in', 42).slice(0, 3);
  const receipt = wrap(invoice.id, 42).slice(0, 3);
  const customerTop = 220 + Math.max(0, receipt.length - 1) * 12;
  y = customerTop + 37 + Math.max(0, customer.length - 1) * 12 + (invoice.customerPhone ? 12 : 0);
  fill(left, 179, right - left, y - 179 - 9, '0.96 0.95 0.92');
  text('RECEIPT NUMBER', left + 12, 197, 8, false, muted);
  receipt.forEach((line, i) => text(line, left + 12, 211 + i * 12, 10, true));
  text('DATE', 305, 197, 8, false, muted); text(date, 305, 211, 10, true);
  text('CUSTOMER', left + 12, customerTop + 5, 8, false, muted);
  customer.forEach((line, i) => text(line, left + 12, customerTop + 19 + i * 12, 10, true));
  if (invoice.customerPhone) text(invoice.customerPhone, left + 12, customerTop + 19 + customer.length * 12, 9, false, muted);
  text('PAYMENT', 305, customerTop + 5, 8, false, muted);
  text(invoice.paymentMethod?.toUpperCase() || '-', 305, customerTop + 19, 10, true);
  tableHeader();

  for (const row of items) {
    const name = wrap(row.name || row.sku || 'Item', hasTax ? 34 : 42);
    const sku = row.sku ? wrap(row.sku, hasTax ? 41 : 49) : [];
    const height = Math.max(35, 13 + 12 * (name.length + sku.length));
    if (y + height > bottom) nextPage(true);
    name.forEach((line, i) => text(line, left + 7, y + 14 + i * 12, 10, true));
    sku.forEach((line, i) => text(line, left + 7, y + 14 + (name.length + i) * 12, 9, false, muted));
    const total = row.amount ?? (row.price || 0) * (row.quantity || 0) - (row.discount || 0) + (row.tax || 0);
    const values = [row.quantity ?? 0, money(row.price), money(row.discount), ...(hasTax ? [money(row.tax)] : []), money(total)];
    values.forEach((value, i) => text(value, columns[i], y + 14, 8));
    if (Number(row.discountPercent) > 0) text(`${row.discountPercent}% off`, columns[2], y + 26, 8, false, muted);
    y += height;
    rule(y);
  }

  const details = [
    ...(Number(invoice.exchangeCreditUsed) > 0 ? [`Exchange credit applied: ${money(invoice.exchangeCreditUsed)}`] : []),
    ...(invoice.payments || []).map(payment => `${payment.method.toUpperCase()}: ${money(payment.amount)}`),
    ...(Number(invoice.change) > 0 ? [`Change: ${money(invoice.change)}`] : []),
    ...(credit ? [`Repayment due: ${invoice.creditDueDate || 'Not recorded'}`] : [])
  ];
  const totals = [['MRP total', money(subtotal)], ...(discount > 0 ? [['Discount', '- ' + money(discount)]] : []),
    ...(Number(invoice.tax) > 0 ? [['GST', money(invoice.tax)]] : [])];
  if (y + 121 + 15 * (totals.length + details.length) > bottom) nextPage(false);
  y += 22;
  text(`${items.reduce((sum, row) => sum + (row.quantity || 0), 0)} item(s)${invoice.channel ? ' - ' + invoice.channel : ''}`, left, y, 9, false, muted);
  for (const [label, value] of totals) { text(label, 345, y, 10, false, muted); text(value, 471, y, 10, true); y += 16; }
  rule(y - 5, 345);
  text('Total', 345, y + 12, 14, true); text(money(invoice.total), 457, y + 12, 13, true);
  y += 32;
  for (const detail of details) { text(detail, left, y, 9, false, muted); y += 15; }
  rule(y + 4);
  text('Thank you for visiting.', left, y + 24, 12, true);
  text('Keep this receipt for your records. For assistance, contact +91 84602 33020.', left, y + 40, 9, false, muted);
  text('Sales receipt - GST tax invoice not issued', left, y + 54, 8, false, muted);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  ];
  pages.forEach((commands, index) => {
    const stream = commands.join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
