import { receiptFormats, type ReceiptFormat } from '../shared/printing';
import { printDocument, receiptPageCss, usePrintPreference } from './printing';
import type { BillRewards } from '../shared/rewards';
import { createPortal } from 'react-dom';
import { StockCount } from './StockCount';
import { CustomerEditor, CustomerRewardsSettings } from './CustomerEditor';
import { BillHistory } from './BillHistory';
import { SupplierPayments } from './DailyOperations';
import { paymentBreakdown, type PaymentPart } from '../shared/payments';
import { stockValueRows } from '../shared/stockGst';
import { askCoinReset } from './coinReset';
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, FileDown, IndianRupee, LayoutGrid, List, MessageCircle, PackagePlus, Plus, Printer, RefreshCw, Search, ShoppingBag, Volume2 } from 'lucide-react';
import { BarcodeBatch } from './BarcodeBatch';
import { BarcodeLabel, type LabelProduct } from './BarcodeLabel';
import { ProductEditor, type ProductEditInput } from './ProductEditor';
import { ProductFormDialog, type NewProductInput } from './ProductForm';
import { StockOverview } from './StockOverview';
import { PurchaseReceive } from './PurchaseReceive';
import { AddSupplierDialog } from './AddSupplierDialog';
import { BarcodePrintModal, type PrintableItem } from './BarcodePrintModal';
import { ConfirmDialog, PurchaseEditDialog, purchasePrintItems, type EditablePurchase } from './AdminEditDialogs';
import { CustomerPhoneDialog } from './CustomerPhoneDialog';
import { CustomerWhatsAppDialog } from './CustomerWhatsAppDialog';
import { CreditDueFields } from './CreditView';
import { VyaparBilling } from './VyaparBilling';
import { dueDateAfter, validDueDate } from '../shared/credit';
import { customerDetailsError, displayBirthDate, mobileNumber, shopDate, type Customer } from '../shared/customers';
import { recoverToHeld, cacheCatalog, cachedCatalog, queueSale, queuedSales, removeSale, syncQueuedSales, holdBill, heldBills, removeHeldBill, type HeldBill, type QueuedSale } from './offlineQueue';

const websiteProductsUrl = 'https://www.brothersoutfitgallery.com/admin/products';

type Product = { id: string; name: string; sku: string; productNumber?: number; barcode?: string; price: number; mrp: number; costPrice?: number; customPrice?: number | null; onHand?: number; gstEnabled?: boolean; gstPercent?: number;
  brand?: string; design?: string; fabric?: string; category: string; subCategory?: string; shortDescription?: string; description?: string; gsl?: string; active: boolean; stock: number;
  variants: { sku: string; barcode?: string; variantSequence?: number; size?: string; color?: string; stock: number; onHand?: number; reorderThreshold?: number; price: number; mrp?: number; costPrice?: number }[] };
type Order = { id: string; status?: string; totalAmount?: number; paymentMethod?: string; createdBy?: string; createdAt?: { _seconds?: number; seconds?: number };
  customerName?: string; shippingAddress?: { fullName?: string }; items?: { name?: string; quantity?: number }[] };
type Supplier = { id: string; name: string; phone: string; email: string; gstin: string; address?: string };
type Purchase = { id: string; supplierName: string; supplierInvoice: string; total: number; amountPaid: number; payable: number; lines?: { name?: string; sku?: string; quantity?: number; unitCost?: number; salePrice?: number; mrp?: number; stockValue?: number }[]; createdAt?: { _seconds?: number; seconds?: number } };
type PurchaseOrder = { amountPaid?: number; payable?: number; supplierInvoiceDate?: string; id: string; supplierId?: string; supplierName: string; supplierInvoice: string; total: number; status: string; lines?: { name?: string; sku?: string; quantity?: number; unitCost?: number; salePrice?: number; mrp?: number }[]; createdAt?: { _seconds?: number; seconds?: number }; receivedAt?: { _seconds?: number; seconds?: number }; purchaseId?: string };
type Movement = { id: string; productId?: string; sku?: string; deltaChange?: number; reason?: string; source?: string; stockAfter?: number };
type Invoice = { rewards?: BillRewards; id: string; orderId: string; total: number; lines: { name?: string; sku?: string; quantity?: number; price?: number; discount?: number; discountPercent?: number; tax?: number; amount?: number; taxPercent?: number }[];
  exchangeCreditUsed?: number; payments?: PaymentPart[]; creditAmount?: number; cashTendered?: number; change?: number; creditDueDate?: string;
  customerName?: string; customerPhone?: string; customerDateOfBirth?: string; channel: string; paymentMethod: string; kind?: string; subtotal?: number; discount?: number; tax?: number; billUrl?: string; createdAt?: { _seconds?: number; seconds?: number }; issuedAt?: { _seconds?: number; seconds?: number } };
type SyncRecord = { id: string; event?: string; status?: string; invoiceId?: string; source?: string; retryCount?: number; error?: string; providerMessageId?: string };
type Shop = { name: string; phone: string; address: string; email: string; whatsapp: string; logo: string; whatsappReceiptReplies?: boolean };
const money = (value: number | undefined) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stockCostValue = (product: Product) => product.variants.length ? product.variants.reduce((sum,v) => sum + (v.onHand ?? v.stock) * Number(v.costPrice ?? product.costPrice ?? 0), 0) : (product.onHand ?? product.stock) * Number(product.costPrice || 0);
const retailStockValue = (product: Product) => product.variants.length
  ? product.variants.reduce((sum, variant) => sum + variant.stock * variant.price, 0)
  : product.stock * product.price;
// /products already returns available stock, with reservations removed.
const availableStockRows = (products: Product[]) => stockValueRows(products.map(product => ({
  ...product, reserved: 0, variants: product.variants.map(variant => ({ ...variant, reserved: 0 }))
})));

const isPreviewProduct = (p: Product) => {
  if ((p as Product & { demoOnly?: boolean }).demoOnly === true) return false;
  return (
    Boolean((p as any).isDemo) ||
    Boolean((p as any).preview) ||
    Boolean((p as any).isPreview) ||
    Boolean((p as any).isSample)
  );
};

export function ReceiptDialog({ invoice, shop, preview = false, onClose }: { invoice: Invoice; shop: Shop | null; preview?: boolean; onClose: () => void }) {
  const provisional = invoice.id.startsWith('LOCAL-');
  const [paper, setPaper] = usePrintPreference<ReceiptFormat>('receipt58', receiptFormats, '58');
  const sheetRef = useRef<HTMLDivElement>(null);
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState('');
  async function printBill() {
    setPrinting(true); setPrintError('');
    try { await printDocument(() => receiptPageCss(paper, sheetRef.current)); }
    catch (error) { setPrintError((error as Error).message); }
    finally { setPrinting(false); }
  }
  const subtotal = invoice.subtotal ?? invoice.lines.reduce((sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 0), 0);
  const discount = invoice.discount ?? Math.max(0, subtotal - invoice.total);
  const redeemed = invoice.rewards?.redeemed ?? 0;
  const isCredit = invoice.paymentMethod === 'credit' || Number(invoice.creditAmount) > 0;
  const balance = Number(invoice.creditAmount) > 0 ? Number(invoice.creditAmount) : invoice.paymentMethod === 'credit' ? invoice.total : 0;
  const received = preview ? 0 : Math.max(0, invoice.total - balance);
  const units = invoice.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const showHistoricalTax = Number(invoice.tax || 0) > 0 || invoice.lines.some(line => Number(line.tax || 0) > 0);
  const timestamp = invoice.issuedAt?._seconds || invoice.issuedAt?.seconds || invoice.createdAt?._seconds || invoice.createdAt?.seconds;
  const issuedAt = timestamp ? new Date(timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : preview ? 'Preview' : '';
  const phone = mobileNumber(invoice.customerPhone || '');
  const shopWhatsApp = mobileNumber(String(shop?.whatsapp || ''));
  const requestUrl = !preview && phone && shop?.whatsappReceiptReplies && shopWhatsApp
    ? `https://wa.me/${shopWhatsApp}?text=${encodeURIComponent('BILL ' + invoice.id)}` : '';
  const whatsappText = [shop?.name || 'Brothers Outfit Gallery', 'Sales receipt ' + invoice.id, ...invoice.lines.map(line => `${line.name || line.sku || 'Item'} (${line.sku || 'Item'}) × ${line.quantity || 0}: ${money(Number(line.price || 0) * Number(line.quantity || 0))}`), discount > 0 ? 'Discount: ' + money(discount) : '', 'Total: ' + money(invoice.total), invoice.billUrl ? 'Open your bill PDF: ' + invoice.billUrl : '', 'Payment: ' + invoice.paymentMethod, 'Thank you for shopping with us.'].filter(Boolean).join('\n');
  return createPortal(<div className="editor-backdrop print-backdrop" onClick={onClose}><div ref={sheetRef} className={`invoice-sheet glass receipt-${paper}`} role="dialog" aria-modal="true" aria-label={preview ? 'Bill print preview' : `Receipt ${invoice.id}`} onClick={event => event.stopPropagation()}>
    <div className="invoice-actions receipt-toolbar">
      <div className="receipt-toolbar-top">
        <div className="receipt-toolbar-title"><Printer size={18} /><div><strong>{preview ? 'Bill preview' : 'Print bill'}</strong><span>{preview ? 'Sale not completed yet' : invoice.id}</span></div></div>
        <button className="receipt-close" type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="receipt-paper-row">
        <label><span>Paper</span><select aria-label="Receipt paper" value={paper} onChange={e => setPaper(e.target.value as ReceiptFormat)}>{Object.entries(receiptFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {paper !== '58' && <button className="text-button" type="button" onClick={() => setPaper('58')}>Use shop default (58 mm)</button>}
      </div>
      <p className="print-help">In the print dialog pick the {paper === '58' || paper === '80' ? 'receipt printer' : 'matching printer'}, set <b>Margins: None</b>, <b>Scale: 100</b> and turn <b>headers and footers</b> off.</p>
      <div className="receipt-toolbar-actions">
        <div className="receipt-share">
          {!preview && !provisional && <a className="button secondary sm" href={`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`} download><FileDown size={15} />A4 PDF</a>}
          {!preview && invoice.billUrl && <a className="button secondary sm" href={invoice.billUrl} target="_blank" rel="noopener noreferrer"><Eye size={15} />Customer link</a>}
          {!preview && phone.length >= 10 && invoice.billUrl && <a className="button secondary sm" href={`sms:+${phone}?body=${encodeURIComponent('Your Brothers Outfit bill ' + invoice.id + ': ' + invoice.billUrl)}`}>SMS</a>}
          {!preview && phone.length >= 10 && invoice.billUrl && <a className="button secondary sm whatsapp-direct" href={`https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} />WhatsApp</a>}
        </div>
        <button className="button primary receipt-print" type="button" disabled={printing} onClick={() => void printBill()}><Printer size={16} />{printing ? 'Preparing bill…' : 'Print bill'}</button>
      </div>
    </div>
    {printError && <p className="error-banner no-print" role="alert">{printError}</p>}
    {!preview && phone && !invoice.billUrl && <p className="no-print" role="status">{provisional ? 'Sync this bill before sharing its PDF link.' : 'The customer PDF link is unavailable. Reopen the receipt from Orders while online.'}</p>}
    {requestUrl && <div className="no-print">
      <p>Scan with the customer’s phone and send the WhatsApp request to receive this PDF automatically.</p>
      <img width={128} height={128} alt="Scan to request this receipt on WhatsApp" src={`/api/barcode/render?format=qrcode&code=${encodeURIComponent(requestUrl)}`} />
    </div>}
    <div className="receipt-stage"><div className="receipt-paper">
    {preview && <div className="preview-ribbon">BILL PREVIEW · SALE NOT COMPLETED</div>}
    {provisional && <div className="preview-ribbon">OFFLINE BILL · PENDING SYNC</div>}
    <div className="pro-bill">
      <div className="pb-top"><span>ORIGINAL FOR RECIPIENT</span><span>{preview ? 'BILL PREVIEW' : 'SALES RECEIPT'}</span></div>
      <div className="pb-shop">
        <h2>{shop?.name || 'Brothers Outfit Gallery'}</h2>
        <p>{shop?.address || 'FF-57, Pratham Square, Himatnagar, Gujarat 383001'}</p>
        <p>Phone: {shop?.phone || '+91 84602 33020'}</p>
        {shop?.email && <p>Email: {shop.email}</p>}
      </div>
      <div className="pb-meta"><span>Bill No: {preview ? 'Draft' : invoice.id}</span><span>{issuedAt || '—'}</span></div>
      <div className="pb-billto">
        <p>BILL TO: {invoice.customerName || 'Walk-in Customer'}</p>
        {invoice.customerPhone && <p>Mobile: {invoice.customerPhone}</p>}
        {invoice.customerDateOfBirth && <p>DOB: {invoice.customerDateOfBirth}</p>}
        <p>Payment: {invoice.paymentMethod.toUpperCase()}{isCredit ? ' · CREDIT' : ''}</p>
      </div>
      <table className="pb-items">
        <thead>
          <tr><th className="pb-idx">#</th><th colSpan={3}>Items</th></tr>
          <tr className="pb-subhead"><th></th><th>Qty</th><th>Price</th><th>Amount</th></tr>
        </thead>
        <tbody>{invoice.lines.map((line, index) => {
          const amount = line.amount ?? (Number(line.price || 0) * Number(line.quantity || 0) - Number(line.discount || 0) + Number(line.tax || 0));
          return <Fragment key={`${line.sku || index}:${index}`}>
            <tr className="pb-name"><td className="pb-idx">{index + 1}</td><td colSpan={3}>{(line.name || line.sku || 'Item').toUpperCase()}
              <small>{[line.sku && `SKU: ${line.sku}`, Number(line.discount) > 0 && `Disc ${money(line.discount)}${Number(line.discountPercent) > 0 ? ` (${line.discountPercent}%)` : ''}`, showHistoricalTax && Number(line.tax) > 0 && `GST ${money(line.tax)}`].filter(Boolean).join(' · ')}</small></td></tr>
            <tr className="pb-nums"><td></td><td>{line.quantity} Pc</td><td>{money(line.price)}</td><td>{money(amount)}</td></tr>
          </Fragment>;
        })}</tbody>
      </table>
      <div className="pb-totals">
        <div className="pb-line pb-ruled"><span>Sub Total ({units} item{units === 1 ? '' : 's'})</span><span>{money(subtotal)}</span></div>
        {discount > redeemed && <div className="pb-line"><span>Discount</span><span>− {money(discount - redeemed)}</span></div>}
        {redeemed > 0 && <div className="pb-line"><span>Coin discount</span><span>− {money(redeemed)}</span></div>}
        {Number(invoice.tax) > 0 && <div className="pb-line"><span>GST</span><span>{money(invoice.tax)}</span></div>}
        {Number(invoice.exchangeCreditUsed) > 0 && <div className="pb-line"><span>Exchange credit</span><span>− {money(invoice.exchangeCreditUsed)}</span></div>}
        <div className="pb-line pb-grand"><span>Total Amount</span><span>{money(invoice.total)}</span></div>
        <div className="pb-line pb-ruled"><span>Received Amount</span><span>{money(received)}</span></div>
        {invoice.payments && invoice.payments.length > 1 && <div className="pb-line pb-small"><span>{invoice.payments.map(p => `${p.method.toUpperCase()} ${money(p.amount)}`).join(' · ')}</span></div>}
        {Number(invoice.change) > 0 && <div className="pb-line pb-small"><span>Change returned</span><span>{money(invoice.change)}</span></div>}
        <div className="pb-line pb-ruled"><span>Balance</span><span>{money(balance)}</span></div>
        {isCredit && <div className="pb-line pb-small"><span>Repayment due</span><span>{invoice.creditDueDate || 'Not recorded'}</span></div>}
      </div>
      {invoice.rewards && (invoice.rewards.earned > 0 || invoice.rewards.redeemed > 0 || invoice.rewards.balance > 0) && <div className="pb-coins">
        <span>Coins earned <b>{invoice.rewards.earned}</b></span><span>Used <b>{invoice.rewards.redeemed}</b></span><span>Available <b>{invoice.rewards.balance}</b></span>
      </div>}
      <div className="pb-terms">
        <p>Terms &amp; Conditions</p>
        <ol>
          <li>Please keep this bill for any exchange or return.</li>
          <li>Exchange and returns as per shop policy.</li>
          <li>Sales receipt · GST tax invoice not issued.</li>
        </ol>
      </div>
      <p className="pb-thanks">Thank you for shopping with us</p>
      {shop?.phone && <p className="pb-help">For help, call {shop.phone}</p>}
    </div>
    </div></div>
  </div></div>,document.body);
}
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`, { credentials: 'same-origin' });
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('The admin API is unavailable on this deployment. Check the Vercel function and environment settings.');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Unable to load data.');
  return body;
}

async function send<T>(path: string, body: unknown): Promise<T> {
  const csrf = await get<{ token: string }>('auth/csrf');
  const res = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token }, body: JSON.stringify(body) });
  if (!(res.headers.get('content-type') || '').includes('application/json')) throw new Error('The admin API is unavailable on this deployment.');
  const result = await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error || 'Operation failed.'), { status: res.status });
  return result;
}
const requestId = () => crypto.randomUUID();
const definitiveSaleError = (error: unknown) => [400, 403, 404, 409, 422].includes((error as { status?: number }).status || 0);
const salePayload = (sale: QueuedSale) => ({ expectedTotal:sale.expectedTotal, requestId: sale.requestId, lines: sale.lines,
  invoiceNumber: sale.invoiceNumber, invoiceDate: sale.invoiceDate, invoiceTime: sale.invoiceTime,
  customerName: sale.customerName, customerPhone: sale.customerPhone, customerEmail: sale.customerEmail || undefined,
  customerDateOfBirth: sale.customerDateOfBirth || undefined, birthdayOffersOptIn: sale.birthdayOffersOptIn,
  payments: sale.payments, cashTendered: sale.cashTendered,
  ...((sale.paymentMethod === 'credit' || sale.payments?.some(p => p.method === 'credit' && p.amount > 0)) ? { creditDueDate: sale.creditDueDate, creditWhatsAppOptIn: sale.creditWhatsAppOptIn } : {}),
  whatsappOptIn: sale.whatsappOptIn === true, redeemPoints: sale.redeemPoints, discount: sale.discount, tax: sale.tax, paymentMethod: sale.paymentMethod });

export { AddSupplierDialog };

export function SupplierPaymentDialog({ initialSupplierId, suppliers, balances, onClose, onPaid }: { initialSupplierId?: string; suppliers: Supplier[]; balances: Record<string, number>; onClose: () => void; onPaid: () => void }) {
  const [supplierId, setSupplierId] = useState(initialSupplierId || (suppliers[0]?.id || ''));
  const [amount, setAmount] = useState(() => {
    const initBal = initialSupplierId ? balances[initialSupplierId] : balances[suppliers[0]?.id || ''];
    return initBal && initBal > 0 ? String(initBal) : '';
  });
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const currentBal = supplierId ? (balances[supplierId] ?? 0) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supplierId || !Number(amount)) return;
    setBusy(true); setError('');
    try {
      await send('suppliers/payment', {
        requestId: requestId(),
        supplierId,
        amount: Number(amount),
        method,
        note: note.trim()
      });
      onPaid();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="editor-backdrop" onClick={onClose}>
      <div className="glass table-panel" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 94vw)', margin: 'auto', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Record Supplier Payment</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>×</button>
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Choose Supplier *
            <select
              required
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={supplierId}
              onChange={e => {
                setSupplierId(e.target.value);
                const b = balances[e.target.value];
                if (b && b > 0) setAmount(String(b));
              }}
            >
              <option value="">Select a supplier</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {balances[s.id] !== undefined ? `· Due: ${money(balances[s.id])}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="notice" style={{ margin: '4px 0', padding: '10px 14px', background: 'var(--accent-bg)', borderRadius: 8 }}>
            Outstanding Balance: <strong style={{ color: currentBal > 0 ? '#b65145' : 'var(--accent)' }}>{money(currentBal)}</strong>
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Payment Amount ₹ *
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="Enter amount"
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Payment Method
            <select
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={method}
              onChange={e => setMethod(e.target.value as typeof method)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Reference / Note
            <input
              maxLength={300}
              placeholder="e.g. Bank transfer ref #12345 or bill settlement"
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button primary" disabled={busy || !supplierId || !Number(amount)}>{busy ? 'Saving…' : 'Record Payment'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function ReceiptItemsDialog({ receipt, onClose }: { receipt: Purchase; onClose: () => void }) {
  const lines = receipt.lines || [];
  return createPortal(
    <div className="editor-backdrop" onClick={onClose}>
      <div className="glass table-panel" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 94vw)', margin: 'auto', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Stock Receipt: {receipt.id}</h2>
            <small style={{ color: 'var(--muted)' }}>Supplier: {receipt.supplierName} · Invoice: {receipt.supplierInvoice}</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item / SKU</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Sale Price</th>
                <th>MRP</th>
                <th>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td><strong>{l.name || l.sku || 'Item'}</strong><small>{l.sku}</small></td>
                  <td>{l.quantity}</td>
                  <td>{money(l.unitCost)}</td>
                  <td>{money(l.salePrice)}</td>
                  <td>{money(l.mrp)}</td>
                  <td><strong>{money(l.stockValue ?? ((l.unitCost || 0) * (l.quantity || 0)))}</strong></td>
                </tr>
              ))}
              {!lines.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>No line items recorded for this receipt.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div>
            <span>Paid: <strong>{money(receipt.amountPaid)}</strong></span>
            <span style={{ marginLeft: 16 }}>Payable: <strong style={{ color: receipt.payable > 0 ? '#b65145' : 'var(--text)' }}>{money(receipt.payable)}</strong></span>
          </div>
          <strong style={{ fontSize: 16 }}>Total: {money(receipt.total)}</strong>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function CommerceView({ tab, role }: { tab: string; role?:string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sync, setSync] = useState<SyncRecord[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [productView, setProductView] = useState<'grid' | 'list'>('list');
  const [batchLabels, setBatchLabels] = useState(false);
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);
  const [productCreatedSuccess, setProductCreatedSuccess] = useState<{ product: Product; productNumber?: number } | null>(null);
  const [cart, setCart] = useState<{ product: Product; sku: string; quantity: number; price: number }[]>([]);
  const [payment, setPayment] = useState<'cash' | 'upi' | 'card' | 'credit' | 'split'>('cash');
  const [splitAmounts, setSplitAmounts] = useState<Record<string,string>>({});
  const [cashTendered, setCashTendered] = useState('');
  const paymentParts: PaymentPart[] = (['cash','upi','card','credit'] as const).map(method => ({ method, amount: Number(splitAmounts[method] || 0) })).filter(p => p.amount > 0);
  const hasCredit = payment === 'credit' || (payment === 'split' && Number(splitAmounts.credit) > 0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerDateOfBirth, setCustomerDateOfBirth] = useState('');
  const [birthdayOffersOptIn, setBirthdayOffersOptIn] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerDetailsOpen, setCustomerDetailsOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [editPurchase, setEditPurchase] = useState<{ kind: 'purchase' | 'order'; record: EditablePurchase } | null>(null);
  const [poPrint, setPoPrint] = useState<{ title: string; items: PrintableItem[] } | null>(null);
  const canManage = role !== 'cashier';
  const printPurchase = (title: string, lines: EditablePurchase['lines']) => {
    const items = purchasePrintItems(lines, products);
    if (!items.length) { setError('No catalog items on this purchase have barcodes to print yet.'); return; }
    setPoPrint({ title, items });
  };
  const [messageCustomer, setMessageCustomer] = useState<Customer | null>(null);
  const [customerSource, setCustomerSource] = useState<'all' | 'website' | 'pos'>('all');
  const [birthdayFilter, setBirthdayFilter] = useState('all');
  const [creditDueDate, setCreditDueDate] = useState(dueDateAfter(7));
  const [creditWhatsAppOptIn, setCreditWhatsAppOptIn] = useState(false);
  const [whatsappOptIn, setWhatsAppOptIn] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [billPreview, setBillPreview] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [offlineSales, setOfflineSales] = useState<QueuedSale[]>([]);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [stockDirection, setStockDirection] = useState<1 | -1>(1);
  const checkoutGuard = useRef(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [supplierBalances, setSupplierBalances] = useState<Record<string, number>>({});
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [showReceiveStock, setShowReceiveStock] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Purchase | null>(null);
  const [orderPayments, setOrderPayments] = useState<Record<string, string>>({});
  const [orderMethods, setOrderMethods] = useState<Record<string, 'cash' | 'upi' | 'card'>>({});
  const [receiveBusy, setReceiveBusy] = useState<string | null>(null);

  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('brothers-active-bill-20261119') || 'null');
      if (saved?.cart?.length && saved.cart.every((line: { product?: Product; quantity?: number }) => line.product?.id && Number.isInteger(line.quantity))) {
        setCart(saved.cart); setPayment(saved.payment || 'cash'); setDiscount(saved.discount || 0);
        setCustomerName(saved.customerName || ''); setCustomerPhone(saved.customerPhone || ''); setCustomerEmail(saved.customerEmail || '');
        setCustomerDateOfBirth(saved.customerDateOfBirth || ''); setBirthdayOffersOptIn(saved.birthdayOffersOptIn === true);
        setCreditDueDate(saved.creditDueDate || dueDateAfter(7)); setCreditWhatsAppOptIn(saved.creditWhatsAppOptIn === true);
        setWhatsAppOptIn(saved.whatsappOptIn === true); setSplitAmounts(saved.splitAmounts || {}); setCashTendered(saved.cashTendered || '');
        setCustomerDetailsOpen(Boolean(saved.customerPhone || saved.customerName)); setNotice('Your unfinished bill was restored. Review quantities and current prices before checkout.');
      }
    } catch { setError('The saved draft could not be recovered. Check pending bills in Sync before creating another sale.'); }
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady || checkoutBusy) return;
    try {
      if (!cart.length) localStorage.removeItem('brothers-active-bill-20261119');
      else localStorage.setItem('brothers-active-bill-20261119', JSON.stringify({ cart, payment, discount, customerName, customerPhone, customerEmail, customerDateOfBirth, birthdayOffersOptIn, creditDueDate, creditWhatsAppOptIn, whatsappOptIn, splitAmounts, cashTendered }));
    } catch { setError('Automatic draft saving is unavailable on this device. Hold the bill before leaving this page.'); }
  }, [draftReady, checkoutBusy, cart, payment, discount, customerName, customerPhone, customerEmail, customerDateOfBirth, birthdayOffersOptIn, creditDueDate, creditWhatsAppOptIn, whatsappOptIn, splitAmounts, cashTendered]);

  useEffect(() => {
    if (tab !== 'pos' || customerDialogOpen) return;
    const focusScanner = (event: KeyboardEvent) => { if (event.key === 'F2') { event.preventDefault(); scanRef.current?.focus(); scanRef.current?.select(); } };
    window.addEventListener('keydown', focusScanner);
    return () => window.removeEventListener('keydown', focusScanner);
  }, [tab, customerDialogOpen]);

  const [online,setOnline]=useState(navigator.onLine);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  async function recoverQueued(sale:QueuedSale){try{const result=await send<{state:string;invoiceId?:string}>('pos/recover',{requestId:sale.requestId});if(result.state==='posted'){await removeSale(sale.requestId);setNotice(`Already posted as ${result.invoiceId}. Find its receipt in Orders.`);}else{await recoverToHeld(sale);setHeld(await heldBills());setNotice('Moved to held bills. Open Billing / POS and resume it to review current stock and prices.');}await refreshOffline();}catch(e){setError((e as Error).message);}}
  function exportQueue(){const url=URL.createObjectURL(new Blob([JSON.stringify({format:'pos-pending-bills-v1',items:offlineSales},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='pos-pending-bills.json';link.click();URL.revokeObjectURL(url);}

  async function handleReceivePO(order: PurchaseOrder) {
    if (receiveBusy) return;
    setReceiveBusy(order.id);
    setError('');
    try {
      const amountPaid = Number(orderPayments[order.id] || 0);
      const method = orderMethods[order.id] || 'cash';
      await send('purchases/receive-order', {
        requestId: requestId(),
        orderId: order.id,
        amountPaid,
        paymentMethod: method
      });
      setNotice(`Purchase Order ${order.id} marked as received into inventory.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReceiveBusy(null);
    }
  }

  async function refreshOffline() {
    try { setOfflineSales(await queuedSales()); } catch { /* Private mode may disable IndexedDB. */ }
  }
  useEffect(() => {
    void refreshOffline();
    void heldBills().then(setHeld).catch(() => {});
    const sync = (reload = false) => void navigator.locks.request('brothers-pos-sale-sync', { ifAvailable: true }, async lock => {
      if (!lock) return;
      const result = await syncQueuedSales(async sale => { await send('pos/sale', salePayload(sale)); });
      void refreshOffline();
      if (result.sent || reload) await load();
      if (result.sent) setNotice(`${result.sent} queued bill(s) synced.`);
      if (result.review) setError(`${result.review} offline bill(s) need review.`);
    }).catch(() => {});
    const reconnect = () => sync(true);
    window.addEventListener('online', reconnect);
    if (navigator.onLine) sync();
    const timer = window.setInterval(() => { if (navigator.onLine) sync(); }, 30_000);
    return () => { window.removeEventListener('online', reconnect); window.clearInterval(timer); };
  }, [tab]);

  async function load(background = false) {
    if (!background) {
      setLoading(true);
      setError('');
    }
    const paths: Record<string, string[]> = { products: ['products'], pos: ['products', 'shop-details', 'customers', 'invoices'],
      inventory: ['products', 'movements'], orders: ['shop-details'], customers: ['customers'],
      suppliers: ['suppliers', 'purchases', 'products'],
      'purchase-orders': ['suppliers', 'products', 'purchase-orders', 'purchases'],
      reports: ['orders', 'invoices'], sync: ['sync-health'] };
    const wanted = background ? ['products', 'customers'] : paths[tab] || [];
    try {
      const values = await Promise.all(wanted.map(path => get<{ items?: unknown[] } & Shop>(path)));
      values.forEach((value, i) => { switch (wanted[i]) {
        case 'products': {
          const clean = ((value.items || []) as Product[]).filter(p => !isPreviewProduct(p));
          setProducts(clean);
          void cacheCatalog(clean).catch(() => {});
          break;
        }
        case 'orders': setOrders((value.items || []) as Order[]); break;
        case 'customers': setCustomers((value.items || []) as Customer[]); break;
        case 'suppliers': setSuppliers((value.items || []) as Supplier[]); break;
        case 'purchases': setPurchases((value.items || []) as Purchase[]); break;
        case 'purchase-orders': setPurchaseOrders((value.items || []) as PurchaseOrder[]); break;
        case 'movements': setMovements((value.items || []) as Movement[]); break;
        case 'invoices': setInvoices((value.items || []) as Invoice[]); break;
        case 'sync-health': setSync((value.items || []) as SyncRecord[]); break;
        case 'shop-details': setShop(value); break;
      }});
      if (tab === 'suppliers') {
        try {
          const balData = await get<{ items: { id: string; name: string; balance: number }[] }>('suppliers/balances');
          const map: Record<string, number> = {};
          for (const item of balData.items || []) map[item.id] = item.balance;
          setSupplierBalances(map);
        } catch { /* ignore */ }
      }
    } catch (error) {
      if (background) return;
      if (wanted.includes('products')) {
        try { const cached = (await cachedCatalog<Product>()).filter(p => !isPreviewProduct(p)); if (cached.length) { setProducts(cached); setNotice('Offline catalog loaded. Bills will queue until the connection returns.'); return; } }
        catch { /* No offline catalog available. */ }
      }
      setError((error as Error).message);
    }
    finally { if (!background) setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);
  useEffect(() => {
    if (tab !== 'products') return;
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && !selected && !creating) void load();
    };
    window.addEventListener('focus', refreshOnReturn);
    window.addEventListener('online', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      window.removeEventListener('online', refreshOnReturn);
    };
  }, [tab, selected, creating]);
  useEffect(() => {
    if (tab === 'customers') void get<Shop>('shop-details').then(setShop).catch(() => {});
    setMessageCustomer(null);
  }, [tab]);
  useEffect(() => {
    if (tab !== 'orders') return;
    const stream = new EventSource('/api/orders/stream');
    const refreshHistory = () => window.dispatchEvent(new Event('brothers-orders-updated'));
    stream.addEventListener('order-updated', refreshHistory);
    stream.addEventListener('new-order', () => {
      refreshHistory();
      setNewOrderCount(n => n + 1);
      setNotice('A new website order arrived.');
      void load();
      if (soundEnabled) {
        try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain();
          oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 660;
          gain.gain.value = 0.06; oscillator.start(); oscillator.stop(audio.currentTime + 0.18);
          oscillator.onended = () => void audio.close(); } catch { /* Browser denied audio. Badge still works. */ }
      }
    });
    return () => stream.close();
  }, [tab, soundEnabled]);
  const shownProducts = useMemo(() => {
    const raw = query.trim();
    const q = raw.toLowerCase();
    const cleanNum = raw.replace(/^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNum);
    const parsedNum = isNum ? parseInt(cleanNum, 10) : null;

    return products.filter(p => {
      if (isPreviewProduct(p)) return false;
      if (parsedNum !== null && p.productNumber === parsedNum) return true;
      return `${p.productNumber ? `#${p.productNumber}` : ''} ${p.name} ${p.sku} ${p.barcode || ''} ${p.category} ${p.variants.map(v => `${v.sku} ${v.barcode || ''}`).join(' ')}`
        .toLowerCase()
        .includes(q);
    });
  }, [products, query]);
  const stockRows = useMemo(() => availableStockRows(products), [products]);
  const stockByProduct = useMemo(() => {
    const totals = new Map<string, { beforeGst: number; gst: number; total: number }>();
    for (const row of stockRows) {
      const value = totals.get(row.productId) || { beforeGst: 0, gst: 0, total: 0 };
      value.beforeGst += row.baseValue;
      value.gst += row.gstValue;
      value.total += row.totalValue;
      totals.set(row.productId, value);
    }
    return totals;
  }, [stockRows]);
  const stockUnits = stockRows.reduce((sum, row) => sum + row.quantity, 0);
  const stockCostTotal = products.reduce((sum,p) => sum + stockCostValue(p),0);
  const stockRetailTotal = stockRows.reduce((sum, row) => sum + row.baseValue, 0);
  const stockGstTotal = stockRows.reduce((sum, row) => sum + row.gstValue, 0);
  const stockIncludingGst = stockRetailTotal + stockGstTotal;
  const billSubtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const today = shopDate();
  const shownCustomers = customers.filter(customer =>
    (customerSource === 'all' || customer.sources?.includes(customerSource)) &&
    `${customer.fullName} ${customer.phone} ${customer.email} ${displayBirthDate(customer.dateOfBirth)} ${customer.dateOfBirth}`.toLowerCase().includes(query.toLowerCase()) &&
    (birthdayFilter === 'all' || (birthdayFilter === 'today'
      ? customer.dateOfBirth.slice(5) === today.slice(5)
      : customer.dateOfBirth.slice(5, 7) === today.slice(5, 7))));
  function clearCustomer() {
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerDateOfBirth('');
    setBirthdayOffersOptIn(false); setWhatsAppOptIn(false); setCustomerDetailsOpen(false);
    setCreditDueDate(dueDateAfter(7)); setCreditWhatsAppOptIn(false); setCashTendered(''); setSplitAmounts({});
  }
  function scanOrFind() {
    const scanned = query.trim().toLowerCase();
    if (!scanned) return;
    for (const product of products) {
      const match = product.variants.find(v => v.sku?.toLowerCase() === scanned || v.barcode?.toLowerCase() === scanned);
      if (match) { addToCart(product, match.sku); setQuery(''); setNotice(`${product.name} added to the bill.`); return; }
      if (product.sku.toLowerCase() === scanned || product.barcode?.toLowerCase() === scanned) {
        const sku = product.variants.length === 1 ? product.variants[0].sku : product.variants.length ? '' : product.sku;
        if (sku) { addToCart(product, sku); setQuery(''); setNotice(`${product.name} added to the bill.`); return; }
      }
    }
    setError('No exact SKU or barcode match. Search by product name and choose a variant.');
  }
  async function act(path: string, body: unknown, message: string) {
    setError(''); setNotice('');
    try { const result = await send<Record<string, unknown>>(path, body); setNotice(message); await load(); return result; }
    catch (error) { setError((error as Error).message); return null; }
  }
  async function createPosProduct(input: NewProductInput) {
    const created = await act('products/create', input, 'Product added to the shared website catalog.');
    if (!created?.productId) return;
    setCreating(false);
    try {
      const catalog = await get<{ items: Product[] }>('products');
      const clean = catalog.items.filter(p => !isPreviewProduct(p));
      setProducts(clean);
      const product = clean.find(item => item.id === created.productId);
      if (product) {
        setProductCreatedSuccess({ product, productNumber: (created as any).productNumber || product.productNumber });
      }
      if (tab === 'pos' && product && product.stock > 0 && product.variants[0]) addToCart(product, product.variants[0].sku);
    } catch { setNotice('Product saved. Refresh the catalog to add it to the bill.'); }
  }
  async function saveProductEdit(product: Product, input: ProductEditInput) {
    setError(''); setNotice('');
    await send('products/patch', { requestId: requestId(), productId: product.id, patch: input.patch });
    if (input.stockAdjustments.length) {
      await send('inventory/adjust-batch', { requestId: requestId(), productId: product.id, adjustments: input.stockAdjustments });
    }
    setSelected(null);
    setNotice(input.stockAdjustments.length ? 'Product details and variant stock updated.' : 'Product details updated.');
    await load();
  }
  function addToCart(product: Product, sku: string) {
    const variant = product.variants.find(v => v.sku === sku);
    const available = variant?.stock ?? product.stock;
    const already = cart.find(line => line.product.id === product.id && line.sku === sku)?.quantity || 0;
    if (already >= available) { setError('No more stock is available for this variant.'); return; }
    setError(''); setCart(old => {
      const found = old.find(line => line.product.id === product.id && line.sku === sku);
      return found ? old.map(line => line === found ? { ...line, quantity: line.quantity + 1 } : line)
        : [...old, { product, sku, quantity: 1, price: product.customPrice ?? variant?.price ?? product.price }];
    });
  }
  function setCartQuantity(productId: string, sku: string, quantity: number) {
    const line = cart.find(item => item.product.id === productId && item.sku === sku);
    if (!line) return;
    const variant = line.product.variants.find(item => item.sku === sku);
    const available = variant?.stock ?? line.product.stock;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available) {
      setError(`Enter a quantity from 1 to ${available} for ${line.product.name}.`); return;
    }
    setError('');
    setCart(old => old.map(item => item.product.id === productId && item.sku === sku ? { ...item, quantity } : item));
  }
  async function completeSale(event: FormEvent) {
    event.preventDefault();
    if (checkoutGuard.current) return;
    if (!cart.length) return;
    const customerError = customerDetailsError(customerPhone, customerDateOfBirth);
    if (customerError) { setError(customerError); setCustomerDetailsOpen(true); setCustomerDialogOpen(true); return; }
    if (hasCredit && (!customerName.trim() || !customerPhone.trim())) {
      setError('Enter the customer name and mobile number for udhar.'); setCustomerDetailsOpen(true);
      if (!customerPhone.trim()) setCustomerDialogOpen(true); return;
    }
    if (hasCredit && (!validDueDate(creditDueDate) || creditDueDate < shopDate())) { setError('Choose a repayment due date today or later.'); return; }
    if (discount > billSubtotal) { setError('Discount cannot exceed the bill subtotal.'); return; }
    try { paymentBreakdown(Math.max(0, billSubtotal - discount), payment, payment === 'split' ? paymentParts : undefined, cashTendered ? Number(cashTendered) : undefined); } catch (e) { setError((e as Error).message); return; }
    const command: QueuedSale = { expectedTotal:Math.max(0,billSubtotal-discount), requestId: requestId(), lines: cart.map(line => ({ productId: line.product.id, sku: line.sku, quantity: line.quantity })),
      customerName, customerPhone, customerEmail, whatsappOptIn: Boolean(customerPhone.trim()) && whatsappOptIn,
      customerDateOfBirth, birthdayOffersOptIn,
      ...(hasCredit ? { creditDueDate, creditWhatsAppOptIn } : {}),
      payments: payment === 'split' ? paymentParts : undefined, cashTendered: cashTendered ? Number(cashTendered) : undefined, discount, paymentMethod: payment, queuedAt: new Date().toISOString(), state: 'pending' };
    checkoutGuard.current = true; setCheckoutBusy(true);
    try {
    try { await queueSale(command); try{localStorage.removeItem('brothers-active-bill-20261119');}catch{} await refreshOffline(); }
    catch { setError('Bill storage is unavailable on this device. Keep the bill open and retry.'); return; }
    if (!navigator.onLine) {
      setNotice('Bill queued offline with a provisional ID. It will sync on reconnect.'); setCart([]); setDiscount(0); clearCustomer();
      return;
    }
    try {
      const result = await send<{ invoiceId: string; orderId: string; total: number; billUrl: string; payments: PaymentPart[]; creditAmount: number; cashTendered: number; change: number }>('pos/sale', salePayload(command));
      await removeSale(command.requestId); await refreshOffline();
      setLastInvoice({ payments: result.payments, creditAmount: result.creditAmount, cashTendered: result.cashTendered, change: result.change, id: String(result.invoiceId), orderId: String(result.orderId), total: Number(result.total),
        lines: cart.map(line => ({ name: line.product.name, sku: line.sku, quantity: line.quantity, price: line.price })),
        customerName, customerPhone, channel: 'POS', paymentMethod: payment, kind: 'sales_receipt', subtotal: billSubtotal, discount, billUrl: result.billUrl, creditDueDate: hasCredit ? creditDueDate : undefined });
      setCart([]); setDiscount(0); clearCustomer();
      scanRef.current?.focus();
      setNotice('Sale recorded. The receipt has a secure bill link to share by SMS or WhatsApp.');
      await load();
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && [400, 403, 422, 423, 429].includes(status)) {
        await removeSale(command.requestId); await refreshOffline();
        setError((error as Error).message); return;
      }
      await queueSale({ ...command, state: (error as { status?: number }).status === 409 ? 'review' : 'pending',
        error: (error as Error).message });
      await refreshOffline();
      setError((error as { status?: number }).status === 409
        ? 'Stock conflict. This bill is saved for review and was not posted.'
        : 'Connection failed. The bill is saved locally and will retry with the same ID.');
      setCart([]); setDiscount(0); clearCustomer();
    }
    } finally { checkoutGuard.current = false; setCheckoutBusy(false); }
  }
  const heading: Record<string, [string, string]> = {
    products: ['Products', 'The website catalog, in your workspace.'], pos: ['Quick billing', 'Sell from the shared catalog and create one receipt.'],
    inventory: ['Inventory', 'Variant stock and recent movements from the same database.'], orders: ['Orders', 'Website and in-store orders together.'],
    customers: ['Customers', 'Existing website accounts and shop history.'], suppliers: ['Suppliers & purchases', 'Receive stock and track supplier payables.'],
    reports: ['Reports', 'A clear view of both sales channels.'],
    sync: ['Sync health', 'Delivery events and work needing attention.']
  };
  return <div className="commerce"><p className="notice" role="status">{online ? 'Online' : 'Offline — provisional bills only; stock and prices confirmed after reconnect'} · {offlineSales.length} pending bill(s) on this device</p>
    {tab !== 'suppliers' && tab !== 'pos' && tab !== 'purchase-orders' && (
      <div className="page-title">
        <div><span className="eyebrow">BROTHERS OUTFIT GALLERY</span><h1>{heading[tab]?.[0]}</h1><p>{heading[tab]?.[1]}</p></div>
        <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Refresh</button>
      </div>
    )}
    {loading && <div className="notice" role="status"><RefreshCw size={16} />Loading shared store data…</div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {notice && <div className="success-banner" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
    {tab === 'products' && <><div className="product-add-toolbar"><button className="button secondary" onClick={() => setBatchLabels(true)}><Printer size={18} />Print multiple product barcodes</button><a className="button primary" href={`${websiteProductsUrl}/new`} target="_blank" rel="noopener noreferrer"><Plus size={18} />Add new product</a><button className="button secondary" onClick={() => setCreating(true)}>Quick add in POS</button></div><div className="commerce-toolbar"><label className="field-search"><Search size={17} /><input placeholder="Search name, SKU or category" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="product-view-tools"><span>{shownProducts.length} products</span><div className="view-toggle" role="group" aria-label="Product view"><button type="button" className={productView === 'grid' ? 'active' : ''} onClick={() => setProductView('grid')} aria-pressed={productView === 'grid'}><LayoutGrid size={17} />Grid</button><button type="button" className={productView === 'list' ? 'active' : ''} onClick={() => setProductView('list')} aria-pressed={productView === 'list'}><List size={18} />List</button></div></div></div>
      <StockOverview productCount={products.length} units={stockUnits} beforeGst={stockRetailTotal} gst={stockGstTotal} includingGst={stockIncludingGst} /><div className={`commerce-grid product-view-${productView}`}>{shownProducts.map(product => <article className="glass product-tile" key={product.id}><div className="product-body"><div className="product-identity"><span className="eyebrow">{product.category || 'PRODUCT'}</span><h2>{product.productNumber ? <span className="product-no-badge">#{product.productNumber}</span> : null}{product.name}</h2><p>SKU {product.sku} · {product.variants.length || 1} variants</p><p>Barcode: <code>{product.barcode || '—'}</code></p></div><div className="product-bottom"><strong>{money(product.price)}</strong><span className={product.stock > 0 ? 'available' : 'unavailable'}>{product.stock > 0 ? `${product.stock} available` : 'Out of stock'}</span></div><div className="product-tile-valuation"><div><span>Stock before GST</span><strong>{money(stockByProduct.get(product.id)?.beforeGst)}</strong></div><div><span>GST on stock</span><strong>{money(stockByProduct.get(product.id)?.gst)}</strong></div><div className="product-tile-total"><span>Total stock value</span><strong>{money(stockByProduct.get(product.id)?.total)}</strong></div></div><details className="variant-stock"><summary>View stock by variant</summary><div className="variant-stock-list">{(product.variants.length ? product.variants : [{ sku: product.sku, barcode: product.barcode, stock: product.stock, price: product.price, size: 'Standard', color: '' }]).map(variant => <div key={variant.sku}><span><strong>{variant.size || 'Standard'} {variant.color || ''}</strong><small>{variant.sku} · {money(variant.price)}<br />Barcode: {'barcode' in variant ? variant.barcode || '—' : '—'}</small></span><b className={variant.stock > 0 ? 'available' : 'unavailable'}>{variant.stock} in stock</b></div>)}</div></details><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><a className="button secondary" href={`${websiteProductsUrl}/${encodeURIComponent(product.id)}/edit`} target="_blank" rel="noopener noreferrer">Edit product <ArrowRight size={15} /></a><button className="button secondary" type="button" onClick={() => setSelected(product)}>Quick edit</button><button type="button" className="button secondary icon-button" title="Print Barcodes" onClick={() => setLabelProduct(product)}><Printer size={16} /></button></div></div></article>)}</div>
      {selected && <ProductEditor product={selected} onClose={() => setSelected(null)} onPrint={() => setLabelProduct(selected)} onSave={input => saveProductEdit(selected, input)} />}
    </>}
    {tab === 'pos' && (
      <VyaparBilling
        products={products.map(product => {
          const pending = offlineSales.flatMap(sale => sale.lines).filter(line => line.productId === product.id);
          if (!pending.length) return product;
          const remaining = (stock: number, sku?: string) => Math.max(0, stock -
            pending.filter(line => !sku || line.sku === sku).reduce((sum, line) => sum + line.quantity, 0));
          return { ...product, stock: remaining(product.stock), variants: product.variants.map(variant => ({ ...variant, stock: remaining(variant.stock, variant.sku) })) };
        })}
        customers={customers}
        role={role}
        initialInvoiceNumber={invoices.length ? Number(invoices[0].id.split('-').pop() || '0') + 1 : 1}
        heldBills={held}
        online={online}
        onHoldBill={async bill => {
          await holdBill(bill);
          setHeld(previous => [...previous.filter(item => item.requestId !== bill.requestId), bill]);
        }}
        onRemoveHeldBill={async id => {
          await removeHeldBill(id);
          setHeld(previous => previous.filter(item => item.requestId !== id));
        }}
        onSaveBill={async (sale, action) => {
          if (sale.redeemPoints && !navigator.onLine) throw new Error('Reconnect to redeem rewards.');
          const payload = salePayload(sale);
          type SaleResult = {
            invoiceId: string;
            orderId: string;
            total: number;
            billUrl: string;
            issuedAt: string;
            payments: PaymentPart[];
            creditAmount: number;
            cashTendered: number;
            change: number;
            rewards?: BillRewards;
            lines?: Invoice['lines'];
          };
          const result = await navigator.locks.request('brothers-pos-sale-sync', async () => {
            await queueSale(sale);
            try {
              if (!navigator.onLine) return null;
              const posted = await send<SaleResult>('pos/sale', payload);
              await removeSale(sale.requestId);
              return posted;
            } catch (err) {
              if (!definitiveSaleError(err)) return null;
              await removeSale(sale.requestId);
              throw err;
            }
          });
          await refreshOffline();
          const invoiceId = result?.invoiceId ?? `LOCAL-${sale.requestId}`;

          const inv: Invoice = {
            id: invoiceId,
            orderId: result?.orderId ?? '',
            total: result?.total ?? Number(sale.expectedTotal),
            payments: result?.payments ?? sale.payments,
            creditAmount: result?.creditAmount ?? sale.payments?.find(part => part.method === 'credit')?.amount,
            cashTendered: result?.cashTendered ?? sale.cashTendered,
            change: result?.change,
            rewards: result?.rewards,
            lines: result?.lines ?? sale.lines.map(l => ({
              name: l.name || l.sku,
              sku: l.sku,
              quantity: l.quantity,
              price: l.price,
              discount: l.discount,
              discountPercent: (l.price || 0) * l.quantity > 0 ? Math.round(Number(l.discount || 0) / ((l.price || 0) * l.quantity) * 10_000) / 100 : 0,
              tax: l.tax,
              amount: Math.round(((l.price || 0) * l.quantity - (l.discount || 0) + (l.tax || 0)) * 100) / 100
            })),
            customerName: sale.customerName,
            customerPhone: sale.customerPhone,
            customerDateOfBirth: sale.customerDateOfBirth,
            channel: 'POS',
            paymentMethod: sale.paymentMethod,
            kind: 'sales_receipt',
            subtotal: sale.lines.reduce((sum, l) => sum + (l.price || 0) * l.quantity, 0),
            discount: sale.discount + (result?.rewards?.redeemed ?? 0),
            tax: sale.tax,
            billUrl: result?.billUrl,
            issuedAt: { seconds: Math.floor(new Date(result?.issuedAt ?? sale.queuedAt).getTime() / 1000) },
            creditDueDate: sale.creditDueDate
          };

          if (action === 'share' && (!sale.redeemPoints || result)) {
            setLastInvoice(inv);
          }
          if (result) {
            setInvoices(previous => [inv, ...previous.filter(invoice => invoice.id !== inv.id)]);
            void load(true);
          }
          return invoiceId;
        }}
      />
    )}
    {tab === 'inventory' && <><StockCount products={products} onSaved={() => void load()} /><StockOverview productCount={products.length} units={stockUnits} beforeGst={stockRetailTotal} gst={stockGstTotal} includingGst={stockIncludingGst} /><div className="glass table-panel"><div className="commerce-toolbar"><h2>Stock value by product</h2><label className="field-search"><Search size={17} /><input placeholder="Search product, Product #, or SKU" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="table-wrap valuation-table"><table><thead><tr><th>Product</th><th>Product #</th><th>Barcode / SKU</th><th>Available quantity</th><th>Selling price</th><th>Stock cost value</th><th>Before GST</th><th>GST on stock</th><th>Total with GST</th><th>Action</th></tr></thead><tbody>{shownProducts.map(product => <tr key={product.id}><td><strong>{product.name}</strong></td><td><span className="product-no-badge">{product.productNumber ? `#${product.productNumber}` : '—'}</span></td><td><code>{product.barcode || product.sku}</code></td><td>{product.stock.toLocaleString('en-IN')}</td><td>{money(product.price)}</td><td><strong>{money(stockCostValue(product))}</strong></td><td><strong>{money(stockByProduct.get(product.id)?.beforeGst)}</strong></td><td>{money(stockByProduct.get(product.id)?.gst)}</td><td><strong>{money(stockByProduct.get(product.id)?.total)}</strong></td><td><button type="button" className="button secondary sm" title="Print Barcode" onClick={() => setLabelProduct(product)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Printer size={14} /> Print</button></td></tr>)}</tbody></table></div></div><div className="glass table-panel"><h2>Adjust stock</h2><form className="stock-form" onSubmit={async event => { event.preventDefault(); const target = event.currentTarget; const form = new FormData(target); const result = await act('inventory/adjust', { requestId: requestId(), productId: String(form.get('productId')), sku: String(form.get('sku')), delta: stockDirection * Number(form.get('delta')), reason: String(form.get('reason')), note: String(form.get('note') || '') }, 'Stock movement recorded.'); if (result) { target.reset(); setSelected(null); } }}>
      <label>Product<select name="productId" required value={selected?.id || ''} onChange={e => setSelected(products.find(p => p.id === e.target.value) || null)}><option value="">Select product</option>{products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Variant<select name="sku" required><option value="">Select SKU</option>{(selected?.variants.length ? selected.variants : selected ? [{ sku: selected.sku, stock: selected.stock }] : []).map(v => <option value={v.sku} key={v.sku}>{v.sku} · {v.stock} available</option>)}</select></label>
      <label>Quantity change<div className="stock-direction"><button type="button" className={stockDirection === 1 ? 'active' : ''} aria-label="Add stock" aria-pressed={stockDirection === 1} onClick={() => setStockDirection(1)}>+</button><button type="button" className={stockDirection === -1 ? 'active' : ''} aria-label="Remove stock" aria-pressed={stockDirection === -1} onClick={() => setStockDirection(-1)}>−</button><input name="delta" type="number" min="1" step="1" required placeholder="Quantity" /></div></label>
      <label>Reason<select name="reason"><option value="purchase">Purchase received</option><option value="adjustment">Stock adjustment</option><option value="damage">Damage</option><option value="return">Accepted return</option></select></label>
      <label>Note<input name="note" maxLength={500} placeholder="Why this changed" /></label><button className="button primary">Record movement</button></form></div>
      <div className="glass table-panel"><h2>Recent stock movements</h2><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Change</th><th>Reason</th><th>Source</th><th>After</th></tr></thead><tbody>{movements.map(row => <tr key={row.id}><td>{row.sku || '—'}</td><td className={Number(row.deltaChange) < 0 ? 'unavailable' : 'available'}>{Number(row.deltaChange) > 0 ? '+' : ''}{row.deltaChange}</td><td>{row.reason || '—'}</td><td>{row.source || '—'}</td><td>{row.stockAfter ?? '—'}</td></tr>)}</tbody></table></div></div></>}
    {tab === 'orders' && <BillHistory role={role} onInvoice={invoice => setLastInvoice(invoice)} />}
    {tab === 'customers' && role !== 'cashier' && <CustomerRewardsSettings />}
    {tab === 'customers' && <div className="glass table-panel"><div className="commerce-toolbar customer-toolbar">
      <label className="field-search"><Search size={16} /><input placeholder="Search customer" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="birthday-filter">Source<select value={customerSource} onChange={event => setCustomerSource(event.target.value as typeof customerSource)}><option value="all">All sources</option><option value="website">Website</option><option value="pos">POS</option></select></label>
      <label className="birthday-filter">Birthdays<select aria-label="Birthday filter" value={birthdayFilter} onChange={event => setBirthdayFilter(event.target.value)}><option value="all">All customers</option><option value="today">Today</option><option value="month">This month</option></select></label>
      <span>{shownCustomers.length} of {customers.length} profiles</span></div>
      <p className="microcopy">Choose WhatsApp in the Action column to prepare a message. You review the draft and send it from your own WhatsApp account.</p>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Mobile number</th><th>Email</th><th>Date of birth</th><th>Birthday offers</th><th>Coins</th><th>Action</th></tr></thead><tbody>{shownCustomers.map(customer => <tr key={customer.id}>
        <td>{customer.fullName || '—'}</td><td>{customer.phone || '—'}</td><td>{customer.email || '—'}</td>
        <td>{displayBirthDate(customer.dateOfBirth)}{customer.dateOfBirth && customer.dateOfBirth.slice(5) === today.slice(5) && <small className="birthday-today">Birthday today</small>}</td>
        <td><span className={customer.birthdayOffersOptIn ? 'credit-green' : 'muted'}>{customer.birthdayOffersOptIn ? 'Opted in' : 'Not opted in'}</span></td>
        <td><strong>{(customer.coinBalance ?? 0).toLocaleString('en-IN')} coins</strong><small>{customer.rewardRule ? `${customer.rewardRule.rate}% on every bill` : 'Default earn rate'}</small>{role !== 'cashier' && (customer.coinBalance ?? 0) > 0 && mobileNumber(customer.phone) && <button type="button" className="button secondary sm coin-reset-button" onClick={() => { const choice = askCoinReset(customer); if (choice) void act('customers/coins/reset', { requestId: requestId(), phone: customer.phone, ...(choice.coins ? { coins: choice.coins } : {}) }, choice.label); }}><RefreshCw size={13} />Reset coins</button>}</td>
        <td><button type="button" className="button secondary" onClick={()=>{history.pushState(null,'',`/orders?phone=${encodeURIComponent(customer.phone)}`);window.dispatchEvent(new PopStateEvent('popstate'));}}>Bills</button><button type="button" className="button secondary" disabled={role==='cashier' || !mobileNumber(customer.phone)} onClick={() => setEditCustomer(customer)}>Edit</button><button type="button" className="button secondary customer-whatsapp-action" disabled={!mobileNumber(customer.phone)} onClick={() => setMessageCustomer(customer)} aria-label={`WhatsApp ${customer.fullName || customer.phone || 'customer'}`}><MessageCircle size={16} />WhatsApp</button>{canManage && <button type="button" className="button secondary danger-action" disabled={!customer.sources?.includes('pos') || !customer.customerKey} title={customer.sources?.includes('pos') ? 'Delete this POS customer profile' : 'Website accounts are managed on the website'} onClick={() => setDeleteCustomer(customer)} aria-label={`Delete ${customer.fullName || customer.phone || 'customer'}`}>Delete</button>}{!mobileNumber(customer.phone) && <small>Valid mobile number needed</small>}</td>
      </tr>)}{shownCustomers.length === 0 && <tr><td colSpan={7}>No customers match the selected filters.</td></tr>}</tbody></table></div></div>}
    {tab === 'purchase-orders' && <>
      <PurchaseReceive mode="order" products={products} suppliers={suppliers} onSuppliersChanged={() => void load()} receive={async input => {
        await send('purchases/receive', input);
        await load();
      }} />
        {/* Direct show Purchase Orders */}
        <div className="glass table-panel">
          <div className="commerce-toolbar">
            <div>
              <h2>Purchase Orders ({purchaseOrders.length})</h2>
              <span className="microcopy" style={{ margin: 0 }}>Stock and supplier payment are recorded when the PO is created.</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Reference / Invoice</th>
                  <th>Order Total</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map(order => (
                  <tr key={order.id}>
                    <td><strong>{order.id}</strong>
                      {!!order.lines?.length && <details><summary>Items ({order.lines.length})</summary>
                        <ul>{order.lines.map((line, index) => <li key={index}>
                          {line.name || line.sku} · {line.quantity} × {money(line.unitCost ?? 0)}
                        </li>)}</ul>
                      </details>}
                    </td>
                    <td>{order.supplierName}</td>
                    <td>{order.supplierInvoice}{order.supplierInvoiceDate && <small>{order.supplierInvoiceDate}</small>}</td>
                    <td><strong>{money(order.total)}</strong>{order.status === 'received' && order.amountPaid !== undefined && order.payable !== undefined && <small>Paid {money(order.amountPaid)} · Balance {money(order.payable)}</small>}</td>
                    <td>
                      <span className="pill" style={order.status === 'received' ? { background: '#24694022', color: '#246940' } : { background: '#d4a84f22', color: '#d4a84f' }}>
                        {order.status === 'received' ? 'Completed' : 'Legacy order · Awaiting Stock'}
                      </span>
                    </td>
                    <td>
                      {order.status === 'ordered' ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            min="0"
                            max={order.total}
                            step="0.01"
                            placeholder="Amount paid ₹"
                            style={{ width: 110, minHeight: 34, padding: '4px 8px', fontSize: 13 }}
                            value={orderPayments[order.id] || ''}
                            onChange={e => setOrderPayments(prev => ({ ...prev, [order.id]: e.target.value }))}
                          />
                          <select
                            style={{ minHeight: 34, padding: '4px 6px', fontSize: 12 }}
                            value={orderMethods[order.id] || 'cash'}
                            onChange={e => setOrderMethods(prev => ({ ...prev, [order.id]: e.target.value as any }))}
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                          </select>
                          <button
                            type="button"
                            className="button primary"
                            style={{ minHeight: 34, padding: '6px 12px', fontSize: 12 }}
                            disabled={receiveBusy === order.id}
                            onClick={() => void handleReceivePO(order)}
                          >
                            {receiveBusy === order.id ? 'Receiving…' : 'Mark Received'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Stock Added</span>
                      )}
                      {(() => { const receipt = order.purchaseId ? purchases.find(p => p.id === order.purchaseId) : undefined; const small = { minHeight: 30, padding: '4px 10px', fontSize: 11 };
                        return <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          {canManage && order.status === 'ordered' && <button type="button" className="button secondary" style={small} onClick={() => setEditPurchase({ kind: 'order', record: order })}>Edit PO</button>}
                          {canManage && receipt && <button type="button" className="button secondary" style={small} onClick={() => setEditPurchase({ kind: 'purchase', record: { ...receipt, supplierInvoice: `${receipt.supplierInvoice} · ${order.id}` } })}>Edit PO</button>}
                          <button type="button" className="button secondary" style={small} onClick={() => printPurchase(`Print barcodes · ${order.supplierInvoice}`, receipt?.lines ?? order.lines)}><Printer size={13} /> Print barcodes</button>
                        </div>; })()}
                    </td>
                  </tr>
                ))}
                {!purchaseOrders.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No purchase orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

    </>}
    {tab === 'suppliers' && (
      <>
        <div className="page-title" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <span className="eyebrow">PROCUREMENT & VENDOR MANAGEMENT</span>
            <h1 style={{ margin: '8px 0 6px' }}>Suppliers & Purchases</h1>
            <p>Stock receipts, vendor invoices and payment settlements.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="button primary" onClick={() => setAddSupplierOpen(true)}>
              <Plus size={16} /> Add Supplier
            </button>
            <button type="button" className="button secondary" onClick={() => { setPaymentSupplierId(''); setPaymentModalOpen(true); }}>
              <IndianRupee size={16} /> Supplier Payment
            </button>
            <button type="button" className="button secondary" onClick={() => setShowReceiveStock(v => !v)}>
              <PackagePlus size={16} /> {showReceiveStock ? 'Hide Stock Form' : 'Receive Stock'}
            </button>
            <button type="button" className="button secondary" onClick={() => void load()} disabled={loading} title="Refresh">
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {showReceiveStock && (
          <div style={{ marginBottom: 20 }}>
            <PurchaseReceive
              products={products}
              suppliers={suppliers}
              onSuppliersChanged={() => void load()}
              receive={async input => {
                await send('purchases/receive', input);
                await load();
                setShowReceiveStock(false);
              }}
            />
          </div>
        )}

        {/* Direct show Stock Receipts */}
        <div className="glass table-panel">
          <div className="commerce-toolbar">
            <div>
              <h2>Stock Receipts ({purchases.length})</h2>
              <span className="microcopy" style={{ margin: 0 }}>Goods received into shop inventory with costs & payable balances</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt ID</th>
                  <th>Supplier</th>
                  <th>Supplier Invoice</th>
                  <th>Total Cost</th>
                  <th>Amount Paid</th>
                  <th>Payable Balance</th>
                  <th>Status</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.id}</strong></td>
                    <td>{p.supplierName}</td>
                    <td>{p.supplierInvoice}</td>
                    <td><strong>{money(p.total)}</strong></td>
                    <td>{money(p.amountPaid)}</td>
                    <td>
                      <strong style={{ color: p.payable > 0 ? '#b65145' : 'var(--text)' }}>
                        {money(p.payable)}
                      </strong>
                    </td>
                    <td>
                      <span className="pill" style={{ background: '#24694022', color: '#246940' }}>
                        Received
                      </span>
                    </td>
                    <td>
                      {p.lines?.length ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="button secondary" style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }} onClick={() => setSelectedReceipt(p)}>
                            <Eye size={13} /> {p.lines.length} items
                          </button>
                          {canManage && <button type="button" className="button secondary" style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditPurchase({ kind: 'purchase', record: p })}>Edit</button>}
                          <button type="button" className="button secondary" style={{ minHeight: 30, padding: '4px 10px', fontSize: 11 }} onClick={() => printPurchase(`Print barcodes · ${p.supplierInvoice}`, p.lines)}><Printer size={13} /> Barcodes</button>
                        </div>
                      ) : (
                        <small style={{ color: 'var(--muted)' }}>Recorded</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!purchases.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No stock receipts recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Suppliers Directory & Balances */}
        <div className="glass table-panel">
          <div className="commerce-toolbar">
            <div>
              <h2>Suppliers Directory ({suppliers.length})</h2>
              <span className="microcopy" style={{ margin: 0 }}>Active vendor accounts and outstanding ledger balances</span>
            </div>
            <button type="button" className="button secondary" onClick={() => setAddSupplierOpen(true)}>
              <Plus size={15} /> Add Supplier
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>GSTIN</th>
                  <th>Outstanding Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(s => {
                  const bal = supplierBalances[s.id] ?? 0;
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.email || '—'}</td>
                      <td>{s.gstin || '—'}</td>
                      <td>
                        <strong style={{ color: bal > 0 ? '#b65145' : 'var(--text)' }}>
                          {money(bal)}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ minHeight: 32, padding: '4px 12px', fontSize: 12 }}
                          onClick={() => { setPaymentSupplierId(s.id); setPaymentModalOpen(true); }}
                        >
                          <IndianRupee size={13} /> Pay
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!suppliers.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No suppliers added yet. Click "+ Add Supplier" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
    {tab === 'reports' && <><div className="stats-grid">{[{ label: 'Website sales', value: orders.filter(o => o.createdBy !== 'admin-pos' && o.status !== 'Cancelled').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) },
      { label: 'POS sales', value: orders.filter(o => o.createdBy === 'admin-pos' && o.status !== 'Cancelled').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) },
      { label: 'Invoices', value: invoices.length }, { label: 'Recent orders', value: orders.length }].map((card, index) => <div className="glass stat-card" key={card.label}><span>{card.label}</span><strong>{index < 2 ? money(card.value) : card.value}</strong><small>From recent loaded records only</small></div>)}</div><div className="notice"><FileDown size={17} />This overview is limited to the most recent 80 orders. Accounting exports require a full indexed date-range query.</div></>}
    {tab === 'sync' && <><div className="glass table-panel"><h2>Offline bills on this device · {offlineSales.length}</h2><button className="button secondary" onClick={exportQueue} disabled={!offlineSales.length}>Export pending bills</button><p>Restoring first checks the server. Posted sales stay posted; unposted references are locked before returning them to held bills.</p>{offlineSales.map(sale => <div className="source-row" key={sale.requestId}><span className="row-number">{sale.state}</span><div><strong>{sale.requestId}</strong><small>{sale.lines.length} lines · queued {new Date(sale.queuedAt).toLocaleString('en-IN')}</small></div><span>{sale.error || ''}</span><button className="button secondary" disabled={!online} onClick={()=>void recoverQueued(sale)}>Check result / restore for editing</button></div>)}{!offlineSales.length && <p>No offline bills on this device.</p>}</div><div className="glass table-panel"><h2>Recent sync events</h2><div className="table-wrap"><table><thead><tr><th>Event</th><th>Source</th><th>Invoice</th><th>Status</th><th>Retries</th><th>Action</th></tr></thead><tbody>{sync.map(row => <tr key={row.id}><td>{row.event || '—'}</td><td>{row.source || '—'}</td><td>{row.invoiceId || '—'}</td><td><span className="source-tag">{row.status || '—'}</span><small>{row.error || row.providerMessageId || ''}</small></td><td>{row.retryCount ?? 0}</td><td>{['failed', 'awaiting_provider'].includes(row.status || '') && <button className="text-button" onClick={() => void act('sync/retry', { requestId: requestId(), eventId: row.id }, 'Delivery retry processed.')}>Retry</button>}</td></tr>)}</tbody></table></div>{!sync.length && <p>No server sync events yet.</p>}<p className="microcopy">WhatsApp delivery needs Meta credentials and a document template. Unknown outcomes require provider review before another send.</p></div></>}
    {creating && <ProductFormDialog onClose={() => setCreating(false)} onCreate={createPosProduct} />}
    {batchLabels && <BarcodeBatch products={products} onClose={() => setBatchLabels(false)} />}
    {labelProduct && <BarcodeLabel product={labelProduct} onClose={() => setLabelProduct(null)} />}
    {productCreatedSuccess && (
      <div className="editor-backdrop" onClick={() => setProductCreatedSuccess(null)}>
        <div className="editor glass" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, textAlign: 'center', padding: '24px 20px' }}>
          <button className="editor-close" type="button" onClick={() => setProductCreatedSuccess(null)}>×</button>
          <div style={{ display: 'inline-flex', padding: 12, background: 'rgba(46, 204, 113, 0.15)', borderRadius: '50%', color: '#2ecc71', marginBottom: 12 }}>
            <Check size={28} />
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>Product Created Successfully!</h2>
          <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
            Assigned permanent sequential product number:
          </p>
          <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--line)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--gold)', marginBottom: 4 }}>
              #{productCreatedSuccess.productNumber || productCreatedSuccess.product.productNumber || '—'}
            </div>
            <strong style={{ fontSize: 16, display: 'block' }}>{productCreatedSuccess.product.name}</strong>
            <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
              Barcode: {productCreatedSuccess.product.barcode || productCreatedSuccess.product.variants[0]?.barcode || '—'}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                const prod = productCreatedSuccess.product;
                setProductCreatedSuccess(null);
                setLabelProduct(prod);
              }}
            >
              <Printer size={16} /> Print Barcode Labels
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setProductCreatedSuccess(null)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )}
    {tab === 'pos' && customerDialogOpen && <CustomerPhoneDialog value={{ phone: customerPhone, dateOfBirth: customerDateOfBirth, birthdayOffersOptIn }}
      onClose={() => setCustomerDialogOpen(false)} onSave={details => {
        if (mobileNumber(details.phone) !== mobileNumber(customerPhone)) { setCreditWhatsAppOptIn(false); setWhatsAppOptIn(false); }
        if (details.fullName) setCustomerName(details.fullName); if (details.email) setCustomerEmail(details.email);
        setCustomerPhone(details.phone); setCustomerDateOfBirth(details.dateOfBirth); setBirthdayOffersOptIn(details.birthdayOffersOptIn);
        setCustomerDialogOpen(false); setCustomerDetailsOpen(true); setError('');
      }} />}
    {tab === 'customers' && editCustomer && <CustomerEditor customer={editCustomer} onClose={() => setEditCustomer(null)} onSaved={() => { setEditCustomer(null); void load(); }} />}
    {tab === 'customers' && messageCustomer && <CustomerWhatsAppDialog customer={messageCustomer} shopName={shop?.name || 'Brothers Outfit Gallery'} onClose={() => setMessageCustomer(null)} />}
    {addSupplierOpen && <AddSupplierDialog onClose={() => setAddSupplierOpen(false)} onCreated={() => { setNotice('Supplier added successfully.'); void load(); }} />}
    {paymentModalOpen && <SupplierPaymentDialog initialSupplierId={paymentSupplierId} suppliers={suppliers} balances={supplierBalances} onClose={() => setPaymentModalOpen(false)} onPaid={() => { setNotice('Supplier payment recorded successfully.'); void load(); }} />}
    {selectedReceipt && <ReceiptItemsDialog receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}
    {editPurchase && <PurchaseEditDialog kind={editPurchase.kind} record={editPurchase.record} products={products} onClose={() => setEditPurchase(null)} onSaved={message => { setEditPurchase(null); setNotice(message); void load(); }} />}
    {poPrint && <BarcodePrintModal items={poPrint.items} title={poPrint.title} subtitle="Copies pre-filled with the units on this purchase." onClose={() => setPoPrint(null)} />}
    {tab === 'customers' && deleteCustomer && <ConfirmDialog title="Delete customer?" confirmLabel="Delete customer" onClose={() => setDeleteCustomer(null)}
      message={<><p style={{ marginTop: 0 }}>Delete <strong>{deleteCustomer.fullName || 'this customer'}</strong>{deleteCustomer.phone ? ` (${deleteCustomer.phone})` : ''} from the POS customer list?</p><p>Their past bills stay in bill history. Customers who still owe udhar cannot be deleted.{deleteCustomer.sources?.includes('website') ? ' Their website account is not affected.' : ''}</p></>}
      onConfirm={async () => { await send('customers/delete', { requestId: requestId(), customerKey: deleteCustomer.customerKey }); setNotice(`${deleteCustomer.fullName || 'Customer'} deleted.`); await load(); }} />}
    {billPreview && <ReceiptDialog preview shop={shop} onClose={() => setBillPreview(false)} invoice={{ id: 'PREVIEW', orderId: '', total: Math.max(0, billSubtotal - discount), subtotal: billSubtotal, discount, lines: cart.map(line => ({ name: line.product.name, sku: line.sku, quantity: line.quantity, price: line.price })), customerName, customerPhone, channel: 'POS', paymentMethod: payment, creditDueDate: hasCredit ? creditDueDate : undefined, kind: 'bill_preview' }} />}
    {lastInvoice && <ReceiptDialog invoice={lastInvoice} shop={shop} onClose={() => setLastInvoice(null)} />}
  </div>;
}
